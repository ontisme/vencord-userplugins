/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { PluginNative } from "@utils/types";
import { findComponentByCodeLazy } from "@webpack";
import { FluxDispatcher, ReactDOM, useEffect, useReducer, useRef } from "@webpack/common";

const Native = VencordNative.pluginHelpers.StockPanel as PluginNative<typeof import("./native")>;

// 私訊側欄原生連結按鈕(好友/Nitro/商店同款)
const LinkButton = findComponentByCodeLazy("nitroHoverGradient:", "iconClassName:");

// 完整版 TradingView(zh_TW),symbol search 涵蓋全球所有市場(含台股 TWSE)
const CHART_URL = "https://tw.tradingview.com/chart/?symbol=TWSE%3A2330";

let open = false;
const listeners = new Set<() => void>();

function setOpen(value: boolean) {
    open = value;
    listeners.forEach(fn => fn());
}

function useOpen(): boolean {
    const [, forceUpdate] = useReducer(x => x + 1, 0);
    useEffect(() => {
        listeners.add(forceUpdate);
        return () => void listeners.delete(forceUpdate);
    }, []);
    return open;
}

function StockIcon({ className }: { size?: string; className?: string; color?: string; }) {
    return (
        <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M3 17l5-6 4 3 6-8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M14 6h5v5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

export function StockLink(props: any) {
    const isOpen = useOpen();
    return (
        <>
            <LinkButton
                route="/channels/@me"
                selected={isOpen}
                icon={StockIcon}
                text="股票"
                onClick={() => setOpen(!isOpen)}
                {...props}
            />
            {isOpen && <StockPagePortal />}
        </>
    );
}

function StockPagePortal() {
    const target = document.querySelector('[class*="page_"]');
    if (!target) return null;
    return ReactDOM.createPortal(<StockPage />, target);
}

function StockPage() {
    const hostRef = useRef<HTMLDivElement>(null);

    // WebContentsView 貼齊 host 區域;尺寸與視窗變動時同步座標
    useEffect(() => {
        const el = hostRef.current;
        if (!el) return;

        const measure = () => {
            const r = el.getBoundingClientRect();
            return {
                x: Math.round(r.left),
                y: Math.round(r.top),
                width: Math.round(r.width),
                height: Math.round(r.height)
            };
        };

        Native.openChart(measure(), CHART_URL);

        const sync = () => Native.setChartBounds(measure());
        const ro = new ResizeObserver(sync);
        ro.observe(el);
        window.addEventListener("resize", sync);

        return () => {
            ro.disconnect();
            window.removeEventListener("resize", sync);
            Native.closeChart();
        };
    }, []);

    // 任一導覽動作即關閉:切頻道、點擊頁面外的路由連結;ESC 亦可關閉
    useEffect(() => {
        const close = () => setOpen(false);

        function onKeyDown(e: KeyboardEvent) {
            if (e.key === "Escape") close();
        }
        function onClick(e: MouseEvent) {
            const el = e.target as HTMLElement;
            if (el.closest(".vc-stock-page")) return;
            if (el.closest("a[href^='/']")) close();
        }

        FluxDispatcher.subscribe("CHANNEL_SELECT", close);
        document.addEventListener("keydown", onKeyDown);
        document.addEventListener("click", onClick, true);
        return () => {
            FluxDispatcher.unsubscribe("CHANNEL_SELECT", close);
            document.removeEventListener("keydown", onKeyDown);
            document.removeEventListener("click", onClick, true);
        };
    }, []);

    return (
        <div className="vc-stock-page">
            <div className="vc-stock-host" ref={hostRef}>
                <span className="vc-stock-loading">TradingView 載入中</span>
            </div>
        </div>
    );
}
