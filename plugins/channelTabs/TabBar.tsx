/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import ErrorBoundary from "@components/ErrorBoundary";
import { findStoreLazy } from "@webpack";
import {
    GuildStore, SelectedGuildStore, useEffect, useReducer, useStateFromStores
} from "@webpack/common";

import { guildIconUrl } from "../_shared/avatar";
import { closeTab, getActiveTab, getTabs, moveTab, navigateToTab, subscribe } from "./tabs";

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

function Tab({ tabId, index }: { tabId: string; index: number; }) {
    const active = useStateFromStores([SelectedGuildStore], () =>
        getActiveTab() === tabId
    );
    const [hasUnread, mentionCount] = useStateFromStores([GuildReadStateStore], () =>
        tabId === "@me"
            ? [false, 0]
            : [GuildReadStateStore.hasUnread(tabId), GuildReadStateStore.getTotalMentionCount(tabId)]
    );
    const { label, iconUrl, initial } = tabInfo(tabId);

    return (
        <div
            className={
                "vc-chtabs-tab"
                + (active ? " vc-chtabs-active" : "")
                + (hasUnread && !active ? " vc-chtabs-unread" : "")
            }
            draggable
            onDragStart={e => e.dataTransfer.setData("text/vc-chtabs", String(index))}
            onDragOver={e => e.preventDefault()}
            onDrop={e => {
                e.preventDefault();
                const from = Number(e.dataTransfer.getData("text/vc-chtabs"));
                if (!Number.isNaN(from)) moveTab(from, index);
            }}
            onClick={() => navigateToTab(tabId)}
            onAuxClick={e => { if (e.button === 1) closeTab(tabId); }}
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

function TabBarInner() {
    const [, forceUpdate] = useReducer(x => x + 1, 0);
    useEffect(() => subscribe(forceUpdate), []);

    const tabs = getTabs();
    if (tabs.length === 0) return null;

    return (
        <div className="vc-chtabs-bar">
            {tabs.map((id, i) => <Tab key={id} tabId={id} index={i} />)}
        </div>
    );
}

export const TabBar = ErrorBoundary.wrap(TabBarInner, { noop: true });
