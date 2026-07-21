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

// 同步原生狀態:該伺服器是否有人直播、自己是否在該伺服器語音中、該伺服器語音中總人數
function useGuildLiveStatus(guildId: string): { live: boolean; inVoice: boolean; voiceCount: number; } {
    return useStateFromStores([ApplicationStreamingStore, VoiceStateStore], () => {
        let live = false;
        try {
            live = ApplicationStreamingStore.getAllActiveStreams().some((s: any) => s.guildId === guildId);
        } catch { /* store 尚未就緒 */ }

        const myId = UserStore.getCurrentUser()?.id;
        let inVoice = false;
        let voiceCount = 0;
        try {
            const states = VoiceStateStore.getVoiceStates(guildId);
            for (const [userId, state] of Object.entries<any>(states ?? {})) {
                if (!state?.channelId) continue;
                voiceCount += 1;
                if (userId === myId) inVoice = true;
            }
        } catch { /* store 尚未就緒 */ }

        return { live, inVoice, voiceCount };
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

// Pointer 拖放(不用 HTML5 drag,避免 img 原生拖曳干擾、跨元素 dataTransfer 問題)。
// 按住移動超過門檻才進入拖曳,期間顯示浮動預覽,放開時以 elementFromPoint 找目標。
const DRAG_THRESHOLD = 6;
let dragGuildId: string | null = null;
let dragPreview: HTMLElement | null = null;

function removePreview() {
    dragPreview?.remove();
    dragPreview = null;
}

// 在游標處建立浮動預覽(複製被拖曳圖示外觀)
function makePreview(iconEl: HTMLElement, x: number, y: number) {
    removePreview();
    const el = iconEl.cloneNode(true) as HTMLElement;
    el.className = "vc-favsrv-drag-preview";
    el.style.left = x + "px";
    el.style.top = y + "px";
    document.body.appendChild(el);
    dragPreview = el;
}

function movePreview(x: number, y: number) {
    if (dragPreview) { dragPreview.style.left = x + "px"; dragPreview.style.top = y + "px"; }
}

// 清掉所有放置高亮
function clearDropHighlights() {
    document.querySelectorAll(".vc-favsrv-dropinto, .vc-favsrv-slot-active")
        .forEach(el => el.classList.remove("vc-favsrv-dropinto", "vc-favsrv-slot-active"));
}

// 啟動一次 pointer 拖曳(在 GuildIcon 的 pointerdown 呼叫)
function beginDrag(guildId: string, iconEl: HTMLElement, startX: number, startY: number, onClickFallback: () => void) {
    let dragging = false;

    function onMove(e: PointerEvent) {
        if (!dragging) {
            if (Math.hypot(e.clientX - startX, e.clientY - startY) < DRAG_THRESHOLD) return;
            dragging = true;
            dragGuildId = guildId;
            makePreview(iconEl, e.clientX, e.clientY);
        }
        movePreview(e.clientX, e.clientY);
        // 依游標下的元素設定放置高亮
        clearDropHighlights();
        dragPreview!.style.pointerEvents = "none";
        const under = document.elementFromPoint(e.clientX, e.clientY);
        const item = under?.closest(".vc-favsrv-item, .vc-favsrv-folder-head, .vc-favsrv-slot") as HTMLElement | null;
        if (item) item.classList.add(item.classList.contains("vc-favsrv-slot") ? "vc-favsrv-slot-active" : "vc-favsrv-dropinto");
    }

    function onUp(e: PointerEvent) {
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
        removePreview();
        clearDropHighlights();
        if (!dragging) { onClickFallback(); dragGuildId = null; return; }
        // 找放置目標
        const under = document.elementFromPoint(e.clientX, e.clientY);
        const target = under?.closest("[data-favsrv-drop]") as HTMLElement | null;
        if (target && dragGuildId) {
            const kind = target.getAttribute("data-favsrv-drop");
            const id = target.getAttribute("data-favsrv-id") ?? "";
            if (kind === "slot") reorderItem(dragGuildId, id);
            else if (kind === "folder") addGuildToFolder(dragGuildId, id);
            else if (kind === "guild" && id !== dragGuildId) {
                const fid = target.getAttribute("data-favsrv-folder");
                if (fid) addGuildToFolder(dragGuildId, fid);
                else createFolderFrom(dragGuildId, id);
            }
        }
        dragGuildId = null;
    }

    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
}

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
    const { live, inVoice, voiceCount } = useGuildLiveStatus(guildId);
    if (!guild) return null;
    const iconUrl = guildIconUrl(guildId, guild.icon, 48);

    return (
        <div
            className="vc-favsrv-item"
            data-favsrv-drop="guild"
            data-favsrv-id={guildId}
            data-favsrv-folder={inFolder && folderId ? folderId : undefined}
            title={guild.name}
            onPointerDown={e => {
                if (e.button !== 0) return;
                const iconEl = e.currentTarget.querySelector(".vc-favsrv-icon") as HTMLElement;
                beginDrag(guildId, iconEl ?? e.currentTarget, e.clientX, e.clientY, () => navigateToGuild(guildId));
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
            {voiceCount > 0 && (
                <span className="vc-favsrv-voice" title={`${voiceCount} 人在語音`}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                        <path d="M19 10v2a7 7 0 0 1-14 0v-2H3v2a9 9 0 0 0 8 8.94V23h2v-2.06A9 9 0 0 0 21 12v-2h-2z" />
                    </svg>
                    {voiceCount}
                </span>
            )}
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
                data-favsrv-drop="folder"
                data-favsrv-id={folder.id}
                style={{ background: folder.expanded ? "transparent" : `#${folder.color.toString(16).padStart(6, "0")}33` }}
                onClick={() => toggleFolder(folder.id)}
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
    return <div className="vc-favsrv-slot" data-favsrv-drop="slot" data-favsrv-id={itemId} />;
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
