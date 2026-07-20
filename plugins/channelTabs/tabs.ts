import * as DataStore from "@api/DataStore";
import { ChannelRouter, ChannelStore } from "@webpack/common";

const KEY = "ChannelTabs_data";

interface TabsData {
    tabs: string[];
    activeTab: string | null;
}

let state: TabsData = { tabs: [], activeTab: null };
const listeners = new Set<() => void>();
let persistTimer: ReturnType<typeof setTimeout> | null = null;

function emit() {
    for (const cb of listeners) cb();
}

function persistSoon() {
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
        persistTimer = null;
        DataStore.set(KEY, state);
    }, 500);
}

export function subscribe(cb: () => void): () => void {
    listeners.add(cb);
    return () => listeners.delete(cb);
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
        state = {
            tabs: stored.tabs,
            activeTab: stored.activeTab ?? null
        };
    }
    emit();
}

export function openTab(channelId: string): void {
    if (!state.tabs.includes(channelId)) state.tabs = [...state.tabs, channelId];
    state.activeTab = channelId;
    emit();
    persistSoon();
}

export function closeTab(channelId: string): void {
    const idx = state.tabs.indexOf(channelId);
    if (idx === -1) return;
    state.tabs = state.tabs.filter(id => id !== channelId);
    if (state.activeTab === channelId) {
        const next = state.tabs[Math.min(idx, state.tabs.length - 1)] ?? null;
        state.activeTab = next;
        if (next) ChannelRouter.transitionToChannel(next);
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

export function restoreLastChannel(): void {
    if (state.activeTab && ChannelStore.getChannel(state.activeTab)) {
        ChannelRouter.transitionToChannel(state.activeTab);
    }
}

export function pruneInvalidTabs(): void {
    const valid = state.tabs.filter(id => ChannelStore.getChannel(id) != null);
    if (valid.length !== state.tabs.length) {
        state.tabs = valid;
        if (state.activeTab && !valid.includes(state.activeTab)) state.activeTab = valid[0] ?? null;
        emit();
        persistSoon();
    }
}
