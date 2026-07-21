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

// trust level -> VRCX 慣用顏色(用於名稱著色)
export function trustColor(trust: string): string {
    switch (trust) {
        case "Veteran User":
        case "Trusted User": return "#ff7b42"; // 橙(Trusted)
        case "Known User": return "#f7c34c";   // 金(Known)
        case "User": return "#2bcf5c";         // 綠(User)
        case "New User": return "#1778ff";     // 藍(New)
        case "Visitor": return "#cccccc";      // 灰
        case "Nuisance User": return "#782f2f";
        default: return "#8a6bde";             // 預設(未知/其他)紫
    }
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
