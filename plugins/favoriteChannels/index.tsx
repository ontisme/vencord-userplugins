import { NavContextMenuPatchCallback } from "@api/ContextMenu";
import definePlugin from "@utils/types";
import { Menu } from "@webpack/common";

import { isFavorite, loadFavorites, removeChannel, toggleFavorite } from "./data";

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

    async start() {
        await loadFavorites();
    }
});
