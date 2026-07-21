/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// lucide 圖示(ISC 授權開源圖標集),對齊 VRCX 使用的 lucide-vue-next。
// 統一 stroke 樣式(round cap/join、寬 2),與 lucide 一致。

interface IconProps {
    size?: number;
    className?: string;
}

function svg(size: number, className: string | undefined, children: React.ReactNode) {
    return (
        <svg
            width={size} height={size} viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            className={className}
        >
            {children}
        </svg>
    );
}

export const Icon = {
    // lucide: chevron-right
    ChevronRight: ({ size = 16, className }: IconProps) => svg(size, className, <path d="m9 18 6-6-6-6" />),
    // lucide: arrow-right
    ArrowRight: ({ size = 16, className }: IconProps) => svg(size, className, <><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></>),
    // lucide: arrow-down
    ArrowDown: ({ size = 16, className }: IconProps) => svg(size, className, <><path d="M12 5v14" /><path d="m19 12-7 7-7-7" /></>),
    // lucide: search
    Search: ({ size = 16, className }: IconProps) => svg(size, className, <><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></>),
    // lucide: refresh-cw
    RefreshCw: ({ size = 16, className }: IconProps) => svg(size, className, <><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" /><path d="M8 16H3v5" /></>),
    // lucide: x
    X: ({ size = 16, className }: IconProps) => svg(size, className, <><path d="M18 6 6 18" /><path d="m6 6 12 12" /></>),
    // lucide: copy
    Copy: ({ size = 16, className }: IconProps) => svg(size, className, <><rect width="14" height="14" x="8" y="8" rx="2" ry="2" /><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" /></>),
    // lucide: external-link
    ExternalLink: ({ size = 16, className }: IconProps) => svg(size, className, <><path d="M15 3h6v6" /><path d="M10 14 21 3" /><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /></>)
};

// 國旗:用 flagcdn 圖片(Windows 字體不渲染 emoji 國旗)
export function Flag({ cc, className }: { cc: string; className?: string; }) {
    return <img className={className ?? "vc-vrcx-flag-img"} src={`https://flagcdn.com/${cc}.svg`} alt={cc} />;
}

// LINKS:依網域判斷社群平台,回傳品牌圖示元件與名稱(對齊 VRCX 顯示平台標誌)。
interface PlatformInfo {
    name: string;
    icon: (p: { size?: number; }) => any;
}

const STEAM_PATH = "M11.98 0C5.76 0 .68 4.72.05 10.74l6.44 2.66a3.4 3.4 0 0 1 1.9-.58l2.86-4.15v-.06a4.54 4.54 0 1 1 4.54 4.54h-.1l-4.08 2.92c0 .05.01.1.01.16a3.4 3.4 0 0 1-6.75.55L.24 14.9C1.7 20.13 6.4 24 12 24c6.63 0 12-5.37 12-12S18.63 0 11.98 0zm-3.9 18.22l-1.47-.61a2.55 2.55 0 0 0 4.7-1.34 2.55 2.55 0 0 0-2.55-2.55c-.33 0-.65.06-.94.18l1.52.63a1.88 1.88 0 1 1-1.44 3.47 1.87 1.87 0 0 1-.32-.68zm10.4-8.32a3.02 3.02 0 1 0-6.04 0 3.02 3.02 0 0 0 6.04 0zm-5.28-.01a2.27 2.27 0 1 1 4.54 0 2.27 2.27 0 0 1-4.54 0z";
const X_PATH = "M18.9 1.15h3.68l-8.04 9.19L24 22.85h-7.4l-5.8-7.58-6.64 7.58H.47l8.6-9.83L0 1.15h7.6l5.24 6.93 6.06-6.93zm-1.3 19.5h2.04L6.5 3.24H4.31L17.6 20.65z";
const DISCORD_PATH = "M20.32 4.37A19.8 19.8 0 0 0 15.44 2.9a.07.07 0 0 0-.08.04c-.2.38-.44.87-.6 1.25a18.3 18.3 0 0 0-5.5 0 12.6 12.6 0 0 0-.6-1.25.08.08 0 0 0-.08-.04A19.7 19.7 0 0 0 3.7 4.37a.07.07 0 0 0-.03.03C.53 9.05-.32 13.6.1 18.1a.08.08 0 0 0 .03.06 19.9 19.9 0 0 0 6 3.03.08.08 0 0 0 .08-.03c.46-.63.87-1.3 1.23-2a.08.08 0 0 0-.04-.1 13 13 0 0 1-1.87-.9.08.08 0 0 1 0-.13l.37-.29a.07.07 0 0 1 .08-.01c3.93 1.8 8.18 1.8 12.06 0a.07.07 0 0 1 .08 0l.37.3a.08.08 0 0 1 0 .12c-.6.36-1.22.66-1.87.9a.08.08 0 0 0-.04.1c.36.7.78 1.37 1.23 2a.08.08 0 0 0 .08.03 19.8 19.8 0 0 0 6.01-3.03.08.08 0 0 0 .03-.05c.5-5.18-.84-9.7-3.55-13.7a.06.06 0 0 0-.03-.03zM8.02 15.33c-1.18 0-2.16-1.09-2.16-2.42s.96-2.42 2.16-2.42c1.21 0 2.18 1.1 2.16 2.42 0 1.33-.96 2.42-2.16 2.42zm7.97 0c-1.18 0-2.16-1.09-2.16-2.42s.96-2.42 2.16-2.42c1.21 0 2.18 1.1 2.16 2.42 0 1.33-.95 2.42-2.16 2.42z";

function brandIcon(path: string) {
    return function BrandIcon({ size = 16 }: { size?: number; }) {
        return <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor"><path d={path} /></svg>;
    };
}

const PLATFORMS: Array<{ match: RegExp; info: PlatformInfo; }> = [
    { match: /steamcommunity\.com|steampowered\.com/, info: { name: "Steam", icon: brandIcon(STEAM_PATH) } },
    { match: /twitter\.com|x\.com/, info: { name: "X", icon: brandIcon(X_PATH) } },
    { match: /discord\.(gg|com)/, info: { name: "Discord", icon: brandIcon(DISCORD_PATH) } }
];

export function platformFor(url: string): PlatformInfo | null {
    for (const p of PLATFORMS) if (p.match.test(url)) return p.info;
    return null;
}
