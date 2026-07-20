/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { findGroupChildrenByChildId, NavContextMenuPatchCallback } from "@api/ContextMenu";
import definePlugin from "@utils/types";
import { GuildStore, Menu } from "@webpack/common";

import { addGuild, isFavorite, loadRail, pruneInvalid, removeGuild } from "./data";
import { Rail } from "./Rail";

function StarIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
        </svg>
    );
}

const guildContextPatch: NavContextMenuPatchCallback = (children, { guild }: any) => {
    if (!guild?.id) return;
    const fav = isFavorite(guild.id);
    const item = (
        <Menu.MenuItem
            id="vc-favsrv-toggle"
            label={fav ? "從最愛移除伺服器" : "加入最愛伺服器"}
            icon={StarIcon}
            action={() => (fav ? removeGuild(guild.id) : addGuild(guild.id))}
        />
    );
    const group = findGroupChildrenByChildId("mark-guild-read", children)
        ?? findGroupChildrenByChildId("privacy", children);
    if (group) group.push(item);
    else children.splice(-1, 0, item);
};

export default definePlugin({
    name: "FavoriteServers",
    description: "最愛伺服器置頂:視窗最左新增一條獨立的最愛伺服器列,支援拖曳排序與資料夾分組",
    authors: [{ name: "ontisme", id: 0n }],

    patches: [
        {
            // app 主佈局:標題列之後注入最愛伺服器列(以 CSS fixed 定位到最左、內容整體右移)
            find: /"data-fullscreen":\i,children:\[!\i&&/,
            replacement: {
                match: /(?<=\.\i,"data-fullscreen":\i,children:\[!\i&&\(0,\i\.jsx\)\(\i,\{\}\),)/,
                replace: "$self.renderRail(),"
            }
        }
    ],

    renderRail() {
        return <Rail />;
    },

    contextMenus: {
        "guild-context": guildContextPatch
    },

    flux: {
        GUILD_DELETE() {
            pruneInvalid(id => GuildStore.getGuild(id) != null);
        }
    },

    async start() {
        await loadRail();
        pruneInvalid(id => GuildStore.getGuild(id) != null);
    }
});
