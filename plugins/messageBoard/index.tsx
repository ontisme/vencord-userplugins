import "./styles.css";

import { PropsWithChildren } from "react";

import ErrorBoundary from "@components/ErrorBoundary";
import definePlugin from "@utils/types";
import { findComponentByCodeLazy } from "@webpack";
import { useEffect, useReducer } from "@webpack/common";

import { openBoard } from "./BoardModal";
import { flush, getNewActivityCount, handleMessage, init, stopFlushing, subscribe } from "./storage";

const HeaderBarIcon = findComponentByCodeLazy(".HEADER_BAR_BADGE_BOTTOM,", 'position:"bottom"');

function BoardIcon() {
    return (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
            <path d="M4 4h7v7H4V4zm9 0h7v4h-7V4zm0 6h7v10h-7V10zM4 13h7v7H4v-7z" />
        </svg>
    );
}

function BoardButton() {
    const [, forceUpdate] = useReducer(x => x + 1, 0);
    useEffect(() => subscribe(forceUpdate), []);
    const count = getNewActivityCount();

    return (
        <HeaderBarIcon
            className="vc-msgboard-btn"
            onClick={() => openBoard()}
            tooltip={count > 0 ? `訊息動態磚(${count} 個頻道有新訊息)` : "訊息動態磚"}
            icon={BoardIcon}
        />
    );
}

export default definePlugin({
    name: "MessageBoard",
    description: "訊息動態磚:未靜音頻道的即時訊息牆,可快速回覆與跳轉",
    authors: [{ name: "ontisme", id: 0n }],

    patches: [
        {
            // 標題列 trailing 區,與 vencordToolbox 相同的已驗證錨點與 match 形狀
            find: '?"BACK_FORWARD_NAVIGATION":',
            replacement: {
                match: /(trailing:.{0,50}?)\i\.Fragment,(?=\{children:\[)/,
                replace: "$1$self.TrailingWrapper,"
            }
        }
    ],

    TrailingWrapper({ children }: PropsWithChildren) {
        return (
            <>
                {children}
                <ErrorBoundary key="vc-msgboard" noop>
                    <BoardButton />
                </ErrorBoundary>
            </>
        );
    },

    flux: {
        MESSAGE_CREATE({ message, optimistic }: { message: any; optimistic: boolean; }) {
            if (optimistic) return;
            handleMessage(message);
        }
    },

    openBoard,
    flushNow: flush,

    async start() {
        await init();
    },

    stop() {
        stopFlushing();
    }
});
