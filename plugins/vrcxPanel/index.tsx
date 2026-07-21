/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { findByPropsLazy } from "@webpack";
import definePlugin from "@utils/types";

import { checkAvailable } from "./data";
import { TabLabel } from "./Panel";

export const VRCX_SECTION = "VC_VRCX_PANEL";

// 好友頁 section 切換 action(minified store,runtime lazy 解析)
const TabBarActions = findByPropsLazy("transitionToSection", "setInitialSection");

// 進入好友頁時,若 VRCX 可讀則預設切到 VRCX 分頁(取代原本的線上)
async function maybeDefaultToVrcx() {
    if (!TabBarActions?.transitionToSection) return;
    if (await checkAvailable()) {
        TabBarActions.setInitialSection?.(VRCX_SECTION);
        TabBarActions.transitionToSection(VRCX_SECTION);
    }
}

export default definePlugin({
    name: "VrcxPanel",
    description: "好友頁新增 VRCX 分頁(預設顯示),遷移 VRCX 的 Feed 表格與好友側欄;僅在 VRCX 運行時讀取其資料庫顯示",
    authors: [{ name: "ontisme", id: 0n }],

    patches: [
        {
            // 好友頁模組(唯一含 "pendingFriends"):分頁列最前面插入 VRCX 分頁。
            // 內容不走 Discord 內部 section switch(易碎且已因改版失效),
            // 改由分頁 content 元件偵測選中後 portal 覆蓋內容區(見 Panel.tsx)。
            find: '"pendingFriends"',
            replacement: {
                match: /(?=\{id:\i\.\i\.ONLINE,show:)/,
                replace: "$self.makeTab(),"
            }
        }
    ],

    makeTab() {
        return {
            id: VRCX_SECTION,
            show: true,
            content: <TabLabel />
        };
    },

    flux: {
        // 切到好友頁(私訊區、無選中頻道)時嘗試預設 VRCX
        CHANNEL_SELECT({ guildId, channelId }: { guildId: string | null; channelId: string | null; }) {
            if (guildId == null && channelId == null) void maybeDefaultToVrcx();
        }
    },

    start() {
        // 啟動當下若已在好友頁,也嘗試預設
        void maybeDefaultToVrcx();
    }
});
