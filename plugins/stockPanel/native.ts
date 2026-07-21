/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { IpcMainInvokeEvent } from "electron";
import { BrowserWindow, shell, WebContentsView } from "electron";

interface ChartBounds {
    x: number;
    y: number;
    width: number;
    height: number;
}

let view: WebContentsView | null = null;
let host: BrowserWindow | null = null;

function destroyView() {
    if (view) {
        host?.contentView.removeChildView(view);
        view.webContents.close();
        view = null;
    }
    host?.webContents.removeListener("did-start-loading", destroyView);
    host = null;
}

// 完整版 TradingView 以 frame-ancestors 'none' 禁止 iframe,且 embed widget 無台股(TWSE)授權;
// 改以 WebContentsView 疊在主視窗的頁面區域上,載入完整站,涵蓋所有市場
export function openChart(event: IpcMainInvokeEvent, bounds: ChartBounds, url: string) {
    destroyView();
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;

    view = new WebContentsView({
        webPreferences: {
            sandbox: true,
            contextIsolation: true,
            nodeIntegration: false
        }
    });
    view.setBackgroundColor("#131722");
    view.webContents.setWindowOpenHandler(({ url: external }) => {
        shell.openExternal(external);
        return { action: "deny" };
    });

    win.contentView.addChildView(view);
    view.setBounds(bounds);
    view.webContents.loadURL(url);
    host = win;
    // 主 renderer 重載(Ctrl+R)時自動回收;註冊與移除皆走 host.webContents 同一參照
    host.webContents.once("did-start-loading", destroyView);
}

export function setChartBounds(_: IpcMainInvokeEvent, bounds: ChartBounds) {
    view?.setBounds(bounds);
}

export function closeChart() {
    destroyView();
}
