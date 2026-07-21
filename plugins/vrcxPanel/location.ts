/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// VRChat location 字串解析,對齊 VRCX Detail 欄呈現。
// 格式:wrld_xxx:<instanceId>~<type>(<ownerId>)~region(jp)~... 或 "traveling"、"private"、""。

export interface ParsedLocation {
    instanceType: string | null; // Public / Friends+ / Friends / Invite+ / Invite / Group / Group+ / Group Public
    region: string | null;       // us / use / eu / jp
    flag: string | null;         // 對應 region 的國旗 emoji
}

// region -> 國旗 emoji(VRChat 主要區域)
const REGION_FLAG: Record<string, string> = {
    us: "🇺🇸", // 美
    use: "🇺🇸",
    usw: "🇺🇸",
    eu: "🇪🇺", // 歐盟
    jp: "🇯🇵" // 日
};

export function parseLocation(location: string | null): ParsedLocation {
    const empty: ParsedLocation = { instanceType: null, region: null, flag: null };
    if (!location || location === "traveling" || location === "private" || location === "offline") return empty;

    // region
    const regionMatch = location.match(/~region\(([^)]+)\)/);
    const region = regionMatch ? regionMatch[1].toLowerCase() : "us"; // 無標記預設 us(VRChat 預設)
    const flag = REGION_FLAG[region] ?? REGION_FLAG.us;

    // instance 類型:依 location 標記(order 依 VRChat 存取層級)
    let instanceType: string;
    if (location.includes("~groupAccessType(public)")) instanceType = "Group Public";
    else if (location.includes("~groupAccessType(plus)")) instanceType = "Group+";
    else if (location.includes("~group(")) instanceType = "Group";
    else if (location.includes("~private(") && location.includes("~canRequestInvite")) instanceType = "Invite+";
    else if (location.includes("~private(")) instanceType = "Invite";
    else if (location.includes("~friends(")) instanceType = "Friends";
    else if (location.includes("~hidden(")) instanceType = "Friends+";
    else instanceType = "Public";

    return { instanceType, region, flag };
}

// trust level -> 名稱顏色(對齊 VRCX TRUST_COLOR_DEFAULTS,appearance.js:94-102)
export function trustColor(trust: string): string {
    switch (trust) {
        case "Trusted User": return "#B18FFF"; // veteran 紫
        case "Known User": return "#FF7B42";   // trusted 橙
        case "User": return "#2BCF5C";         // known 綠
        case "New User": return "#1778FF";     // basic 藍
        case "Nuisance User": return "#782F2F"; // troll 暗紅
        default: return "#CCCCCC";             // untrusted / Visitor 灰白
    }
}

// 好友狀態點的 class(對齊 VRCX userStatusClass,user.js:57-149)。
// 回傳:online/joinme/askme/busy/offline(實心) 或 active/active-joinme/active-askme/active-busy(空心描邊)。
export function statusDotClass(f: {
    rawState: "online" | "active" | "offline";
    status: string;
}): string {
    const status = f.status;
    // rawState offline -> 灰實心
    if (f.rawState === "offline") return "offline";
    // rawState active(app 在線但未進遊戲):同色空心描邊圈
    if (f.rawState === "active") {
        if (status === "join me") return "active-joinme";
        if (status === "ask me") return "active-askme";
        if (status === "busy") return "active-busy";
        return "active";
    }
    // rawState online(在遊戲中):依 status 給實心色
    if (status === "join me") return "joinme";
    if (status === "ask me") return "askme";
    if (status === "busy") return "busy";
    return "online"; // active status 或缺失 -> 綠實心
}

// 側欄位置/狀態顯示文字(對齊 VRCX):location 為 VRChat API 原值,worldName 由前端可選補上。
// private -> Private;offline/空 -> Offline;traveling -> 移動中;否則 world 名(+ instance 類型)。
export function locationLabel(location: string | null, worldName: string | null, state: "online" | "offline" | "unknown"): string {
    if (location === "private") return "Private";
    if (location === "traveling") return "移動中";
    if (state === "offline") return "Offline";
    if (!location || location === "offline") return state === "online" ? "Online" : "Offline";
    const { instanceType } = parseLocation(location);
    const base = worldName || "私人世界";
    return instanceType ? `${base} · ${instanceType}` : base;
}
