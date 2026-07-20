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
