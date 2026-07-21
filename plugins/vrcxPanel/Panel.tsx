/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import ErrorBoundary from "@components/ErrorBoundary";
import { useEffect, useMemo, useReducer, useState } from "@webpack/common";

import {
    type FeedEntry, type FeedType, type Friend, type FriendGroup, fetchUserInfo, getFeed,
    getFilter, getGroups, getMe, isAvailable, isUsingApi, reloadFriends, setFilter, start,
    stop, subscribe, type UserInfo
} from "./data";
import { locationLabel, parseLocation, trustColor } from "./location";

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
                </div>
            </div>
            <Pager page={cur} pageCount={pageCount} onPage={setPage} total={feed.length} />
        </div>
    );
}

function FeedRow({ entry }: { entry: FeedEntry; }) {
    const loc = parseLocation(entry.location);
    return (
        <div className="vc-vrcx-row">
            <span className="vc-vrcx-c-caret">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M9 6l6 6-6 6" /></svg>
            </span>
            <span className="vc-vrcx-c-date">{fmtDate(entry.createdAt)}</span>
            <span className="vc-vrcx-c-type">
                <span className="vc-vrcx-tag">{TYPE_LABEL[entry.type]}</span>
            </span>
            <span className="vc-vrcx-c-user">{entry.displayName}</span>
            <span className="vc-vrcx-c-detail">
                {loc.flag && <span className="vc-vrcx-flag">{loc.flag}</span>}
                <span className="vc-vrcx-detail-text">{entry.detail}</span>
                {loc.instanceType && <span className="vc-vrcx-inst"> · {loc.instanceType}</span>}
            </span>
        </div>
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
    const loc = parseLocation(friend.lastLocation);
    const detail = locationLabel(friend.lastLocation, friend.lastWorld, friend.state);
    return (
        <div className="vc-vrcx-friend" onClick={() => onOpen(friend)}>
            <div className="vc-vrcx-friend-av">
                <Avatar url={friend.thumbnail} name={friend.displayName} size={40} />
                <span className={"vc-vrcx-status vc-vrcx-status-" + friend.state} />
            </div>
            <div className="vc-vrcx-friend-text">
                <span className="vc-vrcx-friend-name" style={{ color: trustColor(friend.trustLevel) }}>{friend.displayName}</span>
                <span className="vc-vrcx-friend-loc">
                    {loc.flag && <span className="vc-vrcx-flag">{loc.flag}</span>}
                    {detail}
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

function Group({ group, collapsible, onOpen }: { group: FriendGroup; collapsible: boolean; onOpen: (f: Friend) => void; }) {
    const [collapsed, setCollapsed] = useState(false);
    return (
        <div className="vc-vrcx-group">
            <div
                className={"vc-vrcx-group-title" + (collapsible ? " vc-vrcx-group-collapsible" : "")}
                onClick={() => collapsible && setCollapsed(c => !c)}
            >
                {collapsible && (
                    <svg className={"vc-vrcx-group-caret" + (collapsed ? "" : " vc-vrcx-group-open")} width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M9 6l6 6-6 6" /></svg>
                )}
                {group.title} — {group.friends.length}
            </div>
            {!collapsed && group.friends.map(f => <FriendRow key={group.key + f.userId} friend={f} onOpen={onOpen} />)}
        </div>
    );
}

function Sidebar({ onOpen }: { onOpen: (f: Friend) => void; }) {
    const rawGroups = getGroups();
    const groups = useMemo(() => sortGroups(rawGroups), [rawGroups]);
    const me = getMe();
    const usingApi = isUsingApi();
    const total = useMemo(() => groups.reduce((n, g) => n + g.friends.length, 0), [groups]);
    const onlineCount = useMemo(
        () => groups.filter(g => g.key === "online" || g.key === "active").reduce((n, g) => n + g.friends.length, 0),
        [groups]
    );

    return (
        <div className="vc-vrcx-sidebar">
            <div className="vc-vrcx-side-head">
                <span className="vc-vrcx-side-tab vc-vrcx-side-tab-active">好友 ({onlineCount}/{total})</span>
                <button className="vc-vrcx-reload" title={usingApi ? "重新整理" : "資料庫推估,點擊嘗試連線"} onClick={() => reloadFriends()}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M17.65 6.35A8 8 0 1 0 20 12h-2a6 6 0 1 1-1.76-4.24L13 11h7V4l-2.35 2.35z" />
                    </svg>
                </button>
            </div>
            {me && (
                <div className="vc-vrcx-group">
                    <div className="vc-vrcx-group-title">ME</div>
                    <FriendRow friend={me} onOpen={onOpen} />
                </div>
            )}
            {groups.some(g => g.key.startsWith("favorites:")) && (
                <div className="vc-vrcx-group-title vc-vrcx-fav-head">FAVORITES — {groups.filter(g => g.key.startsWith("favorites:")).length}</div>
            )}
            {groups.map(g => (
                <Group
                    key={g.key}
                    group={g}
                    collapsible={g.key === "active" || g.key === "offline"}
                    onOpen={onOpen}
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
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M18.3 5.7L12 12l6.3 6.3-1.4 1.4L10.6 13.4 4.3 19.7 2.9 18.3 9.2 12 2.9 5.7l1.4-1.4 6.3 6.3 6.3-6.3z" /></svg>
                </button>
                <div className="vc-vrcx-dialog-head">
                    <img className="vc-vrcx-dialog-av" src={info?.avatarImageUrl ?? friend.thumbnail ?? ""} alt="" />
                    <div className="vc-vrcx-dialog-headtext">
                        <div className="vc-vrcx-dialog-name">
                            <span className={"vc-vrcx-status vc-vrcx-status-" + friend.state} />
                            <span style={{ color: trustColor(trust) }}>{friend.displayName}</span>
                        </div>
                        <span className="vc-vrcx-dialog-trust" style={{ color: trustColor(trust) }}>{trust || "—"}</span>
                        {info?.statusDescription && <div className="vc-vrcx-dialog-statusdesc">{info.statusDescription}</div>}
                    </div>
                </div>

                <div className="vc-vrcx-dialog-body">
                    <div className="vc-vrcx-dialog-loc">
                        {loc.flag && <span className="vc-vrcx-flag">{loc.flag}</span>}
                        {locationLabel(info?.location ?? friend.lastLocation, friend.lastWorld, friend.state)}
                    </div>

                    <div className="vc-vrcx-dialog-field">
                        <div className="vc-vrcx-dialog-label">Bio</div>
                        <div className="vc-vrcx-dialog-bio">{loading ? "載入中…" : statVal(info?.bio ?? null)}</div>
                    </div>

                    {info?.representedGroup && (
                        <div className="vc-vrcx-dialog-field">
                            <div className="vc-vrcx-dialog-label">Represented Group</div>
                            <div>{info.representedGroup}</div>
                        </div>
                    )}

                    <div className="vc-vrcx-dialog-stats">
                        <div><div className="vc-vrcx-dialog-label">Last Seen</div><div>{fmtDateTime(info?.lastLogin ?? null)}</div></div>
                        <div><div className="vc-vrcx-dialog-label">Last Activity</div><div>{fmtDateTime(info?.lastActivity ?? null)}</div></div>
                        <div><div className="vc-vrcx-dialog-label">Date Joined</div><div>{statVal(info?.dateJoined ?? null)}</div></div>
                    </div>

                    {info && info.bioLinks.length > 0 && (
                        <div className="vc-vrcx-dialog-field">
                            <div className="vc-vrcx-dialog-label">Links</div>
                            {info.bioLinks.map((l, i) => <div key={i} className="vc-vrcx-dialog-link">{l}</div>)}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export const Panel = ErrorBoundary.wrap(PanelInner, { noop: true });
