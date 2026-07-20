/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { OptionType } from "@utils/types";

export const settings = definePluginSettings({
    showMode: {
        type: OptionType.SELECT,
        description: "顯示對象",
        options: [
            { label: "全部成員(說話時亮起)", value: "all", default: true },
            { label: "只顯示正在說話的人", value: "speakingOnly" }
        ]
    },
    layout: {
        type: OptionType.SELECT,
        description: "排列方式",
        options: [
            { label: "橫向網格", value: "grid", default: true },
            { label: "垂直列表(顯示名稱)", value: "list" }
        ]
    },
    autoOpen: {
        type: OptionType.BOOLEAN,
        description: "加入語音時自動顯示浮層、離開時自動隱藏",
        default: false
    }
});
