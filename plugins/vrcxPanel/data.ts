/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { PluginNative } from "@utils/types";

import type { FeedEntry, FeedType, Friend } from "./native";

const Native = VencordNative.pluginHelpers.VrcxPanel as PluginNative<typeof import("./native")>;

export type { FeedEntry, FeedType, Friend };

let feed: FeedEntry[] = [];
let friends: Friend[] = [];
let available = false;
let filter: FeedType | "all" = "all";
const feedLimit = 500;

const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;
// 每次 refresh 遞增;結果回來時若已非最新一輪則丟棄,避免慢查詢覆寫新資料
let refreshSeq = 0;

export function subscribe(fn: () => void): () => void {
    listeners.add(fn);
    return () => void listeners.delete(fn);
}
function emit() {
    listeners.forEach(fn => fn());
}

export function getFeed(): FeedEntry[] {
    return feed;
}
export function getFriends(): Friend[] {
    return friends;
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
    void refresh();
}

// 連線可讀時回傳 true(供好友頁掛載決定是否搶預設分頁)
export async function checkAvailable(): Promise<boolean> {
    try {
        const status = await Native.getStatus();
        available = status.available;
    } catch {
        available = false;
    }
    return available;
}

async function refresh() {
    const seq = ++refreshSeq;
    try {
        const [f, fr] = await Promise.all([
            Native.getFeed({ limit: feedLimit, filter }),
            Native.getFriends()
        ]);
        // 已有更新一輪的 refresh 啟動時放棄本輪結果,避免亂序覆寫
        if (seq !== refreshSeq) return;
        // 讀取成功才覆寫,失敗沿用快取
        feed = f;
        friends = fr;
        available = true;
    } catch {
        if (seq !== refreshSeq) return;
        available = false;
    }
    emit();
}

export function startPolling() {
    void checkAvailable().then(() => refresh());
    if (!timer) timer = setInterval(refresh, 5000);
}

export function stopPolling() {
    if (timer) { clearInterval(timer); timer = null; }
}
