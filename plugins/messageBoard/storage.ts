/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import * as DataStore from "@api/DataStore";
import { ChannelStore, RelationshipStore, UserGuildSettingsStore, UserStore } from "@webpack/common";

const META_KEY = "MessageBoard_meta";
const INDEX_KEY = "MessageBoard_index";
const msgKey = (channelId: string) => `MessageBoard_msgs_${channelId}`;

const PER_CHANNEL_CAP = 500;
const GLOBAL_CAP = 10000;
const FLUSH_INTERVAL = 5000;

export interface StoredMessage {
    id: string;
    channelId: string;
    guildId: string | null;
    authorId: string;
    authorName: string;
    authorAvatar: string | null;
    content: string;
    timestamp: number;
    attachmentCount: number;
}

export interface ChannelMeta {
    channelId: string;
    lastActivity: number;
    count: number;
}

interface Meta {
    blacklist: string[];
    lastOpened: number;
}

let meta: Meta = { blacklist: [], lastOpened: 0 };
let index: ChannelMeta[] = [];
let pending: StoredMessage[] = [];
const newActivityChannels = new Set<string>();
let flushTimer: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<() => void>();

function emit() {
    for (const cb of listeners) cb();
}

export function subscribe(cb: () => void): () => void {
    listeners.add(cb);
    return () => listeners.delete(cb);
}

export async function init(): Promise<void> {
    const storedMeta = await DataStore.get<Meta>(META_KEY);
    if (storedMeta && Array.isArray(storedMeta.blacklist)) meta = storedMeta;
    const storedIndex = await DataStore.get<ChannelMeta[]>(INDEX_KEY);
    if (Array.isArray(storedIndex)) index = storedIndex;
    if (!flushTimer) flushTimer = setInterval(() => { flush(); }, FLUSH_INTERVAL);
    emit();
}

export function stopFlushing(): void {
    if (flushTimer) {
        clearInterval(flushTimer);
        flushTimer = null;
    }
    flush();
}

function shouldStore(message: any): boolean {
    if (!message?.author?.id || !message.channel_id) return false;
    if (message.author.id === UserStore.getCurrentUser()?.id) return false;
    if (RelationshipStore.isBlocked(message.author.id)) return false;
    if (meta.blacklist.includes(message.channel_id)) return false;
    const channel = ChannelStore.getChannel(message.channel_id);
    if (!channel) return false;
    if (channel.guild_id) {
        if (UserGuildSettingsStore.isMuted(channel.guild_id)) return false;
        if (UserGuildSettingsStore.isGuildOrCategoryOrChannelMuted(channel.guild_id, channel.id)) return false;
    } else {
        if (UserGuildSettingsStore.isChannelMuted(null as any, channel.id)) return false;
    }
    return true;
}

export function handleMessage(message: any): void {
    try {
        if (!shouldStore(message)) return;
        pending.push({
            id: message.id,
            channelId: message.channel_id,
            guildId: message.guild_id ?? null,
            authorId: message.author.id,
            authorName: message.author.global_name ?? message.author.username,
            authorAvatar: message.author.avatar ?? null,
            content: message.content ?? "",
            timestamp: Date.parse(message.timestamp) || 0,
            attachmentCount: (message.attachments?.length ?? 0) + (message.embeds?.length ?? 0)
        });
        newActivityChannels.add(message.channel_id);
        emit();
    } catch {
        // 單則訊息處理失敗不得中斷後續訊息
    }
}

export async function flush(): Promise<void> {
    if (pending.length === 0) return;
    const batch = pending;
    pending = [];

    const byChannel = new Map<string, StoredMessage[]>();
    for (const m of batch) {
        const list = byChannel.get(m.channelId) ?? [];
        list.push(m);
        byChannel.set(m.channelId, list);
    }

    for (const [channelId, msgs] of byChannel) {
        await DataStore.update<StoredMessage[]>(msgKey(channelId), old => {
            const merged = [...(Array.isArray(old) ? old : []), ...msgs];
            return merged.slice(-PER_CHANNEL_CAP);
        });
        const entry = index.find(e => e.channelId === channelId);
        const lastTs = msgs[msgs.length - 1].timestamp;
        if (entry) {
            entry.lastActivity = lastTs;
            entry.count = Math.min(entry.count + msgs.length, PER_CHANNEL_CAP);
        } else {
            index.push({ channelId, lastActivity: lastTs, count: msgs.length });
        }
    }

    let total = index.reduce((sum, e) => sum + e.count, 0);
    if (total > GLOBAL_CAP) {
        const sorted = [...index].sort((a, b) => a.lastActivity - b.lastActivity);
        for (const victim of sorted) {
            if (total <= GLOBAL_CAP) break;
            await DataStore.del(msgKey(victim.channelId));
            index = index.filter(e => e.channelId !== victim.channelId);
            total -= victim.count;
        }
    }

    await DataStore.set(INDEX_KEY, index);
    emit();
}

export function getChannelIndex(): ChannelMeta[] {
    return [...index].sort((a, b) => b.lastActivity - a.lastActivity);
}

export async function readPage(channelId: string, before?: number, limit = 30): Promise<StoredMessage[]> {
    const all = await DataStore.get<StoredMessage[]>(msgKey(channelId)) ?? [];
    const filtered = before ? all.filter(m => m.timestamp < before) : all;
    return filtered.slice(-limit);
}

export function getBlacklist(): string[] {
    return meta.blacklist;
}

export async function addToBlacklist(channelId: string): Promise<void> {
    if (!meta.blacklist.includes(channelId)) {
        meta.blacklist = [...meta.blacklist, channelId];
        await DataStore.set(META_KEY, meta);
    }
    await DataStore.del(msgKey(channelId));
    index = index.filter(e => e.channelId !== channelId);
    newActivityChannels.delete(channelId);
    await DataStore.set(INDEX_KEY, index);
    emit();
}

export function getNewActivityCount(): number {
    return newActivityChannels.size;
}

export async function markOpened(): Promise<void> {
    newActivityChannels.clear();
    meta.lastOpened = Math.max(meta.lastOpened, ...index.map(e => e.lastActivity), 0);
    await DataStore.set(META_KEY, meta);
    emit();
}
