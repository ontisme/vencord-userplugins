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

function svg(size: number, className: string | undefined, children: any) {
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
    // lucide: chevron-down
    ChevronDown: ({ size = 16, className }: IconProps) => svg(size, className, <path d="m6 9 6 6 6-6" />),
    // lucide: arrow-right
    ArrowRight: ({ size = 16, className }: IconProps) => svg(size, className, <><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></>),
    // lucide: arrow-down
    ArrowDown: ({ size = 16, className }: IconProps) => svg(size, className, <><path d="M12 5v14" /><path d="m19 12-7 7-7-7" /></>),
    // lucide: search
    Search: ({ size = 16, className }: IconProps) => svg(size, className, <><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></>),
    // lucide: refresh-cw
    RefreshCw: ({ size = 16, className }: IconProps) => svg(size, className, <><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" /><path d="M8 16H3v5" /></>),
    // lucide: x
    X: ({ size = 16, className }: IconProps) => svg(size, className, <><path d="M18 6 6 18" /><path d="m6 6 12 12" /></>)
};
