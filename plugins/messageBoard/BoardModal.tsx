/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import ErrorBoundary from "@components/ErrorBoundary";
import { sendMessage } from "@utils/discord";
import { findByPropsLazy } from "@webpack";
import {
    ChannelStore, closeModal, ContextMenuApi, GuildStore, Menu, Modal, moment,
    NavigationRouter, openModal, React, TextInput, Toasts, useEffect, useReducer,
    UserStore, useState
} from "@webpack/common";

import {
    addToBlacklist, ChannelMeta, flush, getChannelIndex, markOpened, readPage,
    StoredMessage, subscribe
} from "./storage";

const NotificationSettingsActions = findByPropsLazy("updateChannelOverrideSettings");

let currentModalKey: string | null = null;

function channelTitle(channelId: string): string {
    const channel = ChannelStore.getChannel(channelId);
    if (!channel) return "未知頻道";
    if (channel.guild_id) {
        const guild = GuildStore.getGuild(channel.guild_id);
        return (guild?.name ? guild.name + " " : "") + "#" + channel.name;
    }
    if (channel.name) return channel.name;
    const userId = (channel as any).recipients?.[0];
    const user = userId ? UserStore.getUser(userId) : null;
    return (user as any)?.globalName ?? user?.username ?? "私訊";
}

function jumpTo(msg: StoredMessage): void {
    if (currentModalKey) {
        closeModal(currentModalKey);
        currentModalKey = null;
    }
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
                        { [channelId]: { muted: true } }
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
        <div className="vc-msgboard-msg" onContextMenu={e => openChannelMenu(e, msg.channelId, msg.guildId)}>
            <div className="vc-msgboard-msg-head" onClick={() => setReplying(v => !v)}>
                <span className="vc-msgboard-author">{msg.authorName}</span>
                <span className="vc-msgboard-time">{moment(msg.timestamp).format("HH:mm")}</span>
                <span className="vc-msgboard-jump" onClick={e => { e.stopPropagation(); jumpTo(msg); }}>跳轉</span>
            </div>
            <div className="vc-msgboard-content" onClick={() => setReplying(v => !v)}>
                {msg.content || (msg.attachmentCount > 0 ? `[${msg.attachmentCount} 個附件]` : "")}
            </div>
            {replying && (
                <div className="vc-msgboard-reply">
                    <TextInput
                        value={text}
                        onChange={setText}
                        placeholder="輸入回覆,Enter 送出"
                        autoFocus={true}
                        onKeyDown={(e: React.KeyboardEvent) => {
                            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submitReply(); }
                            if (e.key === "Escape") setReplying(false);
                        }}
                    />
                </div>
            )}
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

    return (
        <div className="vc-msgboard-card">
            <div
                className="vc-msgboard-card-title"
                onContextMenu={e => openChannelMenu(e, meta.channelId, guildId)}
            >
                {channelTitle(meta.channelId)}
            </div>
            <div className="vc-msgboard-card-body">
                {messages.map(m => <MessageRow key={m.id} msg={m} />)}
                {!exhausted && messages.length >= 30 && (
                    <div className="vc-msgboard-more" onClick={loadOlder}>載入更早的訊息</div>
                )}
            </div>
        </div>
    );
}

function BoardInner() {
    const [, forceUpdate] = useReducer(x => x + 1, 0);
    useEffect(() => subscribe(forceUpdate), []);

    const channels = getChannelIndex();
    return (
        <div className="vc-msgboard-grid">
            {channels.length === 0 && (
                <div className="vc-msgboard-empty">尚無訊息,新訊息進來後會自動出現在這裡</div>
            )}
            {channels.map(meta => <ChannelCard key={meta.channelId} meta={meta} />)}
        </div>
    );
}

const Board = ErrorBoundary.wrap(BoardInner, { noop: true });

export function openBoard(): void {
    flush().then(() => markOpened());
    currentModalKey = openModal(props => (
        <Modal {...props} size="xxl" title="訊息動態磚">
            <Board />
        </Modal>
    ));
}
