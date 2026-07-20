/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export function avatarUrl(userId: string, avatar: string | null | undefined, size = 64): string {
    if (avatar) return `https://cdn.discordapp.com/avatars/${userId}/${avatar}.webp?size=${size}`;
    let index = 0;
    try {
        index = Number((BigInt(userId) >> 22n) % 6n);
    } catch {
        index = 0;
    }
    return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
}

export function guildIconUrl(guildId: string, icon: string | null | undefined, size = 64): string | null {
    if (!icon) return null;
    const ext = icon.startsWith("a_") ? "gif" : "webp";
    return `https://cdn.discordapp.com/icons/${guildId}/${icon}.${ext}?size=${size}`;
}

export function channelIconUrl(channelId: string, icon: string | null | undefined, size = 64): string | null {
    if (!icon) return null;
    return `https://cdn.discordapp.com/channel-icons/${channelId}/${icon}.webp?size=${size}`;
}
