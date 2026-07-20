/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import definePlugin from "@utils/types";

import { Board } from "./Board";
import { flush, getNewActivityCount, handleMessage, init, stopFlushing } from "./storage";

export const BOARD_SECTION = "VC_MESSAGE_BOARD";

export default definePlugin({
    name: "MessageBoard",
    description: "訊息動態磚:好友頁新增動態磚分頁,顯示未靜音頻道的即時訊息牆,可快速回覆與跳轉",
    authors: [{ name: "ontisme", id: 0n }],

    patches: [
        {
            // 好友頁模組(唯一含 "pendingFriends" 的模組)
            find: '"pendingFriends"',
            replacement: [
                {
                    // 分頁列:在「新增好友」分頁前插入「動態磚」分頁
                    match: /(?=\{id:\i\.\i\.ADD_FRIEND,show:!0)/,
                    replace: "$self.makeTab(),"
                },
                {
                    // 內容區:選中動態磚分頁時渲染看板
                    match: /(\i)=(\i)===(\i\.\i\.ADD_FRIEND)\?/,
                    replace: `$1=$2==="${BOARD_SECTION}"?$self.renderBoard():$2===$3?`
                }
            ]
        }
    ],

    makeTab() {
        const count = getNewActivityCount();
        return {
            id: BOARD_SECTION,
            show: true,
            content: (
                <span>
                    動態磚
                    {count > 0 && <span className="vc-msgboard-tab-badge">{count > 99 ? "99+" : count}</span>}
                </span>
            )
        };
    },

    renderBoard() {
        return <Board />;
    },

    flux: {
        MESSAGE_CREATE({ message, optimistic }: { message: any; optimistic: boolean; }) {
            if (optimistic) return;
            handleMessage(message);
        }
    },

    flushNow: flush,

    async start() {
        await init();
    },

    stop() {
        stopFlushing();
    }
});
