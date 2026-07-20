/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { findByPropsLazy, findStoreLazy } from "@webpack";

const MediaEngineStore = findStoreLazy("MediaEngineStore");
// 自己麥克風/拒聽開關 action
const SelfMuteActions: any = findByPropsLazy("toggleSelfMute", "toggleSelfDeaf");
// 個別使用者本地音量 action
const LocalVolumeActions: any = findByPropsLazy("setLocalVolume");

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

// 讀取某使用者的本地音量(0-100 為正常範圍,>100 為增益)
export function getLocalVolume(userId: string): number {
    try { return MediaEngineStore.getLocalVolume(userId) ?? 100; } catch { return 100; }
}

// 設定某使用者的本地音量
export function setLocalVolume(userId: string, volume: number): void {
    LocalVolumeActions?.setLocalVolume(userId, volume);
}
