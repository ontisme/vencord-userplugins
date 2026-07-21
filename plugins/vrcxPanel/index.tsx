/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { findByPropsLazy } from "@webpack";
import definePlugin from "@utils/types";

import { checkAvailable } from "./data";
import { Panel } from "./Panel";

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
            // 好友頁模組(唯一含 "pendingFriends")
            find: '"pendingFriends"',
            replacement: [
                {
                    // 分頁列:在最前面(線上分頁之前)插入 VRCX 分頁
                    match: /(?=\{id:\i\.\i\.ONLINE,show:)/,
                    replace: "$self.makeTab(),"
                },
                {
                    // 內容區:整個內容區由賦值三元式 k=section===ADD_FRIEND?<新增好友>:<好友清單> 決定。
                    // 前綴用 [=:] 匹配:原始碼是 "k=section===ADD_FRIEND?",
                    // 若 messageBoard 已先疊一層則變 ":section===ADD_FRIEND?",兩種皆可命中,
                    // 疊加後 VRCX 分支為最外層之一,選中 VRCX 時渲染面板取代整個內容區。
                    match: /([=:])(\i)===(\i\.\i)\.ADD_FRIEND\?/,
                    replace: `$1$2==="${VRCX_SECTION}"?$self.renderPanel():$2===$3.ADD_FRIEND?`
                }
            ]
        },
        {
            // empty-state 模組:需認得 VRCX section,否則切到 VRCX 時 throw "Invalid empty state"。
            // 讓 VRCX 比照 ONLINE 的空狀態處理(實際內容已由上面的面板覆蓋,不會顯示空狀態)。
            find: "FriendsEmptyState: Invalid empty state",
            replacement: {
                match: /case (\i\.\i)\.ONLINE:(?=return (?:\i)\.SECTION_ONLINE)/,
                replace: `case"${VRCX_SECTION}":case $1.ONLINE:`
            }
        }
    ],

    makeTab() {
        return {
            id: VRCX_SECTION,
            show: true,
            content: <span>VRCX</span>
        };
    },

    renderPanel() {
        return <Panel />;
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
