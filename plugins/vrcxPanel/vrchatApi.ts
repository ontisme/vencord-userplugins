/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// 按需(非背景輪詢)呼叫 VRChat API。復用 VRCX 資料庫裡的登入 cookie。
// 帳號安全:User-Agent 與 VRCX 一致、限制併發與最小間隔、401 時停用不重試。
import { existsSync, readFileSync } from "fs";
import { join } from "path";

const API_BASE = "https://api.vrchat.cloud/api/1";
const VRCX_DIR = join(process.env.APPDATA ?? "", "VRCX");

// User-Agent 動態取 VRCX 版本(與真 VRCX 一致);讀不到用保守預設
function userAgent(): string {
    try {
        const v = readFileSync(join(VRCX_DIR, "..", "..", "Local", "VRCX", "Version"), "utf-8").trim();
        if (v) return `VRCX ${v}`;
    } catch { /* ignore */ }
    // VRCX 安裝目錄的 Version 檔;退回 Roaming 旁常見路徑
    for (const p of [join(VRCX_DIR, "Version"), join(process.env.LOCALAPPDATA ?? "", "VRCX", "Version")]) {
        try {
            const v = readFileSync(p, "utf-8").trim();
            if (v) return `VRCX ${v}`;
        } catch { /* ignore */ }
    }
    return "VRCX 2026.07.18";
}

// 從 VRCX cookies 表(base64 JSON)組出 Cookie header;失敗回 null
function cookieHeader(readCookieRaw: () => string | null): string | null {
    const raw = readCookieRaw();
    if (!raw) return null;
    try {
        const arr = JSON.parse(Buffer.from(raw, "base64").toString("utf-8")) as Array<Record<string, string>>;
        const parts = arr
            .map(c => {
                const name = c.Name ?? c.name;
                const value = c.Value ?? c.value;
                return name && value ? `${name}=${value}` : null;
            })
            .filter(Boolean);
        return parts.length ? parts.join("; ") : null;
    } catch {
        return null;
    }
}

// 間隔守衛(帳號安全:不高頻)。用單一 promise chain 序列化,確保每次請求
// 之間至少間隔 MIN_GAP_MS;避免並行呼叫同時通過檢查而同時送出(競態)。
const MIN_GAP_MS = 350;
let lastAt = 0;
let gate: Promise<void> = Promise.resolve();
let disabledUntil = 0; // 401/429 後暫時停用

const delay = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

// 排隊取得發送許可:回傳的 promise 解析時即代表「輪到你、且已滿足最小間隔」
function throttle(): Promise<void> {
    const wait = gate.then(async () => {
        const gap = Math.max(0, lastAt + MIN_GAP_MS - Date.now());
        if (gap > 0) await delay(gap);
        lastAt = Date.now();
    });
    // 下一個排隊者接在本次之後(忽略錯誤,僅用於串接時序)
    gate = wait.catch(() => {});
    return wait;
}

export interface ApiDeps {
    readCookieRaw: () => string | null; // 由 native 傳入(讀 VRCX cookies 表)
}

async function apiGet(path: string, deps: ApiDeps): Promise<any | null> {
    if (Date.now() < disabledUntil) return null;
    const cookie = cookieHeader(deps.readCookieRaw);
    if (!cookie) return null;

    await throttle();
    // 排隊期間同批的前一個請求可能已觸發停用(401/429),送出前再檢查一次
    if (Date.now() < disabledUntil) return null;
    try {
        const res = await fetch(`${API_BASE}/${path}`, {
            method: "GET",
            headers: {
                "User-Agent": userAgent(),
                Cookie: cookie,
                Accept: "application/json"
            }
        });
        if (res.status === 401 || res.status === 403) {
            // 認證失效:停用 5 分鐘,降級回資料庫
            disabledUntil = Date.now() + 5 * 60_000;
            return null;
        }
        if (res.status === 429) {
            // rate limit:停用 2 分鐘
            disabledUntil = Date.now() + 2 * 60_000;
            return null;
        }
        if (!res.ok) return null;
        return await res.json();
    } catch {
        return null;
    }
}

export interface ApiFriend {
    id: string;
    displayName: string;
    currentAvatarThumbnailImageUrl?: string;
    userIcon?: string;
    profilePicOverride?: string;
    status?: string;
    location?: string;
    state?: string; // online / active / offline
}

// 好友清單(含即時狀態與頭像)。offline=false 拿線上,offline=true 拿離線。
export async function fetchFriends(deps: ApiDeps, offline: boolean): Promise<ApiFriend[] | null> {
    const all: ApiFriend[] = [];
    // VRChat 分頁,每頁最多 100;按需拉取,線上通常一兩頁
    for (let offset = 0; offset < 500; offset += 100) {
        const page = await apiGet(`auth/user/friends?offline=${offline}&n=100&offset=${offset}`, deps);
        // 第一頁就失敗(null:認證失效/限流/網路錯誤)視為整體失敗,回 null 讓前端降級。
        // 非陣列或空頁代表已無更多資料,結束分頁但保留已拿到的結果。
        if (page == null) return offset === 0 ? null : all;
        if (!Array.isArray(page) || page.length === 0) break;
        all.push(...page);
        if (page.length < 100) break;
    }
    return all;
}

export interface FavoriteGroup {
    name: string;
    displayName: string;
    userIds: string[];
}

// FAVORITES 收藏好友分組(favorite/groups 定義 + favorites 成員)
export async function fetchFavoriteFriends(deps: ApiDeps): Promise<FavoriteGroup[] | null> {
    const groups = await apiGet("favorite/groups?type=friend&n=50", deps);
    if (!Array.isArray(groups)) return null;

    const favorites = await apiGet("favorites?type=friend&n=100", deps);
    const byGroup = new Map<string, string[]>();
    if (Array.isArray(favorites)) {
        for (const fav of favorites) {
            const g = fav.tags?.[0] ?? "";
            if (!byGroup.has(g)) byGroup.set(g, []);
            byGroup.get(g)!.push(fav.favoriteId ?? fav.id);
        }
    }
    return groups.map((g: any) => ({
        name: g.name,
        displayName: g.displayName || g.name,
        userIds: byGroup.get(g.name) ?? []
    }));
}

export function apiAvailable(deps: ApiDeps): boolean {
    return Date.now() >= disabledUntil && existsSync(join(VRCX_DIR, "VRCX.sqlite3")) && cookieHeader(deps.readCookieRaw) != null;
}
