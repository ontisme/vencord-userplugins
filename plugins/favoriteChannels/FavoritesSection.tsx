import ErrorBoundary from "@components/ErrorBoundary";
import {
    ChannelRouter, ChannelStore, ContextMenuApi, Menu, ReadStateStore,
    SelectedChannelStore, SelectedGuildStore, useEffect, useReducer, useStateFromStores
} from "@webpack/common";

import { getFavorites, subscribe, toggleFavorite } from "./data";

function FavoriteRow({ channelId }: { channelId: string; }) {
    const channel = ChannelStore.getChannel(channelId);
    const [hasUnread, mentionCount, selected] = useStateFromStores(
        [ReadStateStore, SelectedChannelStore],
        () => [
            ReadStateStore.hasUnread(channelId),
            ReadStateStore.getMentionCount(channelId),
            SelectedChannelStore.getChannelId() === channelId
        ]
    );
    if (!channel) return null;

    return (
        <div
            className={"vc-favchan-row" + (selected ? " vc-favchan-selected" : "") + (hasUnread ? " vc-favchan-unread" : "")}
            onClick={() => ChannelRouter.transitionToChannel(channelId)}
            onContextMenu={e => ContextMenuApi.openContextMenu(e, () => (
                <Menu.Menu navId="vc-favchan-row-menu" onClose={ContextMenuApi.closeContextMenu}>
                    <Menu.MenuItem
                        id="vc-favchan-remove"
                        label="移除最愛"
                        color="danger"
                        action={() => toggleFavorite(channel.guild_id, channelId)}
                    />
                </Menu.Menu>
            ))}
        >
            <span className="vc-favchan-hash">#</span>
            <span className="vc-favchan-name">{channel.name}</span>
            {mentionCount > 0 && <span className="vc-favchan-badge">{mentionCount}</span>}
        </div>
    );
}

function FavoritesSectionInner() {
    const guildId = useStateFromStores([SelectedGuildStore], () => SelectedGuildStore.getGuildId());
    const [, forceUpdate] = useReducer(x => x + 1, 0);
    useEffect(() => subscribe(forceUpdate), []);

    if (!guildId) return null;
    const favs = getFavorites(guildId);
    if (favs.length === 0) return null;

    return (
        <div className="vc-favchan-section">
            <div className="vc-favchan-header">最愛</div>
            {favs.map(id => <FavoriteRow key={id} channelId={id} />)}
        </div>
    );
}

export const FavoritesSection = ErrorBoundary.wrap(FavoritesSectionInner, { noop: true });
