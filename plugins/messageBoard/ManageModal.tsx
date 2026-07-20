/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import ErrorBoundary from "@components/ErrorBoundary";
import {
    Button, ChannelStore, GuildStore, Modal, openModal, useEffect, useReducer, UserStore
} from "@webpack/common";

import { avatarUrl, channelIconUrl, guildIconUrl } from "../_shared/avatar";
import {
    clearAllBlacklists, getBlacklist, getGuildBlacklist, removeFromChannelBlacklist,
    removeFromGuildBlacklist, subscribe
} from "./storage";

function guildRow(guildId: string) {
    const guild = GuildStore.getGuild(guildId);
    return {
        name: guild?.name ?? `未知伺服器 (${guildId})`,
        iconUrl: guild ? guildIconUrl(guildId, guild.icon, 32) : null
    };
}

function channelRow(channelId: string) {
    const channel = ChannelStore.getChannel(channelId);
    if (!channel) return { name: `未知頻道 (${channelId})`, iconUrl: null };
    if (channel.guild_id) {
        const guild = GuildStore.getGuild(channel.guild_id);
        return {
            name: (guild?.name ? guild.name + " " : "") + "#" + channel.name,
            iconUrl: guild ? guildIconUrl(channel.guild_id, guild.icon, 32) : null
        };
    }
    const userId = (channel as any).recipients?.[0];
    const user = userId ? UserStore.getUser(userId) : null;
    return {
        name: (user as any)?.globalName ?? user?.username ?? channel.name ?? "私訊",
        iconUrl: (channel as any).icon
            ? channelIconUrl(channel.id, (channel as any).icon, 32)
            : user ? avatarUrl(user.id, (user as any).avatar, 32) : null
    };
}

function Row({ name, iconUrl, initial, onRemove }: { name: string; iconUrl: string | null; initial: string; onRemove(): void; }) {
    return (
        <div className="vc-msgboard-manage-row">
            {iconUrl
                ? <img className="vc-msgboard-manage-icon" src={iconUrl} alt="" />
                : <span className="vc-msgboard-manage-icon vc-msgboard-manage-icon-fallback">{initial}</span>}
            <span className="vc-msgboard-manage-name">{name}</span>
            <button className="vc-msgboard-manage-remove" onClick={onRemove}>解除</button>
        </div>
    );
}

function ManageInner() {
    const [, forceUpdate] = useReducer(x => x + 1, 0);
    useEffect(() => subscribe(forceUpdate), []);

    const guilds = getGuildBlacklist();
    const channels = getBlacklist();
    const empty = guilds.length === 0 && channels.length === 0;

    return (
        <div className="vc-msgboard-manage">
            {empty && <div className="vc-msgboard-manage-empty">目前沒有被隱藏的伺服器或頻道</div>}

            {guilds.length > 0 && (
                <div className="vc-msgboard-manage-section">
                    <div className="vc-msgboard-manage-heading">{`被隱藏的伺服器 (${guilds.length})`}</div>
                    {guilds.map(id => {
                        const { name, iconUrl } = guildRow(id);
                        return <Row key={id} name={name} iconUrl={iconUrl} initial={name.slice(0, 1).toUpperCase()} onRemove={() => removeFromGuildBlacklist(id)} />;
                    })}
                </div>
            )}

            {channels.length > 0 && (
                <div className="vc-msgboard-manage-section">
                    <div className="vc-msgboard-manage-heading">{`被隱藏的頻道 (${channels.length})`}</div>
                    {channels.map(id => {
                        const { name, iconUrl } = channelRow(id);
                        return <Row key={id} name={name} iconUrl={iconUrl} initial={"#"} onRemove={() => removeFromChannelBlacklist(id)} />;
                    })}
                </div>
            )}

            {!empty && (
                <div className="vc-msgboard-manage-footer">
                    <Button color={Button.Colors.RED} size={Button.Sizes.SMALL} onClick={() => clearAllBlacklists()}>
                        全部解除
                    </Button>
                </div>
            )}
        </div>
    );
}

const Manage = ErrorBoundary.wrap(ManageInner, { noop: true });

export function openManageModal(): void {
    openModal(props => (
        <Modal {...props} size="md" title="管理被隱藏的伺服器與頻道">
            <Manage />
        </Modal>
    ));
}
