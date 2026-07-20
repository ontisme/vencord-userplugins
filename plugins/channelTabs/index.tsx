import definePlugin from "@utils/types";

import { loadTabs, openTab, pruneInvalidTabs, restoreLastChannel } from "./tabs";

let restored = false;

export default definePlugin({
    name: "ChannelTabs",
    description: "瀏覽器式頻道分頁,開過的頻道成為分頁,重啟後還原",
    authors: [{ name: "ontisme", id: 0n }],

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
