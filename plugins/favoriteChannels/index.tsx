/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { NavContextMenuPatchCallback } from "@api/ContextMenu";
import definePlugin from "@utils/types";
import { Menu } from "@webpack/common";

import { isFavorite, loadFavorites, removeChannel, toggleFavorite } from "./data";
import { FavoritesSection } from "./FavoritesSection";

const channelContextPatch: NavContextMenuPatchCallback = (children, { channel }: any) => {
    if (!channel?.guild_id) return;
    const fav = isFavorite(channel.guild_id, channel.id);
    children.splice(-1, 0,
        <Menu.MenuItem
            id="vc-favchan-toggle"
            label={fav ? "移除最愛" : "加入最愛"}
            action={() => toggleFavorite(channel.guild_id, channel.id)}
        />
    );
};

export default definePlugin({
    name: "FavoriteChannels",
    description: "右鍵將頻道加入最愛,最愛頻道置頂顯示於該伺服器頻道列表",
    authors: [{ name: "ontisme", id: 0n }],

    contextMenus: {
        "channel-context": channelContextPatch
    },

    flux: {
        CHANNEL_DELETE({ channel }: any) {
            if (channel?.id) removeChannel(channel.id);
        }
    },

    // 置頂區注入點:待 runtime 錨點探勘後在此加入 patches(見計畫 Task 3 Step 3),
    // patch 的 replace 呼叫 $self.renderFavorites()
    renderFavorites() {
        return <FavoritesSection />;
    },

    async start() {
        await loadFavorites();
    }
});
