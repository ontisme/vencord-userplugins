/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { findByCodeLazy, findStoreLazy } from "@webpack";
import {
    ChannelStore, SelectedChannelStore, UserStore, useStateFromStores
} from "@webpack/common";

import { avatarUrl } from "../_shared/avatar";
import { settings } from "./settings";
import { isSelfDeaf, isSelfMute, toggleSelfDeaf, toggleSelfMute } from "./voiceActions";

const VoiceStateStore = findStoreLazy("VoiceStateStore");
const SpeakingStore = findStoreLazy("SpeakingStore");
const MediaEngineStore = findStoreLazy("MediaEngineStore");
// Discord 原生「語音成員」右鍵選單 opener(GuildVoiceUserContextMenu),含使用者音量滑桿、伺服器端靜音/拒聽、
// 個人資料、身分組等,依權限動態顯示。簽名:opener(event, user, channel, minimalContextMenu?, onInteraction?)。
// 識別字串 "GuildVoiceUserContextMenu" 於 bundle 中唯一。
const openVoiceUserMenu: any = findByCodeLazy("GuildVoiceUserContextMenu", "getGuildId");

interface Member {
    userId: string;
    selfMute: boolean;
    selfDeaf: boolean;
}

function useVoiceMembers(): { channelId: string | null; channelName: string | null; members: Member[]; } {
    return useStateFromStores([SelectedChannelStore, VoiceStateStore], () => {
        const channelId = SelectedChannelStore.getVoiceChannelId();
        if (!channelId) return { channelId: null, channelName: null, members: [] };
        const channel = ChannelStore.getChannel(channelId);
        const states = VoiceStateStore.getVoiceStatesForChannel(channelId) ?? {};
        const members: Member[] = Object.values(states).map((s: any) => ({
            userId: s.userId,
            selfMute: !!s.selfMute,
            selfDeaf: !!s.selfDeaf
        }));
        return { channelId, channelName: channel?.name ?? "語音頻道", members };
    });
}

function MicOffIcon() {
    return (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zM4.27 3L3 4.27l6 6V11c0 1.66 1.33 3 3 3 .23 0 .44-.03.65-.08l1.66 1.66c-.71.33-1.5.52-2.31.52-2.76 0-5.3-2.1-5.3-5.1H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c.91-.13 1.77-.45 2.54-.9L19.73 21 21 19.73 4.27 3z" />
        </svg>
    );
}

function DeafIcon() {
    return (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 3a9 9 0 0 0-9 9v7a2 2 0 0 0 2 2h2v-8H5v-1a7 7 0 0 1 14 0v1h-2v8h2a2 2 0 0 0 2-2v-7a9 9 0 0 0-9-9zM3.27 2L2 3.27 20.73 22 22 20.73 3.27 2z" />
        </svg>
    );
}

function openMemberMenu(e: React.MouseEvent, userId: string, channelId: string) {
    if (!openVoiceUserMenu) return;
    e.preventDefault();
    const user = UserStore.getUser(userId);
    const channel = ChannelStore.getChannel(channelId);
    if (!user || !channel) return;
    // 位置參數:opener(event, user, channel, minimalContextMenu?, onInteraction?)。
    // event 需原生 MouseEvent 定位;onInteraction 為 analytics 回呼,傳 noop。
    const domEvent = e.nativeEvent ?? e;
    openVoiceUserMenu(domEvent, user, channel, undefined, () => { });
}

function MemberAvatar({ userId, selfMute, selfDeaf, channelId }: { userId: string; selfMute: boolean; selfDeaf: boolean; channelId: string; }) {
    const user = UserStore.getUser(userId);
    const speaking = useStateFromStores([SpeakingStore], () => SpeakingStore.isSpeaking(userId));
    const { showMode } = settings.use(["showMode"]);

    if (showMode === "speakingOnly" && !speaking) return null;

    const name = (user as any)?.globalName ?? user?.username ?? "使用者";
    const url = user ? avatarUrl(user.id, (user as any).avatar, 64) : null;
    const initial = name.slice(0, 1).toUpperCase();

    return (
        <div
            className="vc-vsp-member"
            title={name}
            onContextMenu={e => openMemberMenu(e, userId, channelId)}
        >
            <div className={"vc-vsp-avatar-wrap" + (speaking ? " vc-vsp-speaking" : (showMode === "all" ? " vc-vsp-quiet" : ""))}>
                {url
                    ? <img className="vc-vsp-avatar" src={url} alt="" />
                    : <span className="vc-vsp-avatar vc-vsp-avatar-fallback">{initial}</span>}
                {(selfMute || selfDeaf) && (
                    <span className="vc-vsp-status">{selfDeaf ? <DeafIcon /> : <MicOffIcon />}</span>
                )}
            </div>
            <span className="vc-vsp-name">{name}</span>
        </div>
    );
}

function MicIcon({ off }: { off: boolean; }) {
    if (off) return <MicOffIcon />;
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5-3c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
        </svg>
    );
}

function HeadphoneIcon({ off }: { off: boolean; }) {
    if (off) return <DeafIcon />;
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 3a9 9 0 0 0-9 9v7a2 2 0 0 0 2 2h2v-8H5v-1a7 7 0 0 1 14 0v1h-2v8h2a2 2 0 0 0 2-2v-7a9 9 0 0 0-9-9z" />
        </svg>
    );
}

// 底部控制列:麥克風開關 + 拒聽,狀態即時同步原生
export function ControlBar() {
    const { muted, deaf } = useStateFromStores([MediaEngineStore], () => ({
        muted: isSelfMute(),
        deaf: isSelfDeaf()
    }));

    return (
        <div className="vc-vsp-controls">
            <button
                className={"vc-vsp-ctrl-btn" + (muted ? " vc-vsp-ctrl-active" : "")}
                onClick={toggleSelfMute}
                title={muted ? "取消靜音" : "靜音麥克風"}
            >
                <MicIcon off={muted} />
            </button>
            <button
                className={"vc-vsp-ctrl-btn" + (deaf ? " vc-vsp-ctrl-active" : "")}
                onClick={toggleSelfDeaf}
                title={deaf ? "取消拒聽" : "拒聽(關閉聲音)"}
            >
                <HeadphoneIcon off={deaf} />
            </button>
        </div>
    );
}

// 供 Overlay header 顯示的標題文字(頻道名 + 人數)
export function useVoiceTitle(): string {
    const { channelName, members } = useVoiceMembers();
    return channelName ? `${channelName} · ${members.length}` : "語音浮層";
}

export function SpeakerList() {
    const { channelId, channelName, members } = useVoiceMembers();
    const { layout } = settings.use(["layout"]);

    if (!channelId || !channelName) {
        return <div className="vc-vsp-empty">目前不在語音頻道</div>;
    }

    return (
        <div className={"vc-vsp-members vc-vsp-" + layout}>
            {members.map(m => (
                <MemberAvatar key={m.userId} userId={m.userId} selfMute={m.selfMute} selfDeaf={m.selfDeaf} channelId={channelId} />
            ))}
        </div>
    );
}
