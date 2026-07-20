import "./styles.css";

import { PropsWithChildren } from "react";

import definePlugin from "@utils/types";

import { TabBar } from "./TabBar";
import { loadTabs, openTab, pruneInvalidTabs, restoreLastChannel } from "./tabs";

let restored = false;

export default definePlugin({
    name: "ChannelTabs",
    description: "瀏覽器式頻道分頁,開過的頻道成為分頁,重啟後還原",
    authors: [{ name: "ontisme", id: 0n }],

    patches: [
        {
            // 標題列模組(與 vencordToolbox 相同的 find);分頁列插在 leading 區,
            // match 形狀比照 trailing 區已驗證的寫法,若 Discord 更新導致失效僅記警告
            find: '?"BACK_FORWARD_NAVIGATION":',
            replacement: {
                match: /(leading:.{0,50}?)\i\.Fragment,(?=\{children:\[)/,
                replace: "$1$self.LeadingWrapper,"
            }
        }
    ],

    LeadingWrapper({ children }: PropsWithChildren) {
        return (
            <>
                {children}
                <TabBar />
            </>
        );
    },

    flux: {
        CHANNEL_SELECT({ channelId }: { channelId: string | null; }) {
            if (channelId) openTab(channelId);
        },
        CONNECTION_OPEN() {
            pruneInvalidTabs();
            if (!restored) {
                restored = true;
                restoreLastChannel();
            }
        },
        CHANNEL_DELETE() {
            pruneInvalidTabs();
        }
    },

    async start() {
        restored = false;
        await loadTabs();
    }
});
