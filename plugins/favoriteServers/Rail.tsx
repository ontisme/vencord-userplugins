/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import ErrorBoundary from "@components/ErrorBoundary";
import { findStoreLazy } from "@webpack";
import {
    ContextMenuApi, GuildStore, Menu, NavigationRouter, SelectedChannelStore,
    SelectedGuildStore, Text, TextInput, useEffect, useReducer, UserStore, useState,
    useStateFromStores
} from "@webpack/common";

import { guildIconUrl } from "../_shared/avatar";
import { getLastChannel } from "../_shared/lastChannel";
import {
    addGuildToFolder, createFolderFrom, deleteFolder, getItems, RailItem, removeGuild,
    removeGuildFromFolder, renameFolder, reorderItem, subscribe, toggleFolder
} from "./data";

const GuildChannelStore = findStoreLazy("GuildChannelStore");
const GuildReadStateStore = findStoreLazy("GuildReadStateStore");
const ApplicationStreamingStore = findStoreLazy("ApplicationStreamingStore");
const VoiceStateStore = findStoreLazy("VoiceStateStore");

// 同步原生狀態:該伺服器是否有人正在直播、自己是否在該伺服器語音中
function useGuildLiveStatus(guildId: string): { live: boolean; inVoice: boolean; } {
    return useStateFromStores([ApplicationStreamingStore, VoiceStateStore], () => {
        let live = false;
        try {
            live = ApplicationStreamingStore.getAllActiveStreams().some((s: any) => s.guildId === guildId);
        } catch { /* store 尚未就緒 */ }

        let inVoice = false;
        try {
            const myState = VoiceStateStore.getVoiceStateForUser(UserStore.getCurrentUser()?.id);
            inVoice = myState?.guildId === guildId;
        } catch { /* ignore */ }

        return { live, inVoice };
    });
}

function navigateToGuild(guildId: string) {
    // 自身持久記錄優先,退回 Discord session 記憶
    const last = getLastChannel(guildId) ?? SelectedChannelStore.getLastSelectedChannelId(guildId);
    if (last) {
        NavigationRouter.transitionToGuild(guildId, last);
        return;
    }
    const def = GuildChannelStore.getDefaultChannel(guildId);
    if (def) NavigationRouter.transitionToGuild(guildId, def.id);
    else NavigationRouter.transitionToGuild(guildId);
}

function guildInitial(name: string): string {
    return name.split(/\s+/).map(w => w[0]).join("").slice(0, 2).toUpperCase() || "?";
}

// 拖曳資料在模組內共享(HTML5 DnD 的 dataTransfer 在 dragenter 讀不到值)
let dragGuildId: string | null = null;

function GuildIcon({ guildId, inFolder, folderId }: { guildId: string; inFolder?: boolean; folderId?: string; }) {
    const guild = GuildStore.getGuild(guildId);
    const [selected, hasUnread, mentions] = useStateFromStores(
        [SelectedGuildStore, GuildReadStateStore],
        () => [
            SelectedGuildStore.getGuildId() === guildId,
            GuildReadStateStore.hasUnread(guildId),
            GuildReadStateStore.getMentionCount(guildId)
        ]
    );
    const { live, inVoice } = useGuildLiveStatus(guildId);
    if (!guild) return null;
    const iconUrl = guildIconUrl(guildId, guild.icon, 48);

    return (
        <div
            className="vc-favsrv-item"
            draggable
            onClick={() => navigateToGuild(guildId)}
            title={guild.name}
            onDragStart={() => { dragGuildId = guildId; }}
            onDragEnd={() => { dragGuildId = null; }}
            onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add("vc-favsrv-dropinto"); }}
            onDragLeave={e => e.currentTarget.classList.remove("vc-favsrv-dropinto")}
            onDrop={e => {
                e.preventDefault();
                e.currentTarget.classList.remove("vc-favsrv-dropinto");
                if (!dragGuildId || dragGuildId === guildId) return;
                if (inFolder && folderId) addGuildToFolder(dragGuildId, folderId);
                else createFolderFrom(dragGuildId, guildId);
                dragGuildId = null;
            }}
            onContextMenu={e => {
                e.preventDefault();
                ContextMenuApi.openContextMenu(e, () => (
                    <Menu.Menu navId="vc-favsrv-guild-menu" onClose={ContextMenuApi.closeContextMenu}>
                        {inFolder && folderId
                            ? <Menu.MenuItem id="vc-favsrv-out" label="移出資料夾" action={() => removeGuildFromFolder(guildId, folderId)} />
                            : null}
                        <Menu.MenuItem id="vc-favsrv-remove" label="從最愛移除" color="danger" action={() => removeGuild(guildId)} />
                    </Menu.Menu>
                ));
            }}
        >
            {(hasUnread || selected) && <span className={"vc-favsrv-pill" + (selected ? " vc-favsrv-pill-selected" : "")} />}
            <div className={"vc-favsrv-icon" + (selected ? " vc-favsrv-selected" : "") + (inVoice ? " vc-favsrv-invoice" : "")}>
                {iconUrl
                    ? <img src={iconUrl} alt="" />
                    : <span className="vc-favsrv-initial">{guildInitial(guild.name)}</span>}
            </div>
            {live && <span className="vc-favsrv-live">LIVE</span>}
            {mentions > 0 && <span className="vc-favsrv-badge">{mentions > 99 ? "99+" : mentions}</span>}
        </div>
    );
}

function Folder({ folder }: { folder: Extract<RailItem, { type: "folder"; }>; }) {
    const [renaming, setRenaming] = useState(false);
    const [name, setName] = useState(folder.name);

    return (
        <div className="vc-favsrv-folder">
            <div
                className="vc-favsrv-folder-head"
                style={{ background: folder.expanded ? "transparent" : `#${folder.color.toString(16).padStart(6, "0")}33` }}
                onClick={() => toggleFolder(folder.id)}
                onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add("vc-favsrv-dropinto"); }}
                onDragLeave={e => e.currentTarget.classList.remove("vc-favsrv-dropinto")}
                onDrop={e => {
                    e.preventDefault();
                    e.currentTarget.classList.remove("vc-favsrv-dropinto");
                    if (dragGuildId) addGuildToFolder(dragGuildId, folder.id);
                    dragGuildId = null;
                }}
                onContextMenu={e => {
                    e.preventDefault();
                    ContextMenuApi.openContextMenu(e, () => (
                        <Menu.Menu navId="vc-favsrv-folder-menu" onClose={ContextMenuApi.closeContextMenu}>
                            <Menu.MenuItem id="vc-favsrv-rename" label="重新命名" action={() => setRenaming(true)} />
                            <Menu.MenuItem id="vc-favsrv-delete" label="解散資料夾" color="danger" action={() => deleteFolder(folder.id)} />
                        </Menu.Menu>
                    ));
                }}
                title={folder.name}
            >
                {folder.expanded
                    ? <FolderOpenIcon />
                    : <div className="vc-favsrv-folder-preview">
                        {/* 固定 2x2 四格,仿原生:不足補空格,超過只顯示前 4 個 */}
                        {Array.from({ length: 4 }, (_, i) => {
                            const id = folder.guildIds[i];
                            if (!id) return <span key={i} className="vc-favsrv-mini-empty" />;
                            const g = GuildStore.getGuild(id);
                            const url = g ? guildIconUrl(id, g.icon, 16) : null;
                            return url
                                ? <img key={i} src={url} alt="" />
                                : <span key={i} className="vc-favsrv-mini-initial">{g ? guildInitial(g.name) : "?"}</span>;
                        })}
                    </div>}
            </div>
            {renaming && (
                <div className="vc-favsrv-rename-box" onClick={e => e.stopPropagation()}>
                    <TextInput
                        value={name}
                        onChange={setName}
                        autoFocus={true}
                        onKeyDown={(e: React.KeyboardEvent) => {
                            if (e.key === "Enter") { renameFolder(folder.id, name.trim() || "資料夾"); setRenaming(false); }
                            if (e.key === "Escape") setRenaming(false);
                        }}
                    />
                </div>
            )}
            {folder.expanded && (
                <div className="vc-favsrv-folder-body">
                    {folder.guildIds.map(id => <GuildIcon key={id} guildId={id} inFolder folderId={folder.id} />)}
                </div>
            )}
        </div>
    );
}

function FolderOpenIcon() {
    return (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
            <path d="M20 6h-8l-2-2H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2z" opacity="0.9" />
        </svg>
    );
}

function ReorderSlot({ itemId }: { itemId: string; }) {
    return (
        <div
            className="vc-favsrv-slot"
            onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add("vc-favsrv-slot-active"); }}
            onDragLeave={e => e.currentTarget.classList.remove("vc-favsrv-slot-active")}
            onDrop={e => {
                e.preventDefault();
                e.currentTarget.classList.remove("vc-favsrv-slot-active");
                if (dragGuildId) reorderItem(dragGuildId, itemId);
                dragGuildId = null;
            }}
        />
    );
}

function RailInner() {
    const [, forceUpdate] = useReducer(x => x + 1, 0);
    useEffect(() => subscribe(forceUpdate), []);

    const items = getItems();
    if (items.length === 0) return null;

    return (
        <div className="vc-favsrv-rail">
            <div className="vc-favsrv-title">
                <Text variant="text-xs/semibold" style={{ color: "var(--text-muted)" }}>最愛</Text>
            </div>
            {items.map(item => (
                <div key={item.id}>
                    <ReorderSlot itemId={item.id} />
                    {item.type === "guild"
                        ? <GuildIcon guildId={item.id} />
                        : <Folder folder={item} />}
                </div>
            ))}
        </div>
    );
}

export const Rail = ErrorBoundary.wrap(RailInner, { noop: true });
