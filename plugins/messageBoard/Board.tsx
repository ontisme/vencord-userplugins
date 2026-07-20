/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import ErrorBoundary from "@components/ErrorBoundary";
import { sendMessage } from "@utils/discord";
import { findByPropsLazy } from "@webpack";
import {
    ChannelRouter, ChannelStore, ContextMenuApi, GuildStore, Menu, moment,
    NavigationRouter, Parser, React, TextInput, Toasts, useEffect, useLayoutEffect,
    useReducer, useRef, UserStore, useState
} from "@webpack/common";

import { avatarUrl, channelIconUrl, guildIconUrl } from "../_shared/avatar";
import {
    addToBlacklist, ChannelMeta, flush, getChannelIndex, markOpened, readPage,
    StoredMessage, subscribe
} from "./storage";

const NotificationSettingsActions = findByPropsLazy("updateChannelOverrideSettings");

interface ChannelHeader {
    title: string;
    subtitle: string | null;
    iconUrl: string | null;
    initial: string;
}

function channelHeader(channelId: string): ChannelHeader {
    const channel = ChannelStore.getChannel(channelId);
    if (!channel) return { title: "未知頻道", subtitle: null, iconUrl: null, initial: "?" };
    if (channel.guild_id) {
        const guild = GuildStore.getGuild(channel.guild_id);
        return {
            title: "#" + channel.name,
            subtitle: guild?.name ?? null,
            iconUrl: guild ? guildIconUrl(channel.guild_id, guild.icon) : null,
            initial: (guild?.name ?? "#").slice(0, 1).toUpperCase()
        };
    }
    if (channel.name) {
        return {
            title: channel.name,
            subtitle: "群組訊息",
            iconUrl: channelIconUrl(channel.id, (channel as any).icon),
            initial: channel.name.slice(0, 1).toUpperCase()
        };
    }
    const userId = (channel as any).recipients?.[0];
    const user = userId ? UserStore.getUser(userId) : null;
    const name = (user as any)?.globalName ?? user?.username ?? "私訊";
    return {
        title: name,
        subtitle: "私人訊息",
        iconUrl: user ? avatarUrl(user.id, (user as any).avatar, 64) : null,
        initial: name.slice(0, 1).toUpperCase()
    };
}

function formatTime(ts: number): string {
    const m = moment(ts);
    return m.isSame(moment(), "day") ? m.format("HH:mm") : m.format("MM/DD HH:mm");
}

function renderContent(msg: StoredMessage): React.ReactNode {
    if (!msg.content) {
        return msg.attachmentCount > 0
            ? <span className="vc-msgboard-attachment">{`${msg.attachmentCount} 個附件`}</span>
            : null;
    }
    try {
        return Parser.parse(msg.content, true, { channelId: msg.channelId });
    } catch {
        return msg.content;
    }
}

function jumpTo(msg: StoredMessage): void {
    NavigationRouter.transitionTo(`/channels/${msg.guildId ?? "@me"}/${msg.channelId}/${msg.id}`);
}

function openChannelMenu(e: React.MouseEvent, channelId: string, guildId: string | null): void {
    e.preventDefault();
    e.stopPropagation();
    ContextMenuApi.openContextMenu(e, () => (
        <Menu.Menu navId="vc-msgboard-card-menu" onClose={ContextMenuApi.closeContextMenu}>
            <Menu.MenuItem
                id="vc-msgboard-mute"
                label="靜音此頻道"
                color="danger"
                action={() => {
                    NotificationSettingsActions.updateChannelOverrideSettings(
                        guildId ?? null,
                        channelId,
                        { muted: true }
                    );
                    addToBlacklist(channelId);
                }}
            />
            <Menu.MenuItem
                id="vc-msgboard-hide"
                label="僅從動態磚隱藏"
                action={() => addToBlacklist(channelId)}
            />
        </Menu.Menu>
    ));
}

function JumpIcon() {
    return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" />
        </svg>
    );
}

function MessageRow({ msg, isNew }: { msg: StoredMessage; isNew: boolean; }) {
    const [replying, setReplying] = useState(false);
    const [text, setText] = useState("");

    async function submitReply() {
        if (!text.trim()) return;
        await sendMessage(msg.channelId, { content: text }, false, {
            messageReference: {
                channel_id: msg.channelId,
                message_id: msg.id,
                ...(msg.guildId ? { guild_id: msg.guildId } : {})
            },
            allowedMentions: { parse: ["users"], replied_user: true }
        } as any);
        setText("");
        setReplying(false);
        Toasts.show({ message: "已回覆", type: Toasts.Type.SUCCESS, id: Toasts.genId() });
    }

    return (
        <div
            className={"vc-msgboard-msg" + (replying ? " vc-msgboard-msg-replying" : "") + (isNew ? " vc-msgboard-msg-enter" : "")}
            onContextMenu={e => openChannelMenu(e, msg.channelId, msg.guildId)}
        >
            <img className="vc-msgboard-avatar" src={avatarUrl(msg.authorId, msg.authorAvatar, 64)} alt="" loading="lazy" />
            <div className="vc-msgboard-msg-main" onClick={() => setReplying(v => !v)}>
                <div className="vc-msgboard-msg-head">
                    <span className="vc-msgboard-author">{msg.authorName}</span>
                    <span className="vc-msgboard-time">{formatTime(msg.timestamp)}</span>
                </div>
                <div className="vc-msgboard-content">{renderContent(msg)}</div>
                {replying && (
                    <div className="vc-msgboard-reply" onClick={e => e.stopPropagation()}>
                        <TextInput
                            value={text}
                            onChange={setText}
                            placeholder="回覆此訊息,Enter 送出,Esc 取消"
                            autoFocus={true}
                            onKeyDown={(e: React.KeyboardEvent) => {
                                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submitReply(); }
                                if (e.key === "Escape") setReplying(false);
                            }}
                        />
                    </div>
                )}
            </div>
            <div
                className="vc-msgboard-jump"
                title="跳轉至訊息"
                onClick={e => { e.stopPropagation(); jumpTo(msg); }}
            >
                <JumpIcon />
            </div>
        </div>
    );
}

// 卡片可見性偵測:進入視窗(含 600px 前後緩衝)才回傳 true,離開後回 false。
// 用於虛擬化——不可見的卡片不渲染內容、不訂閱 store、不讀取訊息。
function useInView<T extends HTMLElement>(ref: React.RefObject<T | null>): boolean {
    const [inView, setInView] = useState(false);
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const io = new IntersectionObserver(
            entries => setInView(entries[0].isIntersecting),
            { root: null, rootMargin: "600px 0px", threshold: 0 }
        );
        io.observe(el);
        return () => io.disconnect();
    }, [ref]);
    return inView;
}

// 卡片內容:僅在可見時掛載,負責 readPage、store 訂閱、訊息動畫
function CardContent({ meta }: { meta: ChannelMeta; }) {
    const [messages, setMessages] = useState<StoredMessage[]>([]);
    const [exhausted, setExhausted] = useState(false);

    const seenIds = useRef<Set<string>>(new Set());
    const primed = useRef(false);
    const newIds = new Set<string>();
    if (primed.current) {
        for (const m of messages) if (!seenIds.current.has(m.id)) newIds.add(m.id);
    }
    useEffect(() => {
        seenIds.current = new Set(messages.map(m => m.id));
        if (messages.length > 0) primed.current = true;
    }, [messages]);

    useEffect(() => {
        readPage(meta.channelId).then(page => setMessages(page.reverse()));
    }, [meta.channelId, meta.lastActivity]);

    async function loadOlder() {
        const oldest = messages[messages.length - 1];
        if (!oldest) return;
        const page = await readPage(meta.channelId, oldest.timestamp);
        if (page.length === 0) {
            setExhausted(true);
            return;
        }
        setMessages([...messages, ...page.reverse()]);
    }

    return (
        <div className="vc-msgboard-card-body">
            {messages.map(m => <MessageRow key={m.id} msg={m} isNew={newIds.has(m.id)} />)}
            {!exhausted && messages.length >= 30 && (
                <button className="vc-msgboard-more" onClick={loadOlder}>載入更早的訊息</button>
            )}
        </div>
    );
}

function ChannelCard({ meta }: { meta: ChannelMeta; }) {
    const cardRef = useRef<HTMLDivElement>(null);
    const inView = useInView(cardRef);

    const channel = ChannelStore.getChannel(meta.channelId);
    const guildId = channel?.guild_id ?? null;
    const { title, subtitle, iconUrl, initial } = channelHeader(meta.channelId);

    return (
        <div className="vc-msgboard-card" data-cid={meta.channelId} ref={cardRef}>
            <div
                className="vc-msgboard-card-head"
                onClick={() => ChannelRouter.transitionToChannel(meta.channelId)}
                onContextMenu={e => openChannelMenu(e, meta.channelId, guildId)}
            >
                {iconUrl
                    ? <img className="vc-msgboard-card-icon" src={iconUrl} alt="" loading="lazy" />
                    : <span className="vc-msgboard-card-icon vc-msgboard-card-icon-fallback">{initial}</span>}
                <div className="vc-msgboard-card-titles">
                    <span className="vc-msgboard-card-title">{title}</span>
                    {subtitle && <span className="vc-msgboard-card-subtitle">{subtitle}</span>}
                </div>
            </div>
            {inView
                ? <CardContent meta={meta} />
                : <div className="vc-msgboard-card-placeholder" />}
        </div>
    );
}

// 卡片重排時的 FLIP 動畫:只對視窗可見範圍(含緩衝)內的卡片量測與動畫,
// 避免對上百張離屏卡片呼叫 getBoundingClientRect 造成 layout thrash
function useFlip(gridRef: React.RefObject<HTMLDivElement | null>, deps: unknown[]) {
    const prev = useRef<Map<string, DOMRect>>(new Map());

    useLayoutEffect(() => {
        const grid = gridRef.current;
        if (!grid) return;
        const viewTop = -400;
        const viewBottom = window.innerHeight + 400;
        const cards = Array.from(grid.querySelectorAll<HTMLElement>(".vc-msgboard-card"));
        const next = new Map<string, DOMRect>();

        for (const card of cards) {
            const { cid } = card.dataset;
            if (!cid) continue;
            const rect = card.getBoundingClientRect();
            if (rect.bottom < viewTop || rect.top > viewBottom) continue;
            next.set(cid, rect);
            const old = prev.current.get(cid);
            if (!old) continue;
            const dx = old.left - rect.left;
            const dy = old.top - rect.top;
            if (dx === 0 && dy === 0) continue;
            card.animate(
                [
                    { transform: `translate(${dx}px, ${dy}px)` },
                    { transform: "translate(0, 0)" }
                ],
                { duration: 320, easing: "cubic-bezier(0.22, 1, 0.36, 1)" }
            );
        }
        prev.current = next;
    }, deps);
}

function BoardInner() {
    const [, forceUpdate] = useReducer(x => x + 1, 0);
    const gridRef = useRef<HTMLDivElement>(null);

    // 節流:高流量時多則訊息合併為一次 rAF 重繪,避免每則訊息都重跑整個看板
    useEffect(() => {
        let scheduled = false;
        return subscribe(() => {
            if (scheduled) return;
            scheduled = true;
            requestAnimationFrame(() => {
                scheduled = false;
                forceUpdate();
            });
        });
    }, []);

    useEffect(() => {
        flush().then(() => markOpened());
    }, []);

    const channels = getChannelIndex();
    useFlip(gridRef, [channels.map(c => c.channelId).join(",")]);

    return (
        <div className="vc-msgboard-page">
            <div className="vc-msgboard-grid" ref={gridRef}>
                {channels.length === 0 && (
                    <div className="vc-msgboard-empty">
                        <div className="vc-msgboard-empty-title">目前還沒有訊息</div>
                        <div className="vc-msgboard-empty-sub">未靜音頻道的新訊息會自動出現在這裡</div>
                    </div>
                )}
                {channels.map(meta => <ChannelCard key={meta.channelId} meta={meta} />)}
            </div>
        </div>
    );
}

export const Board = ErrorBoundary.wrap(BoardInner, { noop: true });
