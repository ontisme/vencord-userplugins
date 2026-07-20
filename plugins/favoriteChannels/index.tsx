/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { findGroupChildrenByChildId, NavContextMenuPatchCallback } from "@api/ContextMenu";
import definePlugin from "@utils/types";
import { Menu } from "@webpack/common";

import { isFavorite, loadFavorites, removeChannel, toggleFavorite } from "./data";
import { FavoritesSection } from "./FavoritesSection";

function StarIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
        </svg>
    );
}

const channelContextPatch: NavContextMenuPatchCallback = (children, { channel }: any) => {
    if (!channel?.guild_id) return;
    const fav = isFavorite(channel.guild_id, channel.id);
    const item = (
        <Menu.MenuItem
            id="vc-favchan-toggle"
            label={fav ? "移除最愛" : "加入最愛"}
            icon={StarIcon}
            action={() => toggleFavorite(channel.guild_id, channel.id)}
        />
    );
    // 放在原生「釘選至頂端」旁,較顯眼;找不到時退回選單末端
    const group = findGroupChildrenByChildId("pin-channel", children)
        ?? findGroupChildrenByChildId("mark-channel-read", children);
    if (group) {
        group.push(item);
    } else {
        children.splice(-1, 0, item);
    }
};

export default definePlugin({
    name: "FavoriteChannels",
    description: "右鍵將頻道加入最愛,最愛頻道置頂顯示於該伺服器頻道列表",
    authors: [{ name: "ontisme", id: 0n }],

    patches: [
        {
            // 伺服器頻道列表(虛擬化 AutoSizer);將列表包進 fragment,前方插入最愛置頂區
            find: '"guild-channels")',
            replacement: {
                match: /return(\(0,(\i)\.jsx\)\(\i\.sk,\{children:\i=>\(0,\i\.jsx\)\(\i\.\i,\{[\s\S]*?"guild-channels"\)\}\))/,
                replace: "return(0,$2.jsxs)($2.Fragment,{children:[$self.renderFavorites(),$1]})"
            }
        }
    ],

    contextMenus: {
        "channel-context": channelContextPatch
    },

    flux: {
        CHANNEL_DELETE({ channel }: any) {
            if (channel?.id) removeChannel(channel.id);
        }
    },

    renderFavorites() {
        return <FavoritesSection />;
    },

    async start() {
        await loadFavorites();
    }
});
