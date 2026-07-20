/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import ErrorBoundary from "@components/ErrorBoundary";
import {
    ChannelRouter, ChannelStore, ReadStateStore, useEffect, useReducer,
    UserStore, useStateFromStores
} from "@webpack/common";

import { closeTab, getActiveTab, getTabs, moveTab, subscribe } from "./tabs";

function tabLabel(channelId: string): string {
    const channel = ChannelStore.getChannel(channelId);
    if (!channel) return "未知頻道";
    if (channel.guild_id) return "#" + channel.name;
    if (channel.name) return channel.name;
    const userId = (channel as any).recipients?.[0];
    const user = userId ? UserStore.getUser(userId) : null;
    return (user as any)?.globalName ?? user?.username ?? "私訊";
}

function Tab({ channelId, index }: { channelId: string; index: number; }) {
    const [active, hasUnread] = useStateFromStores([ReadStateStore], () => [
        getActiveTab() === channelId,
        ReadStateStore.hasUnread(channelId)
    ]);

    return (
        <div
            className={"vc-chtabs-tab" + (active ? " vc-chtabs-active" : "") + (hasUnread ? " vc-chtabs-unread" : "")}
            draggable
            onDragStart={e => e.dataTransfer.setData("text/vc-chtabs", String(index))}
            onDragOver={e => e.preventDefault()}
            onDrop={e => {
                e.preventDefault();
                const from = Number(e.dataTransfer.getData("text/vc-chtabs"));
                if (!Number.isNaN(from)) moveTab(from, index);
            }}
            onClick={() => ChannelRouter.transitionToChannel(channelId)}
            onAuxClick={e => { if (e.button === 1) closeTab(channelId); }}
        >
            <span className="vc-chtabs-label">{tabLabel(channelId)}</span>
            <span
                className="vc-chtabs-close"
                onClick={e => { e.stopPropagation(); closeTab(channelId); }}
            >
                {"×"}
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
            {tabs.map((id, i) => <Tab key={id} channelId={id} index={i} />)}
        </div>
    );
}

export const TabBar = ErrorBoundary.wrap(TabBarInner, { noop: true });
