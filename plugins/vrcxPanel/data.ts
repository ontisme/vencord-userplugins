/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { PluginNative } from "@utils/types";

import type { FeedEntry, FeedType, Friend, FriendGroup, UserInfo } from "./native";

const Native = VencordNative.pluginHelpers.VrcxPanel as PluginNative<typeof import("./native")>;

export type { FeedEntry, FeedType, Friend, FriendGroup, UserInfo };

// 按需:點好友時拉一次詳情(Info dialog)
export function fetchUserInfo(userId: string): Promise<UserInfo | null> {
    return Native.getUser(userId).catch(() => null);
}

let feed: FeedEntry[] = [];
let groups: FriendGroup[] = [];
let me: Friend | null = null;
let usingApi = false; // 好友側欄是否為 API 即時資料
let available = false;
let filter: FeedType | "all" = "all";
let feedSearch = "";     // Feed 搜尋(比對 User/Detail)
let friendSearch = "";   // 側欄好友搜尋(比對名稱)
const feedLimit = 500;

const listeners = new Set<() => void>();
let feedTimer: ReturnType<typeof setInterval> | null = null;
let refreshSeq = 0;

export function subscribe(fn: () => void): () => void {
    listeners.add(fn);
    return () => void listeners.delete(fn);
}
function emit() {
    listeners.forEach(fn => fn());
}

export function getFeed(): FeedEntry[] {
    const q = feedSearch.trim().toUpperCase();
    if (!q) return feed;
    return feed.filter(e =>
        e.displayName.toUpperCase().includes(q) || e.detail.toUpperCase().includes(q)
    );
}
export function getGroups(): FriendGroup[] {
    const q = friendSearch.trim().toLowerCase();
    if (!q) return groups;
    return groups
        .map(g => ({ ...g, friends: g.friends.filter(f => f.displayName.toLowerCase().includes(q)) }))
        .filter(g => g.friends.length > 0);
}
export function getMe(): Friend | null {
    if (!friendSearch.trim()) return me;
    return me && me.displayName.toLowerCase().includes(friendSearch.trim().toLowerCase()) ? me : null;
}
export function getFeedSearch(): string {
    return feedSearch;
}
export function getFriendSearch(): string {
    return friendSearch;
}
export function setFeedSearch(q: string) {
    feedSearch = q;
    emit();
}
export function setFriendSearch(q: string) {
    friendSearch = q;
    emit();
}
export function isUsingApi(): boolean {
    return usingApi;
}
export function isAvailable(): boolean {
    return available;
}
export function getFilter(): FeedType | "all" {
    return filter;
}

export function setFilter(f: FeedType | "all") {
    if (filter === f) return;
    filter = f;
    void refreshFeed();
}

export async function checkAvailable(): Promise<boolean> {
    try {
        available = (await Native.getStatus()).available;
    } catch {
        available = false;
    }
    return available;
}

// Feed 來自資料庫歷史事件(低成本、無帳號風險),可定期輪詢
async function refreshFeed() {
    const seq = ++refreshSeq;
    try {
        const f = await Native.getFeed({ limit: feedLimit, filter });
        if (seq !== refreshSeq) return;
        feed = f;
        available = true;
    } catch {
        if (seq !== refreshSeq) return;
        available = false;
    }
    emit();
}

// 好友側欄:按需(開面板時)用 VRChat API 拉一次即時資料。
// API 不可用時降級為資料庫推估(單一 ONLINE/OFFLINE 分組)。
async function loadFriends() {
    try {
        const live = await Native.getLiveFriends();
        if (live) {
            groups = live.groups.filter(g => g.friends.length > 0);
            me = live.me;
            usingApi = true;
            emit();
            return;
        }
    } catch { /* 降級 */ }

    // 降級:資料庫推估
    try {
        const friends = await Native.getFriends();
        const online = friends.filter(f => f.state === "online");
        const offline = friends.filter(f => f.state !== "online");
        groups = [
            { key: "online", title: "ONLINE", friends: online },
            { key: "offline", title: "OFFLINE", friends: offline }
        ].filter(g => g.friends.length > 0);
        me = null;
        usingApi = false;
    } catch { /* ignore */ }
    emit();
}

// 開面板:Feed 起輪詢(資料庫);好友只拉一次(API 按需)
export function start() {
    void checkAvailable().then(() => refreshFeed());
    void loadFriends();
    if (!feedTimer) feedTimer = setInterval(refreshFeed, 5000);
}

// 手動重新整理好友(供使用者點按重整;仍是按需、非背景輪詢)
export function reloadFriends() {
    void loadFriends();
}

export function stop() {
    if (feedTimer) { clearInterval(feedTimer); feedTimer = null; }
}
