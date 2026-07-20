/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import * as DataStore from "@api/DataStore";
import { findStoreLazy } from "@webpack";
import { ChannelStore, GuildStore, NavigationRouter, SelectedChannelStore } from "@webpack/common";

import { createListenerRegistry } from "../_shared/listeners";

const GuildChannelStore = findStoreLazy("GuildChannelStore");

// 找左側伺服器列的捲軸容器:位於視窗最左、可垂直捲動的 scroller
function getGuildRailScroller(): HTMLElement | null {
    const scrollers = document.querySelectorAll<HTMLElement>('[class*="scroller_"]');
    for (const el of scrollers) {
        if (el.scrollHeight <= el.clientHeight + 4) continue;
        const rect = el.getBoundingClientRect();
        if (rect.left < 80 && rect.width < 90) return el;
    }
    return null;
}

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

// 將 fromId 移到 toId 之前(拖曳放置用,以 id 為準比 index 穩定)
export function reorderTab(fromId: string, toId: string): void {
    const from = state.tabs.indexOf(fromId);
    const to = state.tabs.indexOf(toId);
    if (from === -1 || to === -1 || from === to) return;
    const tabs = [...state.tabs];
    const [moved] = tabs.splice(from, 1);
    tabs.splice(tabs.indexOf(toId), 0, moved);
    state.tabs = tabs;
    emit();
    persistSoon();
}

export function closeOtherTabs(keepId: string): void {
    state.tabs = state.tabs.filter(id => id === keepId);
    state.activeTab = keepId;
    emit();
    persistSoon();
    navigateToTab(keepId);
}

export function closeTabsToRight(fromId: string): void {
    const idx = state.tabs.indexOf(fromId);
    if (idx === -1) return;
    state.tabs = state.tabs.slice(0, idx + 1);
    if (state.activeTab && !state.tabs.includes(state.activeTab)) {
        state.activeTab = fromId;
        navigateToTab(fromId);
    }
    emit();
    persistSoon();
}

export function closeAllTabs(): void {
    state.tabs = [];
    state.activeTab = null;
    emit();
    persistSoon();
}

// 點分頁:回到該伺服器最後停留的頻道;私訊區直接回 @me。
// 切換後還原左側伺服器列捲動位置,避免伺服器列自動跳動。
export function navigateToTab(guildId: string): void {
    const rail = getGuildRailScroller();
    const savedScroll = rail?.scrollTop ?? null;
    const restoreScroll = () => {
        if (rail && savedScroll != null) rail.scrollTop = savedScroll;
    };

    if (guildId === "@me") {
        const lastDm = SelectedChannelStore.getLastSelectedChannelId("@me");
        NavigationRouter.transitionTo(lastDm ? `/channels/@me/${lastDm}` : "/channels/@me");
    } else {
        const lastChannel = SelectedChannelStore.getLastSelectedChannelId(guildId);
        if (lastChannel && ChannelStore.getChannel(lastChannel)) {
            NavigationRouter.transitionToGuild(guildId, lastChannel);
        } else {
            // 無最後頻道(常見於只到過伺服器但未選頻道的情形):選預設頻道,避免停在指南頁
            const fallback = GuildChannelStore.getDefaultChannel(guildId);
            if (fallback) {
                NavigationRouter.transitionToGuild(guildId, fallback.id);
            } else {
                NavigationRouter.transitionToGuild(guildId);
            }
        }
    }

    // Discord 導航後會把選中伺服器捲到可見(可能延後數個 frame);
    // 連續數次還原捲動位置以覆蓋其自動捲動
    if (rail && savedScroll != null) {
        for (const delay of [0, 30, 80, 160]) {
            setTimeout(restoreScroll, delay);
        }
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
