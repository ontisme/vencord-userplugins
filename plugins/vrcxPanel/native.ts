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

// VRChat 頭像與縮圖 CDN;需重啟 Vesktop 生效
CspPolicies["api.vrchat.cloud"] = ["img-src"];

const DB_PATH = join(process.env.APPDATA ?? "", "VRCX", "VRCX.sqlite3");

export type FeedType = "gps" | "online" | "offline" | "status" | "avatar" | "bio";

export interface FeedEntry {
    createdAt: string;
    type: FeedType;
    userId: string;
    displayName: string;
    detail: string;
    location: string | null;
    thumbnail: string | null;
}

export interface Friend {
    userId: string;
    displayName: string;
    trustLevel: string;
    friendNumber: number;
    state: "online" | "offline" | "unknown";
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

    // gps: id, created_at, user_id, display_name, location, world_name, previous_location, time, group_name
    if (want("gps") && t("_feed_gps")) {
        for (const [, r] of collect(db, t("_feed_gps"))) {
            out.push({ createdAt: s(r[1]), type: "gps", userId: s(r[2]), displayName: s(r[3]), detail: s(r[5]), location: s(r[4]) || null, thumbnail: null });
        }
    }
    // online_offline: id, created_at, user_id, display_name, type, location, world_name, time, group_name
    if (t("_feed_online_offline")) {
        for (const [, r] of collect(db, t("_feed_online_offline"))) {
            const isOnline = s(r[4]) === "Online";
            if (!want(isOnline ? "online" : "offline")) continue;
            const world = s(r[6]);
            out.push({ createdAt: s(r[1]), type: isOnline ? "online" : "offline", userId: s(r[2]), displayName: s(r[3]), detail: world || s(r[4]), location: s(r[5]) || null, thumbnail: null });
        }
    }
    // status: id, created_at, user_id, display_name, status, status_description, ...
    if (want("status") && t("_feed_status")) {
        for (const [, r] of collect(db, t("_feed_status"))) {
            const desc = s(r[5]);
            out.push({ createdAt: s(r[1]), type: "status", userId: s(r[2]), displayName: s(r[3]), detail: desc ? `${s(r[4])} — ${desc}` : s(r[4]), location: null, thumbnail: null });
        }
    }
    // avatar: id, created_at, user_id, display_name, owner_id, avatar_name, current_avatar_image_url, current_avatar_thumbnail_image_url, ...
    if (want("avatar") && t("_feed_avatar")) {
        for (const [, r] of collect(db, t("_feed_avatar"))) {
            out.push({ createdAt: s(r[1]), type: "avatar", userId: s(r[2]), displayName: s(r[3]), detail: s(r[5]), location: null, thumbnail: s(r[7]) || null });
        }
    }
    // bio: id, created_at, user_id, display_name, bio, previous_bio
    if (want("bio") && t("_feed_bio")) {
        for (const [, r] of collect(db, t("_feed_bio"))) {
            out.push({ createdAt: s(r[1]), type: "bio", userId: s(r[2]), displayName: s(r[3]), detail: s(r[4]).slice(0, 200), location: null, thumbnail: null });
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
                state: st?.state ?? "unknown",
                lastLocation: location,
                lastWorld: world,
                lastSeen,
                thumbnail: null
            });
        }
    }
    return friends;
}
