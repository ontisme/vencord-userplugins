import definePlugin from "@utils/types";

import { flush, handleMessage, init, stopFlushing } from "./storage";

export default definePlugin({
    name: "MessageBoard",
    description: "訊息動態磚:未靜音頻道的即時訊息牆,可快速回覆與跳轉",
    authors: [{ name: "ontisme", id: 0n }],

    flux: {
        MESSAGE_CREATE({ message, optimistic }: { message: any; optimistic: boolean; }) {
            if (optimistic) return;
            handleMessage(message);
        }
    },

    async start() {
        await init();
    },

    stop() {
        stopFlushing();
    }
});
