/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { findByPropsLazy, findStoreLazy } from "@webpack";

const MediaEngineStore = findStoreLazy("MediaEngineStore");
// 自己麥克風/拒聽開關 action
const SelfMuteActions: any = findByPropsLazy("toggleSelfMute", "toggleSelfDeaf");

// 讀取自己是否靜音/拒聽(供底部按鈕顯示狀態)
export function isSelfMute(): boolean {
    try { return !!MediaEngineStore.isSelfMute(); } catch { return false; }
}
export function isSelfDeaf(): boolean {
    try { return !!MediaEngineStore.isSelfDeaf(); } catch { return false; }
}

export function toggleSelfMute(): void {
    SelfMuteActions?.toggleSelfMute();
}
export function toggleSelfDeaf(): void {
    SelfMuteActions?.toggleSelfDeaf();
}
