/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { CspPolicies } from "@main/csp";
import type { IpcMainInvokeEvent } from "electron";
import { existsSync } from "fs";
import { join } from "path";

import { type Db, openDb } from "./sqlite";
import { type ApiFriend, apiAvailable, type ApiUser, type FavoriteGroup, fetchCurrentUser, fetchFavoriteFriends, fetchFriends, fetchUser } from "./vrchatApi";

// VRChat 頭像與縮圖 CDN;需重啟 Vesktop 生效。
// api.vrchat.cloud 的 image 端點會 302 轉址到 files.vrchat.cloud,兩者都要放行。
CspPolicies["api.vrchat.cloud"] = ["img-src"];
CspPolicies["files.vrchat.cloud"] = ["img-src"];
CspPolicies["*.vrchat.cloud"] = ["img-src"];

const DB_PATH = join(process.env.APPDATA ?? "", "VRCX", "VRCX.sqlite3");

// 讀 VRCX cookies 表(供 vrchatApi 復用登入 cookie);唯讀、單筆 default。
// 可傳入已開啟的 db 共用,避免重複讀取整個 sqlite 檔。
function readCookieRaw(db: Db): string | null {
    const t = db.tables["cookies"];
    if (!t) return null;
    for (const [, r] of db.walkTable(t)) {
        if (s(r[0]) === "default") return s(r[1]) || null;
    }
    return null;
}

// 開一次 db,自行處理錯誤;失敗回 null
function openDbSafe(): Db | null {
    try {
        return openDb(DB_PATH);
    } catch {
        return null;
    }
}

export type FeedType = "gps" | "online" | "offline" | "status" | "avatar" | "bio";

export interface FeedEntry {
    createdAt: string;
    type: FeedType;
    userId: string;
    displayName: string;
    detail: string;
    location: string | null;
    thumbnail: string | null;
    // 展開行用的額外欄位(依 type 選填)
    worldName?: string;              // gps/online/offline 世界名
    previousLocation?: string;       // gps 前一個位置
    time?: number;                   // gps/offline 停留毫秒
    status?: string;                 // status 當前狀態
    statusDescription?: string;      // status 當前描述
    previousStatus?: string;         // status 前一狀態
    previousStatusDescription?: string;
    avatarName?: string;             // avatar 頭像名
    avatarThumbnail?: string;        // avatar 當前縮圖
    previousAvatarThumbnail?: string; // avatar 前一縮圖
    bio?: string;                    // bio 當前
    previousBio?: string;            // bio 前一
}

export interface Friend {
    userId: string;
    displayName: string;
    trustLevel: string;
    friendNumber: number;
    // rawState:VRChat 原始 state(online/active/offline),決定狀態點實心或空心
    rawState: "online" | "active" | "offline";
    // state:online/active 皆併為 online 供分組判定用(舊欄位保留)
    state: "online" | "offline" | "unknown";
    status: string;                 // join me / active / ask me / busy / offline(VRChat status)
    statusDescription: string;      // 使用者自訂狀態文字
    lastLocation: string | null;
    lastWorld: string | null;
    lastSeen: string | null;
    thumbnail: string | null;
}

function s(v: unknown): string {
    return typeof v === "string" ? v : v == null ? "" : String(v);
}

// 找當前登入者的表前綴(usr<hex>_feed_gps -> usr<hex>)
function findPrefix(db: Db): string | null {
    for (const name of Object.keys(db.tables)) {
        if (name.endsWith("_feed_gps")) return name.slice(0, -"_feed_gps".length);
    }
    return null;
}

function collect(db: Db, table: number): Array<[number, Array<string | number | Buffer | null>]> {
    const rows: Array<[number, Array<string | number | Buffer | null>]> = [];
    for (const r of db.walkTable(table)) rows.push(r);
    return rows;
}

export function getStatus(): { available: boolean; userId: string | null; dbPath: string; } {
    if (!existsSync(DB_PATH)) return { available: false, userId: null, dbPath: DB_PATH };
    try {
        const db = openDb(DB_PATH);
        const prefix = findPrefix(db);
        return { available: prefix != null, userId: prefix, dbPath: DB_PATH };
    } catch {
        return { available: false, userId: null, dbPath: DB_PATH };
    }
}

export function getFeed(_: IpcMainInvokeEvent, opts: { limit: number; filter: FeedType | "all"; }): FeedEntry[] {
    const db = openDb(DB_PATH);
    const prefix = findPrefix(db);
    if (!prefix) return [];
    const t = (suffix: string) => db.tables[prefix + suffix];

    const out: FeedEntry[] = [];
    const want = (type: FeedType) => opts.filter === "all" || opts.filter === type;

    // gps: 4=location 5=world_name 6=previous_location 7=time 8=group_name
    if (want("gps") && t("_feed_gps")) {
        for (const [, r] of collect(db, t("_feed_gps"))) {
            out.push({
                createdAt: s(r[1]), type: "gps", userId: s(r[2]), displayName: s(r[3]),
                detail: s(r[5]), location: s(r[4]) || null, thumbnail: null,
                worldName: s(r[5]), previousLocation: s(r[6]) || undefined, time: Number(r[7]) || undefined
            });
        }
    }
    // online_offline: 4=type 5=location 6=world_name 7=time
    if (t("_feed_online_offline")) {
        for (const [, r] of collect(db, t("_feed_online_offline"))) {
            const isOnline = s(r[4]) === "Online";
            if (!want(isOnline ? "online" : "offline")) continue;
            const world = s(r[6]);
            out.push({
                createdAt: s(r[1]), type: isOnline ? "online" : "offline", userId: s(r[2]), displayName: s(r[3]),
                detail: world || s(r[4]), location: s(r[5]) || null, thumbnail: null,
                worldName: world, time: Number(r[7]) || undefined
            });
        }
    }
    // status: 4=status 5=status_description 6=previous_status 7=previous_status_description
    if (want("status") && t("_feed_status")) {
        for (const [, r] of collect(db, t("_feed_status"))) {
            out.push({
                createdAt: s(r[1]), type: "status", userId: s(r[2]), displayName: s(r[3]),
                detail: s(r[5]), location: null, thumbnail: null,
                status: s(r[4]), statusDescription: s(r[5]),
                previousStatus: s(r[6]), previousStatusDescription: s(r[7])
            });
        }
    }
    // avatar: 5=avatar_name 6=cur_img 7=cur_thumb 8=prev_img 9=prev_thumb
    if (want("avatar") && t("_feed_avatar")) {
        for (const [, r] of collect(db, t("_feed_avatar"))) {
            out.push({
                createdAt: s(r[1]), type: "avatar", userId: s(r[2]), displayName: s(r[3]),
                detail: s(r[5]), location: null, thumbnail: s(r[7]) || null,
                avatarName: s(r[5]), avatarThumbnail: s(r[7]) || undefined, previousAvatarThumbnail: s(r[9]) || undefined
            });
        }
    }
    // bio: 4=bio 5=previous_bio
    if (want("bio") && t("_feed_bio")) {
        for (const [, r] of collect(db, t("_feed_bio"))) {
            out.push({
                createdAt: s(r[1]), type: "bio", userId: s(r[2]), displayName: s(r[3]),
                detail: s(r[4]).slice(0, 200), location: null, thumbnail: null,
                bio: s(r[4]), previousBio: s(r[5])
            });
        }
    }

    out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
    return out.slice(0, opts.limit);
}

export function getFriends(): Friend[] {
    const db = openDb(DB_PATH);
    const prefix = findPrefix(db);
    if (!prefix) return [];

    // 由 online_offline 各人最新一筆推估最後已知狀態
    const lastState = new Map<string, { state: "online" | "offline"; location: string | null; world: string | null; at: string; }>();
    const ooTable = db.tables[prefix + "_feed_online_offline"];
    if (ooTable) {
        for (const [, r] of collect(db, ooTable)) {
            const uid = s(r[2]);
            const at = s(r[1]);
            const prev = lastState.get(uid);
            if (!prev || at > prev.at) {
                lastState.set(uid, { state: s(r[4]) === "Online" ? "online" : "offline", location: s(r[5]) || null, world: s(r[6]) || null, at });
            }
        }
    }
    // gps 各人最新一筆補 world(較 online_offline 新時採用)
    const lastGps = new Map<string, { world: string; location: string; at: string; }>();
    const gpsTable = db.tables[prefix + "_feed_gps"];
    if (gpsTable) {
        for (const [, r] of collect(db, gpsTable)) {
            const uid = s(r[2]);
            const at = s(r[1]);
            const prev = lastGps.get(uid);
            if (!prev || at > prev.at) lastGps.set(uid, { world: s(r[5]), location: s(r[4]), at });
        }
    }
    // feed_avatar 各人最新一筆縮圖,補好友頭像(拿不到者前端用首字母色塊)
    const lastAvatar = new Map<string, { thumb: string; at: string; }>();
    const avTable = db.tables[prefix + "_feed_avatar"];
    if (avTable) {
        for (const [, r] of collect(db, avTable)) {
            const uid = s(r[2]);
            const at = s(r[1]);
            const thumb = s(r[7]);
            if (!thumb) continue;
            const prev = lastAvatar.get(uid);
            if (!prev || at > prev.at) lastAvatar.set(uid, { thumb, at });
        }
    }

    const friends: Friend[] = [];
    const fTable = db.tables[prefix + "_friend_log_current"];
    if (fTable) {
        for (const [, r] of collect(db, fTable)) {
            const uid = s(r[0]);
            const st = lastState.get(uid);
            const gps = lastGps.get(uid);
            let world = st?.world ?? null;
            let location = st?.location ?? null;
            let lastSeen = st?.at ?? null;
            // gps 更新且該人最後狀態為 online 時,以 gps 的 world 為準
            if (gps && st?.state === "online" && (!lastSeen || gps.at > lastSeen)) {
                world = gps.world; location = gps.location; lastSeen = gps.at;
            }
            friends.push({
                userId: uid,
                displayName: s(r[1]),
                trustLevel: s(r[2]),
                friendNumber: Number(r[3]) || 0,
                rawState: st?.state === "online" ? "online" : "offline",
                state: st?.state ?? "unknown",
                status: "",
                statusDescription: "",
                lastLocation: location,
                lastWorld: world,
                lastSeen,
                thumbnail: lastAvatar.get(uid)?.thumb ?? null
            });
        }
    }
    return friends;
}

export interface FriendGroup {
    key: string;   // favorites:<name> / online / active / offline
    title: string;
    friends: Friend[];
}

// 按需:用 VRChat API 拉即時好友(頭像/狀態/location)+ FAVORITES 分組。
// API 不可用(無 cookie / 過期 / rate limit)時回 null,前端降級用 getFriends()。
export async function getLiveFriends(): Promise<{ me: Friend | null; groups: FriendGroup[]; } | null> {
    // 開一次 db:同一次拉取內復用同一份 cookie 與 trust 對照,避免每個 API 呼叫都重讀整個檔案
    const db = openDbSafe();
    if (!db) return null;
    const cookieRaw = readCookieRaw(db);
    const deps = { readCookieRaw: () => cookieRaw };
    if (!apiAvailable(deps)) return null;

    const [online, offline, meUser] = await Promise.all([
        fetchFriends(deps, false),
        fetchFriends(deps, true),
        fetchCurrentUser(deps)
    ]);
    // 任一關鍵請求失敗(null:認證失效/限流)就整體降級,避免顯示不完整清單並誤標 usingApi
    if (online == null || offline == null) return null;

    const trustFromDb = readTrustMap(db);
    // online 與 active(在私人世界/離開視窗但在線)皆視為在線;其餘(含 state 缺失)視為離線
    function friendState(u: ApiFriend): Friend["state"] {
        return u.state === "online" || u.state === "active" ? "online" : "offline";
    }
    const rawState = (u: ApiFriend): Friend["rawState"] =>
        u.state === "online" ? "online" : u.state === "active" ? "active" : "offline";
    const toFriend = (u: ApiFriend): Friend => ({
        userId: u.id,
        displayName: u.displayName,
        trustLevel: trustFromDb.get(u.id) ?? "",
        friendNumber: 0,
        rawState: rawState(u),
        state: friendState(u),
        status: u.status ?? "",
        statusDescription: u.statusDescription ?? "",
        lastLocation: u.location ?? null,
        lastWorld: null,
        lastSeen: null,
        thumbnail: u.currentAvatarThumbnailImageUrl ?? u.userIcon ?? u.profilePicOverride ?? null
    });

    const onlineList = online.filter(u => u.state !== "active").map(toFriend);
    const activeList = online.filter(u => u.state === "active").map(toFriend);
    const offlineList = offline.map(toFriend);

    // FAVORITES 收藏分組(按需拉一次)
    const favGroups = await fetchFavoriteFriends(deps);
    const byId = new Map<string, Friend>();
    for (const f of [...onlineList, ...activeList, ...offlineList]) byId.set(f.userId, f);

    // 收藏分組只顯示「在線」的收藏好友;離線的收藏好友仍歸 OFFLINE。
    // 因此 favIds 只收在線收藏好友,用於從 ONLINE/ACTIVE 去重(避免重複),OFFLINE 不去重。
    const favOnlineIds = new Set<string>();
    const groups: FriendGroup[] = [];
    if (favGroups) {
        for (const g of favGroups) {
            const members = g.userIds
                .map(id => byId.get(id))
                .filter((f): f is Friend => f != null && f.state === "online");
            for (const m of members) favOnlineIds.add(m.userId);
            if (members.length) groups.push({ key: `favorites:${g.name}`, title: g.displayName, friends: members });
        }
    }
    const notFavOnline = (f: Friend) => !favOnlineIds.has(f.userId);
    groups.push({ key: "online", title: "ONLINE", friends: onlineList.filter(notFavOnline) });
    groups.push({ key: "active", title: "ACTIVE", friends: activeList.filter(notFavOnline) });
    // OFFLINE 含所有離線好友(含離線的收藏好友)
    groups.push({ key: "offline", title: "OFFLINE", friends: offlineList });

    const me: Friend | null = meUser ? {
        userId: meUser.id,
        displayName: meUser.displayName,
        trustLevel: trustFromTags(meUser),
        friendNumber: 0,
        rawState: "online",
        state: "online",
        status: s(meUser.status),
        statusDescription: s(meUser.statusDescription),
        lastLocation: meUser.location ?? null,
        lastWorld: null,
        lastSeen: null,
        thumbnail: meUser.currentAvatarThumbnailImageUrl ?? meUser.currentAvatarImageUrl ?? meUser.userIcon ?? null
    } : null;

    return { me, groups };
}

// 由 friend_log_current 建 userId -> trustLevel 對照(好友清單 API 不含 trust)。共用已開啟的 db。
function readTrustMap(db: Db): Map<string, string> {
    const map = new Map<string, string>();
    const prefix = findPrefix(db);
    if (!prefix) return map;
    const t = db.tables[prefix + "_friend_log_current"];
    if (t) for (const [, r] of collect(db, t)) map.set(s(r[0]), s(r[2]));
    return map;
}

// 由 VRChat tags 推 trust 等級(users/{id} 與部分好友資料含 system_trust_*)
function trustFromTags(u: { tags?: string[]; }): string {
    const tags = u.tags ?? [];
    if (tags.includes("system_trust_veteran") || tags.includes("system_trust_trusted")) return "Trusted User";
    if (tags.includes("system_trust_known")) return "Known User";
    if (tags.includes("system_trust_basic")) return "User";
    if (tags.includes("system_trust_intermediate")) return "New User";
    if (tags.includes("system_troll")) return "Nuisance User";
    return "Visitor";
}

export interface UserInfo {
    userId: string;
    displayName: string;
    trustLevel: string;
    status: string;
    statusDescription: string;
    bio: string;
    bioLinks: string[];
    location: string | null;
    avatarImageUrl: string | null;
    representedGroup: string | null;
    lastLogin: string | null;
    lastActivity: string | null;
    dateJoined: string | null;
}

// 按需(點好友時)拉單一使用者詳情,供 Info dialog。API 不可用回 null。
export async function getUser(_: IpcMainInvokeEvent, userId: string): Promise<UserInfo | null> {
    const db = openDbSafe();
    if (!db) return null;
    const cookieRaw = readCookieRaw(db);
    const deps = { readCookieRaw: () => cookieRaw };
    if (!apiAvailable(deps)) return null;

    const u: ApiUser | null = await fetchUser(deps, userId);
    if (!u) return null;
    return {
        userId: u.id,
        displayName: u.displayName,
        trustLevel: trustFromTags(u),
        status: s(u.status),
        statusDescription: s(u.statusDescription),
        bio: s(u.bio),
        bioLinks: Array.isArray(u.bioLinks) ? u.bioLinks : [],
        location: u.location ?? null,
        avatarImageUrl: u.currentAvatarThumbnailImageUrl ?? u.currentAvatarImageUrl ?? u.userIcon ?? null,
        representedGroup: u.representedGroup?.name ?? null,
        lastLogin: u.last_login ?? null,
        lastActivity: u.last_activity ?? null,
        dateJoined: u.date_joined ?? null
    };
}
