/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import ErrorBoundary from "@components/ErrorBoundary";
import { ReactDOM, useEffect, useReducer, useRef, useState } from "@webpack/common";

import { SpeakerList, useVoiceTitle } from "./SpeakerList";
import { getPosition, getSize, isVisible, setPosition, setSize, setVisible, subscribe } from "./state";

const DEFAULT_MARGIN = 20;
const WIDTH = 240;
const DEFAULT_HEIGHT = 240;

function clamp(v: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, v));
}

function OverlayWindow() {
    const title = useVoiceTitle();
    const rootRef = useRef<HTMLDivElement>(null);
    const stored = getPosition();

    // 預設右下角;有記憶座標則用記憶(clamp 回可見範圍)
    const [pos, setPos] = useState(() => {
        if (stored.x >= 0 && stored.y >= 0) {
            return {
                x: clamp(stored.x, 0, window.innerWidth - WIDTH),
                y: clamp(stored.y, 0, window.innerHeight - 60)
            };
        }
        return { x: window.innerWidth - WIDTH - DEFAULT_MARGIN, y: window.innerHeight - 260 };
    });

    const posRef = useRef(pos);
    posRef.current = pos;

    const storedSize = getSize();
    const initialW = storedSize.w > 0 ? storedSize.w : WIDTH;
    const initialH = storedSize.h > 0 ? storedSize.h : DEFAULT_HEIGHT;

    // resize:CSS resize: both,ResizeObserver 記憶尺寸
    useEffect(() => {
        const el = rootRef.current;
        if (!el) return;
        const ro = new ResizeObserver(entries => {
            const r = entries[0].contentRect;
            if (r.width > 0 && r.height > 0) setSize(Math.round(r.width), Math.round(r.height));
        });
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    // 拖曳:mousedown 起始,move/up 掛在 document(不受元素邊界或 capture 影響)
    function onMouseDown(e: React.MouseEvent) {
        e.preventDefault();
        const width = rootRef.current?.offsetWidth ?? WIDTH;
        const start = { dx: e.clientX - posRef.current.x, dy: e.clientY - posRef.current.y };
        const onMove = (ev: MouseEvent) => {
            const x = clamp(ev.clientX - start.dx, 0, window.innerWidth - width);
            const y = clamp(ev.clientY - start.dy, 0, window.innerHeight - 40);
            setPos({ x, y });
        };
        const onUp = () => {
            document.removeEventListener("mousemove", onMove);
            document.removeEventListener("mouseup", onUp);
            setPosition(posRef.current.x, posRef.current.y);
        };
        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onUp);
    }

    return (
        <div
            ref={rootRef}
            className="vc-vsp-overlay"
            style={{ left: pos.x, top: pos.y, width: initialW, height: initialH }}
        >
            <div
                className="vc-vsp-header"
                onMouseDown={onMouseDown}
            >
                <span className="vc-vsp-header-title">{title}</span>
                <span className="vc-vsp-close" onClick={() => setVisible(false)} title="關閉">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M18.3 5.71 12 12.01l-6.3-6.3-1.41 1.41 6.3 6.3-6.3 6.3 1.41 1.41 6.3-6.3 6.3 6.3 1.41-1.41-6.3-6.3 6.3-6.3z" />
                    </svg>
                </span>
            </div>
            <div className="vc-vsp-body">
                <SpeakerList />
            </div>
        </div>
    );
}

function OverlayInner() {
    const [, forceUpdate] = useReducer(x => x + 1, 0);
    useEffect(() => subscribe(forceUpdate), []);

    if (!isVisible()) return null;

    return ReactDOM.createPortal(<OverlayWindow />, document.body);
}

export const Overlay = ErrorBoundary.wrap(OverlayInner, { noop: true });
