/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import definePlugin from "@utils/types";
import { SelectedChannelStore } from "@webpack/common";

import { Overlay } from "./Overlay";
import { settings } from "./settings";
import { loadState, setVisible, toggleVisible } from "./state";

export default definePlugin({
    name: "VoiceSpeakerPopout",
    description: "Discord 畫面內的可拖曳浮層,顯示語音頻道成員與說話狀態(說話亮綠圈+放大、mute/deaf 圖示)",
    authors: [{ name: "ontisme", id: 0n }],
    settings,

    patches: [
        {
            // app 主佈局:注入浮層掛載點(浮層本身以 fixed 定位脫離佈局)
            find: /"data-fullscreen":\i,children:\[!\i&&/,
            replacement: {
                match: /(?<=\.\i,"data-fullscreen":\i,children:\[!\i&&\(0,\i\.jsx\)\(\i,\{\}\),)/,
                replace: "$self.renderOverlay(),"
            }
        }
    ],

    renderOverlay() {
        return <Overlay />;
    },

    toolboxActions: {
        "語音浮層"() {
            toggleVisible();
        }
    },

    flux: {
        // autoOpen:進出語音頻道自動顯示/隱藏
        VOICE_STATE_UPDATES() {
            if (!settings.store.autoOpen) return;
            const inVoice = SelectedChannelStore.getVoiceChannelId() != null;
            setVisible(inVoice);
        }
    },

    async start() {
        await loadState();
    }
});
