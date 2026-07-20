/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import * as DataStore from "@api/DataStore";
import { ChannelStore, GuildStore, NavigationRouter, SelectedChannelStore } from "@webpack/common";

import { createListenerRegistry } from "../_shared/listeners";

const KEY = "ChannelTabs_guildTabs";

// 分頁以伺服器為單位;"@me" 代表私訊區。順序即使用者排序。
interface TabsData {
    tabs: string[];
    activeTab: string | null;
}

let state: TabsData = { tabs: [], activeTab: null };
const { subscribe, emit } = createListenerRegistry();
let persistTimer: ReturnType<typeof setTimeout> | null = null;

export { subscribe };

function persistSoon() {
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
        persistTimer = null;
        DataStore.set(KEY, state);
    }, 500);
}

export function getTabs(): string[] {
    return state.tabs;
}

export function getActiveTab(): string | null {
    return state.activeTab;
}

export async function loadTabs(): Promise<void> {
    const stored = await DataStore.get<TabsData>(KEY);
    if (stored && Array.isArray(stored.tabs)) {
        state = { tabs: stored.tabs, activeTab: stored.activeTab ?? null };
    }
    emit();
}

// 進到某個伺服器(或私訊)時,確保有對應分頁並標記為 active。
export function openGuildTab(guildId: string): void {
    const key = guildId || "@me";
    if (!state.tabs.includes(key)) state.tabs = [...state.tabs, key];
    state.activeTab = key;
    emit();
    persistSoon();
}

export function closeTab(guildId: string): void {
    const idx = state.tabs.indexOf(guildId);
    if (idx === -1) return;
    state.tabs = state.tabs.filter(id => id !== guildId);
    if (state.activeTab === guildId) {
        const next = state.tabs[Math.min(idx, state.tabs.length - 1)] ?? null;
        state.activeTab = next;
        if (next) navigateToTab(next);
    }
    emit();
    persistSoon();
}

export function moveTab(fromIndex: number, toIndex: number): void {
    if (fromIndex === toIndex) return;
    const tabs = [...state.tabs];
    const [moved] = tabs.splice(fromIndex, 1);
    tabs.splice(toIndex, 0, moved);
    state.tabs = tabs;
    emit();
    persistSoon();
}

// 點分頁:回到該伺服器最後停留的頻道;私訊區直接回 @me。
export function navigateToTab(guildId: string): void {
    if (guildId === "@me") {
        const lastDm = SelectedChannelStore.getLastSelectedChannelId("@me");
        NavigationRouter.transitionTo(lastDm ? `/channels/@me/${lastDm}` : "/channels/@me");
        return;
    }
    const lastChannel = SelectedChannelStore.getLastSelectedChannelId(guildId);
    if (lastChannel && ChannelStore.getChannel(lastChannel)) {
        NavigationRouter.transitionToGuild(guildId, lastChannel);
    } else {
        NavigationRouter.transitionToGuild(guildId);
    }
}

export function pruneInvalidTabs(): void {
    const valid = state.tabs.filter(id => id === "@me" || GuildStore.getGuild(id) != null);
    if (valid.length !== state.tabs.length) {
        state.tabs = valid;
        if (state.activeTab && !valid.includes(state.activeTab)) state.activeTab = valid[0] ?? null;
        emit();
        persistSoon();
    }
}
