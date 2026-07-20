/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import definePlugin from "@utils/types";

import { TabBar } from "./TabBar";
import { loadTabs, openGuildTab, pruneInvalidTabs } from "./tabs";

export default definePlugin({
    name: "ChannelTabs",
    description: "伺服器分頁列:標題列下方一整列,每個進過的伺服器一個分頁(icon + 名稱),點擊回到該伺服器最後停留的頻道,重啟後還原",
    authors: [{ name: "ontisme", id: 0n }],

    patches: [
        {
            // app 主佈局(base__5e434):在標題列之後插入分頁列,由 CSS grid 覆寫排到標題列下方整列
            find: /"data-fullscreen":\i,children:\[!\i&&/,
            replacement: {
                match: /(?<=\.\i,"data-fullscreen":\i,children:\[!\i&&\(0,\i\.jsx\)\(\i,\{\}\),)/,
                replace: "$self.renderStrip(),"
            }
        }
    ],

    renderStrip() {
        return <TabBar />;
    },

    flux: {
        // 切換頻道時,以該頻道所屬伺服器(或私訊區)作為分頁鍵
        CHANNEL_SELECT({ guildId }: { guildId: string | null; }) {
            openGuildTab(guildId ?? "@me");
        },
        CONNECTION_OPEN() {
            pruneInvalidTabs();
        },
        GUILD_DELETE() {
            pruneInvalidTabs();
        }
    },

    async start() {
        await loadTabs();
    }
});
