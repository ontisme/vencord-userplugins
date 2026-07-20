/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export interface ListenerRegistry {
    /** 註冊變更回呼,回傳解除註冊的函式 */
    subscribe(cb: () => void): () => void;
    /** 通知所有已註冊的回呼 */
    emit(): void;
}

export function createListenerRegistry(): ListenerRegistry {
    const listeners = new Set<() => void>();

    return {
        subscribe(cb) {
            listeners.add(cb);
            return () => listeners.delete(cb);
        },
        emit() {
            for (const cb of listeners) cb();
        }
    };
}
