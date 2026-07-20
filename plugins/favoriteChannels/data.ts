/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import * as DataStore from "@api/DataStore";

import { createListenerRegistry } from "../_shared/listeners";

const KEY = "FavoriteChannels_data";

type FavoritesData = Record<string, string[]>;

let favorites: FavoritesData = {};
const { subscribe, emit } = createListenerRegistry();

export { subscribe };

export async function loadFavorites(): Promise<void> {
    const stored = await DataStore.get<FavoritesData>(KEY);
    favorites = stored && typeof stored === "object" ? stored : {};
    emit();
}

export function getFavorites(guildId: string): string[] {
    return favorites[guildId] ?? [];
}

export function isFavorite(guildId: string, channelId: string): boolean {
    return getFavorites(guildId).includes(channelId);
}

async function persist(): Promise<void> {
    await DataStore.set(KEY, favorites);
}

export async function toggleFavorite(guildId: string, channelId: string): Promise<void> {
    const list = favorites[guildId] ?? [];
    if (list.includes(channelId)) {
        favorites[guildId] = list.filter(id => id !== channelId);
        if (favorites[guildId].length === 0) delete favorites[guildId];
    } else {
        favorites[guildId] = [...list, channelId];
    }
    emit();
    await persist();
}

export async function removeChannel(channelId: string): Promise<void> {
    let changed = false;
    for (const guildId of Object.keys(favorites)) {
        if (favorites[guildId].includes(channelId)) {
            favorites[guildId] = favorites[guildId].filter(id => id !== channelId);
            if (favorites[guildId].length === 0) delete favorites[guildId];
            changed = true;
        }
    }
    if (changed) {
        emit();
        await persist();
    }
}
