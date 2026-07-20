/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import * as DataStore from "@api/DataStore";

import { createListenerRegistry } from "../_shared/listeners";

const KEY = "FavoriteServers_data";

// 頂層項目:單一伺服器,或一個資料夾(內含多個伺服器)
export type RailItem =
    | { type: "guild"; id: string; }
    | { type: "folder"; id: string; name: string; color: number; guildIds: string[]; expanded: boolean; };

interface RailData {
    items: RailItem[];
}

let data: RailData = { items: [] };
const { subscribe, emit } = createListenerRegistry();
let persistTimer: ReturnType<typeof setTimeout> | null = null;

export { subscribe };

function persistSoon() {
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
        persistTimer = null;
        DataStore.set(KEY, data);
    }, 400);
}

export async function loadRail(): Promise<void> {
    const stored = await DataStore.get<RailData>(KEY);
    if (stored && Array.isArray(stored.items)) data = stored;
    emit();
}

export function getItems(): RailItem[] {
    return data.items;
}

// 產生穩定 id,不依賴亂數/時間(由呼叫端計數器提供)
let folderSeq = 0;
function nextFolderId(): string {
    folderSeq += 1;
    return `folder-${folderSeq}-${data.items.length}`;
}

export function isFavorite(guildId: string): boolean {
    return data.items.some(it =>
        (it.type === "guild" && it.id === guildId) ||
        (it.type === "folder" && it.guildIds.includes(guildId))
    );
}

export function addGuild(guildId: string): void {
    if (isFavorite(guildId)) return;
    data.items = [...data.items, { type: "guild", id: guildId }];
    emit();
    persistSoon();
}

export function removeGuild(guildId: string): void {
    data.items = data.items
        .filter(it => !(it.type === "guild" && it.id === guildId))
        .map(it => it.type === "folder"
            ? { ...it, guildIds: it.guildIds.filter(id => id !== guildId) }
            : it)
        .filter(it => !(it.type === "folder" && it.guildIds.length === 0));
    emit();
    persistSoon();
}

// 拖 guildA 到 guildB 上 -> 建立含兩者的資料夾
export function createFolderFrom(guildA: string, guildB: string): void {
    if (guildA === guildB) return;
    const id = nextFolderId();
    const folder: RailItem = { type: "folder", id, name: "資料夾", color: 0x5865f2, guildIds: [guildB, guildA], expanded: true };
    // 移除兩個原始頂層 guild 項,並在 guildB 原位插入資料夾
    const idxB = data.items.findIndex(it => it.type === "guild" && it.id === guildB);
    const cleaned = data.items.filter(it => !(it.type === "guild" && (it.id === guildA || it.id === guildB)));
    const insertAt = idxB === -1 ? cleaned.length : Math.min(idxB, cleaned.length);
    cleaned.splice(insertAt, 0, folder);
    data.items = cleaned;
    emit();
    persistSoon();
}

export function addGuildToFolder(guildId: string, folderId: string): void {
    // 先從其他位置移除該 guild
    let items = data.items
        .filter(it => !(it.type === "guild" && it.id === guildId))
        .map(it => it.type === "folder"
            ? { ...it, guildIds: it.guildIds.filter(id => id !== guildId) }
            : it);
    items = items.map(it =>
        it.type === "folder" && it.id === folderId && !it.guildIds.includes(guildId)
            ? { ...it, guildIds: [...it.guildIds, guildId] }
            : it
    ).filter(it => !(it.type === "folder" && it.guildIds.length === 0));
    data.items = items;
    emit();
    persistSoon();
}

// 把資料夾內的 guild 移出成為頂層項目
export function removeGuildFromFolder(guildId: string, folderId: string): void {
    const folderIdx = data.items.findIndex(it => it.type === "folder" && it.id === folderId);
    const items = data.items.map(it =>
        it.type === "folder" && it.id === folderId
            ? { ...it, guildIds: it.guildIds.filter(id => id !== guildId) }
            : it
    );
    const insertAt = folderIdx === -1 ? items.length : folderIdx + 1;
    items.splice(insertAt, 0, { type: "guild", id: guildId });
    data.items = items.filter(it => !(it.type === "folder" && it.guildIds.length === 0));
    emit();
    persistSoon();
}

export function reorderItem(fromId: string, toId: string): void {
    const from = data.items.findIndex(it => it.id === fromId);
    const to = data.items.findIndex(it => it.id === toId);
    if (from === -1 || to === -1 || from === to) return;
    const items = [...data.items];
    const [moved] = items.splice(from, 1);
    items.splice(items.findIndex(it => it.id === toId), 0, moved);
    data.items = items;
    emit();
    persistSoon();
}

export function toggleFolder(folderId: string): void {
    data.items = data.items.map(it =>
        it.type === "folder" && it.id === folderId ? { ...it, expanded: !it.expanded } : it
    );
    emit();
    persistSoon();
}

export function renameFolder(folderId: string, name: string): void {
    data.items = data.items.map(it =>
        it.type === "folder" && it.id === folderId ? { ...it, name } : it
    );
    emit();
    persistSoon();
}

export function deleteFolder(folderId: string): void {
    // 資料夾內的伺服器移回頂層
    const idx = data.items.findIndex(it => it.type === "folder" && it.id === folderId);
    if (idx === -1) return;
    const folder = data.items[idx] as Extract<RailItem, { type: "folder"; }>;
    const items = [...data.items];
    items.splice(idx, 1, ...folder.guildIds.map(id => ({ type: "guild" as const, id })));
    data.items = items;
    emit();
    persistSoon();
}

export function pruneInvalid(validGuildId: (id: string) => boolean): void {
    const items = data.items
        .filter(it => it.type !== "guild" || validGuildId(it.id))
        .map(it => it.type === "folder"
            ? { ...it, guildIds: it.guildIds.filter(validGuildId) }
            : it)
        .filter(it => !(it.type === "folder" && it.guildIds.length === 0));
    if (JSON.stringify(items) !== JSON.stringify(data.items)) {
        data.items = items;
        emit();
        persistSoon();
    }
}
