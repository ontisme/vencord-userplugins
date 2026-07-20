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
    NavigationRouter, Parser, React, TextInput, Toasts, useEffect, useReducer,
    UserStore, useState
} from "@webpack/common";

import { avatarUrl } from "../_shared/avatar";
import {
    addToBlacklist, ChannelMeta, flush, getChannelIndex, markOpened, readPage,
    StoredMessage, subscribe
} from "./storage";

const NotificationSettingsActions = findByPropsLazy("updateChannelOverrideSettings");

function channelNames(channelId: string): { title: string; subtitle: string | null; } {
    const channel = ChannelStore.getChannel(channelId);
    if (!channel) return { title: "未知頻道", subtitle: null };
    if (channel.guild_id) {
        const guild = GuildStore.getGuild(channel.guild_id);
        return { title: "#" + channel.name, subtitle: guild?.name ?? null };
    }
    if (channel.name) return { title: channel.name, subtitle: "群組訊息" };
    const userId = (channel as any).recipients?.[0];
    const user = userId ? UserStore.getUser(userId) : null;
    return { title: (user as any)?.globalName ?? user?.username ?? "私訊", subtitle: "私人訊息" };
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

function MessageRow({ msg }: { msg: StoredMessage; }) {
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
            className={"vc-msgboard-msg" + (replying ? " vc-msgboard-msg-replying" : "")}
            onContextMenu={e => openChannelMenu(e, msg.channelId, msg.guildId)}
        >
            <img className="vc-msgboard-avatar" src={avatarUrl(msg.authorId, msg.authorAvatar, 64)} alt="" />
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

function ChannelCard({ meta }: { meta: ChannelMeta; }) {
    const [messages, setMessages] = useState<StoredMessage[]>([]);
    const [exhausted, setExhausted] = useState(false);

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

    const channel = ChannelStore.getChannel(meta.channelId);
    const guildId = channel?.guild_id ?? null;
    const { title, subtitle } = channelNames(meta.channelId);

    return (
        <div className="vc-msgboard-card">
            <div
                className="vc-msgboard-card-head"
                onClick={() => ChannelRouter.transitionToChannel(meta.channelId)}
                onContextMenu={e => openChannelMenu(e, meta.channelId, guildId)}
            >
                <div className="vc-msgboard-card-titles">
                    <span className="vc-msgboard-card-title">{title}</span>
                    {subtitle && <span className="vc-msgboard-card-subtitle">{subtitle}</span>}
                </div>
                <span className="vc-msgboard-card-count">{messages.length}</span>
            </div>
            <div className="vc-msgboard-card-body">
                {messages.map(m => <MessageRow key={m.id} msg={m} />)}
                {!exhausted && messages.length >= 30 && (
                    <button className="vc-msgboard-more" onClick={loadOlder}>載入更早的訊息</button>
                )}
            </div>
        </div>
    );
}

function BoardInner() {
    const [, forceUpdate] = useReducer(x => x + 1, 0);
    useEffect(() => subscribe(forceUpdate), []);
    useEffect(() => {
        flush().then(() => markOpened());
    }, []);

    const channels = getChannelIndex();
    return (
        <div className="vc-msgboard-page">
            <div className="vc-msgboard-grid">
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
