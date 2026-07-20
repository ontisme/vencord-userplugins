/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import * as DataStore from "@api/DataStore";

// 每個伺服器(或私訊區 "@me")最後造訪的頻道。
// Discord 內建的 SelectedChannelStore.getLastSelectedChannelId 只存於 session 記憶體,
// 重啟後幾乎全數清空,無法作為「回到上次位置」的依據;因此自行持久記錄。

const KEY = "SharedLastChannel_map";

let map: Record<string, string> = {};
let loaded = false;
let persistTimer: ReturnType<typeof setTimeout> | null = null;

function persistSoon() {
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
        persistTimer = null;
        DataStore.set(KEY, map);
    }, 500);
}

// 由任一使用此模組的外掛在 start() 呼叫一次即可;重複呼叫僅第一次真正載入。
export async function loadLastChannels(): Promise<void> {
    if (loaded) return;
    loaded = true;
    const stored = await DataStore.get<Record<string, string>>(KEY);
    if (stored && typeof stored === "object") map = { ...stored };
}

// 記錄某伺服器的最後頻道。guildId 為 null 時視為私訊區。
export function recordLastChannel(guildId: string | null, channelId: string | null): void {
    if (!channelId) return;
    const key = guildId ?? "@me";
    if (map[key] === channelId) return;
    map[key] = channelId;
    persistSoon();
}

// 取得某伺服器的最後頻道;無記錄則回傳 null。
export function getLastChannel(guildId: string): string | null {
    return map[guildId] ?? null;
}
