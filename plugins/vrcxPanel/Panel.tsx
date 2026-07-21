/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import ErrorBoundary from "@components/ErrorBoundary";
import { useEffect, useReducer, useState } from "@webpack/common";

import {
    type FeedEntry, type FeedType, type Friend, type FriendGroup, fetchUserInfo, getFeed,
    getFeedSearch, getFilter, getFriendSearch, getGroups, getMe, isAvailable, isUsingApi,
    reloadFriends, setFeedSearch, setFilter, setFriendSearch, start, stop, subscribe, type UserInfo
} from "./data";
import { Flag, Icon, platformFor } from "./icons";
import { locationLabel, parseLocation, statusDotClass, trustColor } from "./location";

const FILTERS: Array<{ key: FeedType | "all"; label: string; }> = [
    { key: "all", label: "All" },
    { key: "gps", label: "GPS" },
    { key: "online", label: "Online" },
    { key: "offline", label: "Offline" },
    { key: "status", label: "Status" },
    { key: "avatar", label: "Avatar" },
    { key: "bio", label: "Bio" }
];

const TYPE_LABEL: Record<FeedType, string> = {
    gps: "GPS", online: "Online", offline: "Offline", status: "Status", avatar: "Avatar", bio: "Bio"
};

const PAGE_SIZE = 20;

function fmtDate(iso: string): string {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso.slice(5, 16).replace("T", " ");
    const p = (n: number) => String(n).padStart(2, "0");
    return `${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function initials(name: string): string {
    const t = name.replace(/[^\p{L}\p{N}]/gu, "").slice(0, 2);
    return (t || name.slice(0, 2) || "?").toUpperCase();
}

function Avatar({ url, name, size }: { url: string | null; name: string; size: number; }) {
    const [failed, setFailed] = useState(false);
    if (url && !failed) {
        return <img className="vc-vrcx-av" style={{ width: size, height: size }} src={url} alt="" onError={() => setFailed(true)} />;
    }
    return (
        <span className="vc-vrcx-av vc-vrcx-av-fallback" style={{ width: size, height: size, fontSize: size * 0.4 }}>
            {initials(name)}
        </span>
    );
}

/* ---------- Feed 表格 ---------- */

function FeedTable() {
    const feed = getFeed();
    const filter = getFilter();
    const [page, setPage] = useState(0);

    const pageCount = Math.max(1, Math.ceil(feed.length / PAGE_SIZE));
    const cur = Math.min(page, pageCount - 1);
    const rows = feed.slice(cur * PAGE_SIZE, cur * PAGE_SIZE + PAGE_SIZE);

    return (
        <div className="vc-vrcx-feed">
            <div className="vc-vrcx-toolbar">
                <div className="vc-vrcx-filters">
                    {FILTERS.map(f => (
                        <button
                            key={f.key}
                            className={"vc-vrcx-filter" + (filter === f.key ? " vc-vrcx-filter-active" : "")}
                            onClick={() => { setFilter(f.key); setPage(0); }}
                        >
                            {f.label}
                        </button>
                    ))}
                </div>
                <div className="vc-vrcx-search">
                    <Icon.Search size={14} />
                    <input
                        className="vc-vrcx-search-input"
                        placeholder="搜尋"
                        value={getFeedSearch()}
                        onChange={e => { setFeedSearch(e.currentTarget.value); setPage(0); }}
                    />
                </div>
            </div>
            <div className="vc-vrcx-table">
                <div className="vc-vrcx-row vc-vrcx-head">
                    <span className="vc-vrcx-c-caret" />
                    <span className="vc-vrcx-c-date">DATE</span>
                    <span className="vc-vrcx-c-type">TYPE</span>
                    <span className="vc-vrcx-c-user">USER</span>
                    <span className="vc-vrcx-c-detail">DETAIL</span>
                </div>
                <div className="vc-vrcx-body">
                    {rows.map((e, i) => <FeedRow key={cur * PAGE_SIZE + i} entry={e} />)}
                    {rows.length === 0 && <div className="vc-vrcx-feed-empty">尚無事件</div>}
                </div>
            </div>
            <Pager page={cur} pageCount={pageCount} onPage={setPage} total={feed.length} />
        </div>
    );
}

// Feed 內的 inline 狀態點(對齊 VRCX i.x-user-status,status.js:156-179)
function feedStatusDot(status: string): string {
    if (status === "active") return "online";
    if (status === "join me") return "joinme";
    if (status === "ask me") return "askme";
    if (status === "busy") return "busy";
    return "offline";
}
function StatusDot({ status }: { status: string; }) {
    return <span className={"vc-vrcx-idot vc-vrcx-dot-" + feedStatusDot(status)} />;
}

function timeToText(ms: number): string {
    const sec = Math.round(ms / 1000);
    if (sec < 60) return `${sec}秒`;
    const min = Math.round(sec / 60);
    if (min < 60) return `${min}分`;
    const hr = Math.floor(min / 60);
    return `${hr}時${min % 60}分`;
}

// Detail 欄:location(gps/online/offline)、狀態點+描述(status)、頭像名(avatar)、bio。
function FeedDetail({ entry }: { entry: FeedEntry; }) {
    if (entry.type === "status") {
        const sameDesc = entry.statusDescription === entry.previousStatusDescription;
        // 只有狀態點變(文字沒變)-> 前點 -> 後點;否則後點 + 描述
        if (sameDesc && entry.previousStatus) {
            return (
                <span className="vc-vrcx-detail-status">
                    <StatusDot status={entry.previousStatus} />
                    <Icon.ArrowRight size={14} className="vc-vrcx-arrow" />
                    <StatusDot status={entry.status ?? ""} />
                </span>
            );
        }
        return (
            <span className="vc-vrcx-detail-status">
                <StatusDot status={entry.status ?? ""} />
                <span className="vc-vrcx-detail-text">{entry.statusDescription}</span>
            </span>
        );
    }
    // gps/online/offline/avatar/bio:location 或純文字
    const loc = parseLocation(entry.location);
    return (
        <>
            {loc.flag && <Flag cc={loc.flag} />}
            <span className="vc-vrcx-detail-text">{entry.detail}</span>
            {loc.instanceType && <span className="vc-vrcx-inst"> · {loc.instanceType}</span>}
        </>
    );
}

// 展開行:依 type 顯示詳情(GPS 前後位置+時長、Avatar 前後縮圖、Status 前後、Bio diff)
function FeedExpanded({ entry }: { entry: FeedEntry; }) {
    if (entry.type === "gps" && entry.previousLocation) {
        return (
            <div className="vc-vrcx-expand">
                <span className="vc-vrcx-detail-text">{entry.previousLocation}</span>
                {entry.time ? <span className="vc-vrcx-time-badge">{timeToText(entry.time)}</span> : null}
                <Icon.ArrowDown size={14} className="vc-vrcx-arrow" />
                <span className="vc-vrcx-detail-text">{entry.worldName || entry.location}</span>
            </div>
        );
    }
    if (entry.type === "offline" && entry.time) {
        return <div className="vc-vrcx-expand"><span className="vc-vrcx-detail-text">{entry.worldName}</span><span className="vc-vrcx-time-badge">{timeToText(entry.time)}</span></div>;
    }
    if (entry.type === "avatar") {
        return (
            <div className="vc-vrcx-expand vc-vrcx-expand-av">
                {entry.previousAvatarThumbnail && <img src={entry.previousAvatarThumbnail} alt="" />}
                {entry.previousAvatarThumbnail && <Icon.ArrowRight size={16} className="vc-vrcx-arrow" />}
                {entry.avatarThumbnail && <img src={entry.avatarThumbnail} alt="" />}
                <span className="vc-vrcx-detail-text">{entry.avatarName}</span>
            </div>
        );
    }
    if (entry.type === "status") {
        return (
            <div className="vc-vrcx-expand">
                <StatusDot status={entry.previousStatus ?? ""} /><span className="vc-vrcx-detail-text">{entry.previousStatusDescription}</span>
                <Icon.ArrowRight size={14} className="vc-vrcx-arrow" />
                <StatusDot status={entry.status ?? ""} /><span className="vc-vrcx-detail-text">{entry.statusDescription}</span>
            </div>
        );
    }
    if (entry.type === "bio") {
        return <div className="vc-vrcx-expand vc-vrcx-expand-bio">{entry.bio}</div>;
    }
    return null;
}

// 是否有可展開的詳情(依 type 檢查對應的「前一個」欄位)
function canExpandEntry(entry: FeedEntry): boolean {
    switch (entry.type) {
        case "gps": return !!entry.previousLocation;
        case "offline": return !!entry.time;
        case "avatar": return !!entry.previousAvatarThumbnail;
        case "status": return !!entry.previousStatus;
        case "bio": return !!entry.previousBio;
        default: return false;
    }
}

function FeedRow({ entry }: { entry: FeedEntry; }) {
    const [expanded, setExpanded] = useState(false);
    const canExpand = canExpandEntry(entry);
    return (
        <>
            <div className={"vc-vrcx-row" + (canExpand ? " vc-vrcx-row-expandable" : "")} onClick={() => canExpand && setExpanded(e => !e)}>
                <span className="vc-vrcx-c-caret">
                    {canExpand && <Icon.ChevronRight size={12} className={"vc-vrcx-caret" + (expanded ? " vc-vrcx-caret-open" : "")} />}
                </span>
                <span className="vc-vrcx-c-date">{fmtDate(entry.createdAt)}</span>
                <span className="vc-vrcx-c-type">
                    <span className="vc-vrcx-tag">{TYPE_LABEL[entry.type]}</span>
                </span>
                <span className="vc-vrcx-c-user">{entry.displayName}</span>
                <span className="vc-vrcx-c-detail"><FeedDetail entry={entry} /></span>
            </div>
            {expanded && canExpand && <FeedExpanded entry={entry} />}
        </>
    );
}

function Pager({ page, pageCount, onPage, total }: { page: number; pageCount: number; onPage: (p: number) => void; total: number; }) {
    // 顯示最多 5 個頁碼 + 首尾;簡化為 VRCX 風格(Previous / 頁碼 / Next)
    const nums: number[] = [];
    const from = Math.max(0, Math.min(page - 2, pageCount - 5));
    for (let i = from; i < Math.min(from + 5, pageCount); i++) nums.push(i);

    return (
        <div className="vc-vrcx-pager">
            <span className="vc-vrcx-pager-info">共 {total} 筆</span>
            <button className="vc-vrcx-pager-btn" disabled={page === 0} onClick={() => onPage(page - 1)}>‹ Previous</button>
            {nums.map(n => (
                <button
                    key={n}
                    className={"vc-vrcx-pager-num" + (n === page ? " vc-vrcx-pager-active" : "")}
                    onClick={() => onPage(n)}
                >
                    {n + 1}
                </button>
            ))}
            {from + 5 < pageCount && <span className="vc-vrcx-pager-ell">…</span>}
            <button className="vc-vrcx-pager-btn" disabled={page >= pageCount - 1} onClick={() => onPage(page + 1)}>Next ›</button>
        </div>
    );
}

/* ---------- 好友側欄 ---------- */

function FriendRow({ friend, onOpen }: { friend: Friend; onOpen: (f: Friend) => void; }) {
    const dotClass = statusDotClass(friend);
    // active/offline 第二行顯示 status description(對齊 VRCX FriendItem.vue);
    // online 第二行顯示 location(世界名 · 類型 + 國旗)。
    const showStatusDesc = friend.rawState === "active" || friend.rawState === "offline";
    const loc = parseLocation(friend.lastLocation);
    const secondLine = showStatusDesc
        ? (friend.statusDescription || locationLabel(friend.lastLocation, friend.lastWorld, friend.state))
        : locationLabel(friend.lastLocation, friend.lastWorld, friend.state);
    const showFlag = !showStatusDesc && !!loc.flag;
    return (
        <div className="vc-vrcx-friend" onClick={() => onOpen(friend)}>
            <div className={"vc-vrcx-friend-av" + (friend.rawState === "offline" ? " vc-vrcx-av-offline" : "")}>
                <Avatar url={friend.thumbnail} name={friend.displayName} size={40} />
                <span className={"vc-vrcx-dot vc-vrcx-dot-" + dotClass} />
            </div>
            <div className="vc-vrcx-friend-text">
                <span className="vc-vrcx-friend-name" style={{ color: trustColor(friend.trustLevel) }}>{friend.displayName}</span>
                <span className="vc-vrcx-friend-loc">
                    {showFlag && loc.flag && <Flag cc={loc.flag} />}
                    {secondLine}
                </span>
            </div>
        </div>
    );
}

// 排序:ME > FAVORITES(子分組) > ONLINE > ACTIVE > OFFLINE
const GROUP_ORDER = ["online", "active", "offline"];
function sortGroups(groups: FriendGroup[]): FriendGroup[] {
    const fav = groups.filter(g => g.key.startsWith("favorites:"));
    const rest = GROUP_ORDER.map(k => groups.find(g => g.key === k)).filter((g): g is FriendGroup => g != null);
    return [...fav, ...rest];
}

// 可折疊分組(所有分組皆可折疊)。count 未提供時用 friends.length。
function Group({ title, friends, keyPrefix, onOpen, headClass, defaultCollapsed }: {
    title: string;
    friends: Friend[];
    keyPrefix: string;
    onOpen: (f: Friend) => void;
    headClass?: string;
    defaultCollapsed?: boolean;
}) {
    const [collapsed, setCollapsed] = useState(defaultCollapsed ?? false);
    return (
        <div className="vc-vrcx-group">
            <div
                className={"vc-vrcx-group-title vc-vrcx-group-collapsible" + (headClass ? " " + headClass : "")}
                onClick={() => setCollapsed(c => !c)}
            >
                <Icon.ChevronRight size={12} className={"vc-vrcx-group-caret" + (collapsed ? "" : " vc-vrcx-group-open")} />
                {title} — {friends.length}
            </div>
            {!collapsed && friends.map(f => <FriendRow key={keyPrefix + f.userId} friend={f} onOpen={onOpen} />)}
        </div>
    );
}

// FAVORITES 母分組:可整體收折,展開後顯示各收藏子分組
function FavoritesSection({ favGroups, onOpen }: { favGroups: FriendGroup[]; onOpen: (f: Friend) => void; }) {
    const [collapsed, setCollapsed] = useState(false);
    const count = favGroups.reduce((n, g) => n + g.friends.length, 0);
    return (
        <div className="vc-vrcx-group">
            <div className="vc-vrcx-group-title vc-vrcx-group-collapsible vc-vrcx-fav-head" onClick={() => setCollapsed(c => !c)}>
                <Icon.ChevronRight size={12} className={"vc-vrcx-group-caret" + (collapsed ? "" : " vc-vrcx-group-open")} />
                FAVORITES — {count}
            </div>
            {!collapsed && favGroups.map(g => (
                <div className="vc-vrcx-fav-sub" key={g.key}>
                    <Group title={g.title} friends={g.friends} keyPrefix={g.key} onOpen={onOpen} />
                </div>
            ))}
        </div>
    );
}

function Sidebar({ onOpen }: { onOpen: (f: Friend) => void; }) {
    // 搜尋時 getGroups() 每次回新陣列,memo 無效;資料量小(<100),直接計算即可。
    const groups = sortGroups(getGroups());
    const me = getMe();
    const usingApi = isUsingApi();
    const favGroups = groups.filter(g => g.key.startsWith("favorites:"));
    const restGroups = groups.filter(g => !g.key.startsWith("favorites:"));
    const total = groups.reduce((n, g) => n + g.friends.length, 0);
    const onlineCount = groups
        .filter(g => g.key === "online" || g.key === "active")
        .reduce((n, g) => n + g.friends.length, 0);

    return (
        <div className="vc-vrcx-sidebar">
            <div className="vc-vrcx-side-head">
                <span className="vc-vrcx-side-tab vc-vrcx-side-tab-active">好友 ({onlineCount}/{total})</span>
                <button className="vc-vrcx-reload" title={usingApi ? "重新整理" : "資料庫推估,點擊嘗試連線"} onClick={() => reloadFriends()}>
                    <Icon.RefreshCw size={14} />
                </button>
            </div>
            <div className="vc-vrcx-search vc-vrcx-search-side">
                <Icon.Search size={14} />
                <input
                    className="vc-vrcx-search-input"
                    placeholder="搜尋好友"
                    value={getFriendSearch()}
                    onChange={e => setFriendSearch(e.currentTarget.value)}
                />
            </div>
            {me && <Group title="ME" friends={[me]} keyPrefix="me" onOpen={onOpen} />}
            {favGroups.length > 0 && <FavoritesSection favGroups={favGroups} onOpen={onOpen} />}
            {restGroups.map(g => (
                <Group
                    key={g.key}
                    title={g.title}
                    friends={g.friends}
                    keyPrefix={g.key}
                    onOpen={onOpen}
                    defaultCollapsed={g.key === "active"}
                />
            ))}
        </div>
    );
}

function PanelInner() {
    const [, force] = useReducer(x => x + 1, 0);
    const [dialogUser, setDialogUser] = useState<Friend | null>(null);
    useEffect(() => {
        const unsub = subscribe(force);
        start();
        return () => { unsub(); stop(); };
    }, []);

    if (!isAvailable() && getFeed().length === 0) {
        return (
            <div className="vc-vrcx-panel vc-vrcx-empty">
                <span>未偵測到 VRCX,請確認 VRCX 已啟動</span>
            </div>
        );
    }

    return (
        <div className="vc-vrcx-panel">
            <FeedTable />
            <Sidebar onOpen={setDialogUser} />
            {dialogUser && <UserDialog friend={dialogUser} onClose={() => setDialogUser(null)} />}
        </div>
    );
}

/* ---------- Info dialog ---------- */

function statVal(v: string | null): string {
    return v || "—";
}
function fmtDateTime(iso: string | null): string {
    if (!iso) return "—";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function DialogField({ label, children }: { label: string; children: any; }) {
    return (
        <div className="vc-vrcx-dialog-field">
            <div className="vc-vrcx-dialog-label">{label}</div>
            <div>{children}</div>
        </div>
    );
}

// LINKS 項:社群平台顯示品牌圖示 + 平台名,其餘顯示外鏈圖示 + URL
function LinkChip({ url }: { url: string; }) {
    const platform = platformFor(url);
    return (
        <a className="vc-vrcx-link-chip" href={url} target="_blank" rel="noreferrer">
            {platform ? <platform.icon size={16} /> : <Icon.ExternalLink size={14} />}
            <span>{platform ? platform.name : url}</span>
        </a>
    );
}

function UserDialog({ friend, onClose }: { friend: Friend; onClose: () => void; }) {
    const [info, setInfo] = useState<UserInfo | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let alive = true;
        setLoading(true);
        fetchUserInfo(friend.userId).then(u => {
            if (alive) { setInfo(u); setLoading(false); }
        });
        return () => { alive = false; };
    }, [friend.userId]);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [onClose]);

    const loc = parseLocation(info?.location ?? friend.lastLocation);
    const trust = info?.trustLevel || friend.trustLevel;

    return (
        <div className="vc-vrcx-overlay" onClick={onClose}>
            <div className="vc-vrcx-dialog" onClick={e => e.stopPropagation()}>
                <button className="vc-vrcx-dialog-close" onClick={onClose}>
                    <Icon.X size={18} />
                </button>
                <div className="vc-vrcx-dialog-head">
                    <img className="vc-vrcx-dialog-av" src={info?.avatarImageUrl ?? friend.thumbnail ?? ""} alt="" />
                    <div className="vc-vrcx-dialog-headtext">
                        <div className="vc-vrcx-dialog-name">
                            <span className={"vc-vrcx-dot vc-vrcx-dot-" + statusDotClass(friend)} />
                            <span style={{ color: trustColor(trust) }}>{friend.displayName}</span>
                        </div>
                        <span className="vc-vrcx-dialog-trust" style={{ color: trustColor(trust) }}>{trust || "—"}</span>
                        {info?.statusDescription && <div className="vc-vrcx-dialog-statusdesc">{info.statusDescription}</div>}
                    </div>
                </div>

                <div className="vc-vrcx-dialog-body">
                    <div className="vc-vrcx-dialog-loc">
                        {loc.flag && <Flag cc={loc.flag} />}
                        {locationLabel(info?.location ?? friend.lastLocation, friend.lastWorld, friend.state)}
                    </div>

                    <DialogField label="Note">{statVal(info?.note ?? null)}</DialogField>

                    {info?.representedGroup && (
                        <DialogField label="Represented Group">{info.representedGroup}</DialogField>
                    )}

                    <DialogField label="Bio">
                        <span className="vc-vrcx-dialog-bio">{loading ? "載入中…" : statVal(info?.bio ?? null)}</span>
                    </DialogField>

                    {info && info.bioLinks.length > 0 && (
                        <div className="vc-vrcx-dialog-field">
                            <div className="vc-vrcx-dialog-label">Links</div>
                            <div className="vc-vrcx-dialog-links">
                                {info.bioLinks.map((l, i) => <LinkChip key={i} url={l} />)}
                            </div>
                        </div>
                    )}

                    <div className="vc-vrcx-dialog-stats">
                        <div><div className="vc-vrcx-dialog-label">Last Seen</div><div>{fmtDateTime(info?.lastLogin ?? null)}</div></div>
                        <div><div className="vc-vrcx-dialog-label">Last Activity</div><div>{fmtDateTime(info?.lastActivity ?? null)}</div></div>
                        <div><div className="vc-vrcx-dialog-label">Date Joined</div><div>{statVal(info?.dateJoined ?? null)}</div></div>
                        <div><div className="vc-vrcx-dialog-label">Platform</div><div>{statVal(info?.platform ?? null)}</div></div>
                        <div><div className="vc-vrcx-dialog-label">Pronouns</div><div>{statVal(info?.pronouns ?? null)}</div></div>
                        <div><div className="vc-vrcx-dialog-label">Avatar Cloning</div><div>{info?.allowAvatarCopying ? "Allow" : "Deny"}</div></div>
                    </div>

                    <div className="vc-vrcx-dialog-field">
                        <div className="vc-vrcx-dialog-label">User ID</div>
                        <div className="vc-vrcx-dialog-uid">
                            <span>{friend.userId}</span>
                            <button className="vc-vrcx-copy" title="複製" onClick={() => navigator.clipboard?.writeText(friend.userId)}>
                                <Icon.Copy size={14} />
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export const Panel = ErrorBoundary.wrap(PanelInner, { noop: true });
