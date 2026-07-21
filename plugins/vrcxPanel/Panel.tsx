/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import ErrorBoundary from "@components/ErrorBoundary";
import { ReactDOM, useEffect, useReducer, useRef, useState } from "@webpack/common";

import {
    type FeedEntry, type FeedType, type Friend, getFeed, getFilter, getFriends,
    isAvailable, loadMore, setFilter, startPolling, stopPolling, subscribe
} from "./data";

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

function fmtDate(iso: string): string {
    // 2026-07-21T17:29:35Z -> 07/21 01:29(當地)
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso.slice(5, 16).replace("T", " ");
    const p = (n: number) => String(n).padStart(2, "0");
    return `${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// location 字串 -> instance 類型標籤
function instanceType(location: string | null): string | null {
    if (!location || location === "traveling" || location === "private") return null;
    if (location.includes("~private")) return "Private";
    if (location.includes("~friends(")) return "Friends";
    if (location.includes("~friends")) return "Friends+";
    if (location.includes("~hidden")) return "Friends+";
    if (location.includes("~group")) return "Group";
    return "Public";
}

function FeedTable() {
    const feed = getFeed();
    const filter = getFilter();

    return (
        <div className="vc-vrcx-feed">
            <div className="vc-vrcx-filters">
                {FILTERS.map(f => (
                    <button
                        key={f.key}
                        className={"vc-vrcx-filter" + (filter === f.key ? " vc-vrcx-filter-active" : "")}
                        onClick={() => setFilter(f.key)}
                    >
                        {f.label}
                    </button>
                ))}
            </div>
            <div className="vc-vrcx-table">
                <div className="vc-vrcx-row vc-vrcx-head">
                    <span className="vc-vrcx-c-date">Date</span>
                    <span className="vc-vrcx-c-type">Type</span>
                    <span className="vc-vrcx-c-user">User</span>
                    <span className="vc-vrcx-c-detail">Detail</span>
                </div>
                <div className="vc-vrcx-body">
                    {feed.map((e, i) => <FeedRow key={i} entry={e} />)}
                    {feed.length > 0 && (
                        <div className="vc-vrcx-more">
                            <button onClick={loadMore}>載入更多</button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function FeedRow({ entry }: { entry: FeedEntry; }) {
    const inst = instanceType(entry.location);
    return (
        <div className="vc-vrcx-row">
            <span className="vc-vrcx-c-date">{fmtDate(entry.createdAt)}</span>
            <span className="vc-vrcx-c-type">
                <span className={"vc-vrcx-tag vc-vrcx-tag-" + entry.type}>{TYPE_LABEL[entry.type]}</span>
            </span>
            <span className="vc-vrcx-c-user">{entry.displayName}</span>
            <span className="vc-vrcx-c-detail">
                {entry.detail}
                {inst && <span className="vc-vrcx-inst"> · {inst}</span>}
            </span>
        </div>
    );
}

function FriendRow({ friend }: { friend: Friend; }) {
    const dot = friend.state === "online" ? "online" : friend.state === "offline" ? "offline" : "unknown";
    return (
        <div className="vc-vrcx-friend">
            <span className={"vc-vrcx-dot vc-vrcx-dot-" + dot} />
            <div className="vc-vrcx-friend-text">
                <span className="vc-vrcx-friend-name">{friend.displayName}</span>
                {friend.lastWorld && <span className="vc-vrcx-friend-loc">{friend.lastWorld}</span>}
            </div>
        </div>
    );
}

function Sidebar() {
    const friends = getFriends();
    const online = friends.filter(f => f.state === "online").sort((a, b) => a.displayName.localeCompare(b.displayName));
    const offline = friends.filter(f => f.state !== "online").sort((a, b) => a.displayName.localeCompare(b.displayName));

    return (
        <div className="vc-vrcx-sidebar">
            <div className="vc-vrcx-side-head">好友 ({friends.length})</div>
            <div className="vc-vrcx-side-note">線上狀態為 VRCX 歷史推估</div>
            <div className="vc-vrcx-group-title">ONLINE — {online.length}</div>
            {online.map(f => <FriendRow key={f.userId} friend={f} />)}
            <div className="vc-vrcx-group-title">OFFLINE — {offline.length}</div>
            {offline.map(f => <FriendRow key={f.userId} friend={f} />)}
        </div>
    );
}

function PanelInner() {
    const [, force] = useReducer(x => x + 1, 0);
    useEffect(() => {
        const unsub = subscribe(force);
        startPolling();
        return () => { unsub(); stopPolling(); };
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
            <Sidebar />
        </div>
    );
}

const Panel = ErrorBoundary.wrap(PanelInner, { noop: true });

// 好友頁內容容器(分頁列下方那塊):覆蓋目標。
// 不猜 class:從分頁列(含我的 VRCX 分頁)往上找 <nav>/tablist,取其後續兄弟作為內容區;
// 皆失敗才退回 class 猜測。以錨點相對定位,較不受 Discord class 改名影響。
function findContentHost(tabEl: HTMLElement | null): HTMLElement | null {
    if (tabEl) {
        const bar = tabEl.closest('[role="tablist"]') ?? tabEl.closest("nav") ?? tabEl.parentElement;
        // 分頁列之後的內容區:優先取分頁列的下一個兄弟,否則取其父層的下一個兄弟
        let content = bar?.nextElementSibling as HTMLElement | null;
        if (!content && bar?.parentElement) content = bar.parentElement.nextElementSibling as HTMLElement | null;
        if (content) return content;
    }
    return (document.querySelector('[class*="peopleColumn"]')
        ?? document.querySelector('[class*="friendsTable"]')
        ?? document.querySelector('[class*="page_"]')) as HTMLElement | null;
}

// 分頁文字「VRCX」;偵測自身所在分頁是否被選中,選中時 portal 覆蓋內容區。
// 不依賴 Discord 內部 section switch(易碎),以 aria-selected 判斷選中狀態。
export function TabLabel() {
    const ref = useRef<HTMLSpanElement>(null);
    const [selected, setSelected] = useState(false);

    useEffect(() => {
        const span = ref.current;
        if (!span) return;
        const tab = span.closest('[role="tab"]') ?? span.closest("[aria-selected]") ?? span.parentElement;
        if (!tab) return;

        const update = () => setSelected(tab.getAttribute("aria-selected") === "true");
        update();
        const mo = new MutationObserver(update);
        mo.observe(tab, { attributes: true, attributeFilter: ["aria-selected", "class"] });
        return () => mo.disconnect();
    }, []);

    return (
        <>
            <span ref={ref}>VRCX</span>
            {selected && <VrcxOverlay tabRef={ref} />}
        </>
    );
}

// 覆蓋層:portal 到好友內容容器,絕對定位填滿,蓋住原生好友清單
function VrcxOverlay({ tabRef }: { tabRef: React.RefObject<HTMLElement | null>; }) {
    const [host, setHost] = useState<HTMLElement | null>(null);

    useEffect(() => {
        // 內容容器可能於切換後才掛載,短輪詢等待其出現
        let tries = 0;
        let cancelled = false;
        const find = () => {
            if (cancelled) return;
            const h = findContentHost(tabRef.current);
            if (h) { setHost(h); return; }
            if (tries++ < 20) setTimeout(find, 50);
        };
        find();
        return () => { cancelled = true; };
    }, []);

    if (!host) return null;
    return ReactDOM.createPortal(
        <div className="vc-vrcx-overlay"><Panel /></div>,
        host
    );
}
