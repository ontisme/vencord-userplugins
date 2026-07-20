/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import * as DataStore from "@api/DataStore";

import { createListenerRegistry } from "../_shared/listeners";

const KEY = "VoiceSpeakerPopout_state";

interface OverlayState {
    visible: boolean;
    x: number;
    y: number;
    w: number;
    h: number;
}

let state: OverlayState = { visible: false, x: -1, y: -1, w: -1, h: -1 };
const { subscribe, emit } = createListenerRegistry();
let persistTimer: ReturnType<typeof setTimeout> | null = null;

export { subscribe };

function persistSoon() {
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
        persistTimer = null;
        DataStore.set(KEY, state);
    }, 400);
}

export async function loadState(): Promise<void> {
    const stored = await DataStore.get<OverlayState>(KEY);
    if (stored && typeof stored.visible === "boolean") state = stored;
    emit();
}

export function isVisible(): boolean {
    return state.visible;
}

export function getPosition(): { x: number; y: number; } {
    return { x: state.x, y: state.y };
}

export function getSize(): { w: number; h: number; } {
    return { w: state.w, h: state.h };
}

export function setSize(w: number, h: number): void {
    state = { ...state, w, h };
    persistSoon();
}

export function setVisible(visible: boolean): void {
    if (state.visible === visible) return;
    state = { ...state, visible };
    emit();
    persistSoon();
}

export function toggleVisible(): void {
    setVisible(!state.visible);
}

export function setPosition(x: number, y: number): void {
    state = { ...state, x, y };
    emit();
    persistSoon();
}
