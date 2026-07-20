/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import ErrorBoundary from "@components/ErrorBoundary";
import { findStoreLazy } from "@webpack";
import {
    ContextMenuApi, GuildStore, Menu, SelectedGuildStore, useEffect, useReducer,
    useRef, useState, useStateFromStores
} from "@webpack/common";

import { guildIconUrl } from "../_shared/avatar";
import {
    closeAllTabs, closeOtherTabs, closeTab, closeTabsToRight, getActiveTab,
    getTabs, navigateToTab, reorderTab, subscribe
} from "./tabs";

const GuildReadStateStore = findStoreLazy("GuildReadStateStore");

interface TabInfo {
    label: string;
    iconUrl: string | null;
    initial: string;
}

function tabInfo(tabId: string): TabInfo {
    if (tabId === "@me") return { label: "私訊", iconUrl: null, initial: "@" };
    const guild = GuildStore.getGuild(tabId);
    if (!guild) return { label: "未知伺服器", iconUrl: null, initial: "?" };
    return {
        label: guild.name,
        iconUrl: guildIconUrl(tabId, guild.icon, 32),
        initial: guild.name.slice(0, 1).toUpperCase()
    };
}

function openTabMenu(e: React.MouseEvent, tabId: string) {
    e.preventDefault();
    ContextMenuApi.openContextMenu(e, () => (
        <Menu.Menu navId="vc-chtabs-menu" onClose={ContextMenuApi.closeContextMenu}>
            <Menu.MenuItem id="vc-chtabs-close" label="關閉分頁" action={() => closeTab(tabId)} />
            <Menu.MenuItem id="vc-chtabs-close-others" label="關閉其他分頁" action={() => closeOtherTabs(tabId)} />
            <Menu.MenuItem id="vc-chtabs-close-right" label="關閉右側分頁" action={() => closeTabsToRight(tabId)} />
            <Menu.MenuSeparator />
            <Menu.MenuItem id="vc-chtabs-close-all" label="關閉全部分頁" color="danger" action={() => closeAllTabs()} />
        </Menu.Menu>
    ));
}

function Tab({ tabId, dragState }: { tabId: string; dragState: DragState; }) {
    const active = useStateFromStores([SelectedGuildStore], () => getActiveTab() === tabId);
    const [hasUnread, mentionCount] = useStateFromStores([GuildReadStateStore], () =>
        tabId === "@me"
            ? [false, 0]
            : [GuildReadStateStore.hasUnread(tabId), GuildReadStateStore.getMentionCount(tabId)]
    );
    const { label, iconUrl, initial } = tabInfo(tabId);

    const dragging = dragState.dragId === tabId;
    const dropBefore = dragState.overId === tabId && dragState.dragId !== tabId;

    return (
        <div
            className={
                "vc-chtabs-tab"
                + (active ? " vc-chtabs-active" : "")
                + (hasUnread && !active ? " vc-chtabs-unread" : "")
                + (dragging ? " vc-chtabs-dragging" : "")
                + (dropBefore ? " vc-chtabs-dropbefore" : "")
            }
            draggable
            onDragStart={e => {
                e.dataTransfer.effectAllowed = "move";
                dragState.setDragId(tabId);
            }}
            onDragOver={e => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                if (dragState.overId !== tabId) dragState.setOverId(tabId);
            }}
            onDrop={e => {
                e.preventDefault();
                if (dragState.dragId) reorderTab(dragState.dragId, tabId);
                dragState.reset();
            }}
            onDragEnd={() => dragState.reset()}
            onClick={() => navigateToTab(tabId)}
            onAuxClick={e => { if (e.button === 1) closeTab(tabId); }}
            onContextMenu={e => openTabMenu(e, tabId)}
        >
            {iconUrl
                ? <img className="vc-chtabs-icon" src={iconUrl} alt="" />
                : <span className="vc-chtabs-icon vc-chtabs-icon-fallback">{initial}</span>}
            <span className="vc-chtabs-label">{label}</span>
            {mentionCount > 0 && <span className="vc-chtabs-mention">{mentionCount > 99 ? "99+" : mentionCount}</span>}
            {hasUnread && !active && mentionCount === 0 && <span className="vc-chtabs-dot" />}
            <span
                className="vc-chtabs-close"
                role="button"
                aria-label="關閉分頁"
                onClick={e => { e.stopPropagation(); closeTab(tabId); }}
            >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M18.3 5.71 12 12.01l-6.3-6.3-1.41 1.41 6.3 6.3-6.3 6.3 1.41 1.41 6.3-6.3 6.3 6.3 1.41-1.41-6.3-6.3 6.3-6.3z" />
                </svg>
            </span>
        </div>
    );
}

interface DragState {
    dragId: string | null;
    overId: string | null;
    setDragId(id: string): void;
    setOverId(id: string): void;
    reset(): void;
}

function TabBarInner() {
    const [, forceUpdate] = useReducer(x => x + 1, 0);
    const barRef = useRef<HTMLDivElement>(null);
    useEffect(() => subscribe(forceUpdate), []);

    // 原生 wheel 監聽(React onWheel 為 passive,無法阻止並轉為橫向捲動)
    useEffect(() => {
        const bar = barRef.current;
        if (!bar) return;
        const onWheel = (e: WheelEvent) => {
            if (e.deltaY === 0) return;
            e.preventDefault();
            bar.scrollLeft += e.deltaY;
        };
        bar.addEventListener("wheel", onWheel, { passive: false });
        return () => bar.removeEventListener("wheel", onWheel);
    }, []);

    const [dragId, setDragId] = useState<string | null>(null);
    const [overId, setOverId] = useState<string | null>(null);
    const dragState: DragState = {
        dragId,
        overId,
        setDragId,
        setOverId,
        reset: () => { setDragId(null); setOverId(null); }
    };

    const tabs = getTabs();
    if (tabs.length === 0) return null;

    return (
        <div
            className="vc-chtabs-bar"
            ref={barRef}
            onDragLeave={e => {
                if (e.currentTarget === e.target) setOverId(null);
            }}
        >
            {tabs.map(id => <Tab key={id} tabId={id} dragState={dragState} />)}
        </div>
    );
}

export const TabBar = ErrorBoundary.wrap(TabBarInner, { noop: true });
