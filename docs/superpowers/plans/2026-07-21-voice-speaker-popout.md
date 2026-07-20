# VoiceSpeakerPopout 實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增 Vencord 外掛 VoiceSpeakerPopout,以 Discord 內建 PopoutActions 開啟獨立置頂小視窗,顯示所在語音頻道成員與說話狀態(說話亮綠圈+放大、mute/deaf 圖示)。

**Architecture:** 純 Vencord 前端外掛。用 `PopoutActions.open(key, render, features)` 開獨立 Electron 視窗;PopoutView 以 `useStateFromStores` 訂閱 VoiceStateStore/SpeakingStore/SelectedChannelStore 即時渲染成員頭像。設定用 definePluginSettings,開關入口用 toolboxActions。

**Tech Stack:** Vencord v1.14.16(commit 0a5dfaa)、TypeScript、React 19、pnpm 11.9.0。外掛放 `plugins/voiceSpeakerPopout/`。

## Global Constraints

- 所有程式碼、註解、commit message、文件禁用 emoji
- 介面文字用繁體中文
- 外掛名稱 `VoiceSpeakerPopout`;作者 `authors: [{ name: "ontisme", id: 0n }]`
- 所有注入/浮窗 UI 包 `ErrorBoundary`(`noop: true`)
- 驗證:`pnpm build`(在 `D:\Codes\Projects\Discord\Vencord`)與 `pnpm testTsc`、`pnpm lint` 必須通過才 commit
- 外掛原始碼寫在 `D:\Codes\Projects\Discord\Vencord\src\userplugins\voiceSpeakerPopout\`(該處經 junction 對應 repo 的 `plugins\`,git 由 repo 追蹤)
- Discord 新版 CSS 變數:用 `--background-surface-higher`、`--background-base-lowest`、`--text-default`、`--text-muted`、`--brand-500`、`--white`、`--border-subtle`;舊變數(`--background-secondary`、`--interactive-normal`、`--header-primary` 等)已失效不可用
- 說話綠色用 `#23a55a`
- 每個功能在 Vesktop 實機驗證後才算完成(CDP 除錯:Vesktop 加 `--remote-debugging-port=9222` 啟動,用 scratchpad 的 cdp-eval.mjs 執行 JS)

## API 速查(供所有任務)

```ts
import definePlugin, { OptionType } from "@utils/types";
import { definePluginSettings } from "@api/Settings";
import ErrorBoundary from "@components/ErrorBoundary";
import { findStoreLazy } from "@webpack";
import {
    Menu, PopoutActions, SelectedChannelStore, UserStore, useEffect,
    useReducer, useStateFromStores
} from "@webpack/common";
```

- 獨立視窗:`PopoutActions.open(key: string, render: (props) => ReactNode, features?: object)`、`PopoutActions.close(key)`、`PopoutActions.setAlwaysOnTop(key, boolean)`
- 自己語音頻道:`SelectedChannelStore.getVoiceChannelId(): string | null`
- 頻道成員狀態:`VoiceStateStore.getVoiceStatesForChannel(channelId)` -> `Record<userId, { userId, mute, deaf, selfMute, selfDeaf, selfVideo, selfStream }>`
- 說話中:`SpeakingStore.isSpeaking(userId): boolean`
- 頭像:重用 `../_shared/avatar.ts` 的 `avatarUrl(userId, avatar, size)`
- toolboxActions:回傳 `<Menu.MenuCheckboxItem id=... label=... checked=... action=... />`
- store 取得:`const VoiceStateStore = findStoreLazy("VoiceStateStore")`、`findStoreLazy("SpeakingStore")`
- popout key 固定為 `"vc-voice-speaker"`

---

### Task 1: 外掛骨架 + 設定 + toolbox 開關(能開空白 popout)

**Files:**
- Create: `D:\Codes\Projects\Discord\Vencord\src\userplugins\voiceSpeakerPopout\settings.ts`
- Create: `D:\Codes\Projects\Discord\Vencord\src\userplugins\voiceSpeakerPopout\index.tsx`
- Create: `D:\Codes\Projects\Discord\Vencord\src\userplugins\voiceSpeakerPopout\PopoutView.tsx`
- Create: `D:\Codes\Projects\Discord\Vencord\src\userplugins\voiceSpeakerPopout\styles.css`

**Interfaces:**
- Produces: `settings`(DefinedSettings,含 showMode/layout/autoOpen/alwaysOnTop);`openPopout()`、`closePopout()`、`isPopoutOpen(): boolean`;`PopoutView`(React 元件)

- [ ] **Step 1: settings.ts**

```ts
/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { OptionType } from "@utils/types";

export const settings = definePluginSettings({
    showMode: {
        type: OptionType.SELECT,
        description: "顯示對象",
        options: [
            { label: "全部成員(說話時亮起)", value: "all", default: true },
            { label: "只顯示正在說話的人", value: "speakingOnly" }
        ]
    },
    layout: {
        type: OptionType.SELECT,
        description: "排列方式",
        options: [
            { label: "橫向網格", value: "grid", default: true },
            { label: "垂直列表(顯示名稱)", value: "list" }
        ]
    },
    autoOpen: {
        type: OptionType.BOOLEAN,
        description: "加入語音時自動開啟浮窗、離開時自動關閉",
        default: false
    },
    alwaysOnTop: {
        type: OptionType.BOOLEAN,
        description: "浮窗置頂",
        default: true
    }
});
```

- [ ] **Step 2: PopoutView.tsx(先做最小佔位,後續任務填內容)**

```tsx
/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import ErrorBoundary from "@components/ErrorBoundary";

function PopoutViewInner() {
    return (
        <div className="vc-vsp-root">
            <div className="vc-vsp-empty">語音浮窗(建置中)</div>
        </div>
    );
}

export const PopoutView = ErrorBoundary.wrap(PopoutViewInner, { noop: true });
```

- [ ] **Step 3: styles.css(最小)**

```css
.vc-vsp-root {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    background: var(--background-base-lowest);
    color: var(--text-default);
    -webkit-app-region: drag;
    user-select: none;
}
.vc-vsp-empty {
    margin: auto;
    color: var(--text-muted);
    font-size: 13px;
}
```

- [ ] **Step 4: index.tsx(骨架 + popout 開關 + toolbox)**

```tsx
/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import definePlugin from "@utils/types";
import { Menu, PopoutActions } from "@webpack/common";

import { PopoutView } from "./PopoutView";
import { settings } from "./settings";

const POPOUT_KEY = "vc-voice-speaker";
let popoutOpen = false;

export function isPopoutOpen() {
    return popoutOpen;
}

export function openPopout() {
    popoutOpen = true;
    PopoutActions.open(
        POPOUT_KEY,
        () => <PopoutView />,
        { width: 260, height: 200, x: 100, y: 100 }
    );
    PopoutActions.setAlwaysOnTop(POPOUT_KEY, settings.store.alwaysOnTop);
}

export function closePopout() {
    popoutOpen = false;
    PopoutActions.close(POPOUT_KEY);
}

function togglePopout() {
    if (popoutOpen) closePopout();
    else openPopout();
}

export default definePlugin({
    name: "VoiceSpeakerPopout",
    description: "獨立置頂小視窗顯示語音頻道成員與說話狀態,不必開 Discord 主畫面也能看誰在講話",
    authors: [{ name: "ontisme", id: 0n }],
    settings,

    toolboxActions: {
        "語音浮窗"() {
            togglePopout();
        }
    },

    stop() {
        closePopout();
    }
});
```

- [ ] **Step 5: 建置與型別檢查**

Run: `cd D:\Codes\Projects\Discord\Vencord && pnpm build && pnpm testTsc && pnpm lint`
Expected: 全部無錯誤

- [ ] **Step 6: Runtime 驗證(Vesktop)**

Ctrl+R 重載 → 設定啟用 VoiceSpeakerPopout → 工具箱(標題列 Vencord 圖示)點「語音浮窗」→ 應彈出一個獨立小視窗顯示「語音浮窗(建置中)」。DevTools console:

```js
Vencord.Webpack.Common.PopoutActions  // 確認 API 存在
```

再點一次工具箱項目應關閉視窗。

- [ ] **Step 7: Commit**

```bash
cd "D:\Codes\Projects\Discord" && git add plugins/voiceSpeakerPopout && git commit -m "Add VoiceSpeakerPopout skeleton with popout toggle"
```

---

### Task 2: 顯示語音頻道成員頭像

**Files:**
- Modify: `D:\Codes\Projects\Discord\Vencord\src\userplugins\voiceSpeakerPopout\PopoutView.tsx`
- Modify: `D:\Codes\Projects\Discord\Vencord\src\userplugins\voiceSpeakerPopout\styles.css`

**Interfaces:**
- Consumes: Task 1 的 `settings`
- Produces: PopoutView 渲染當前語音頻道成員頭像(尚無說話效果)

- [ ] **Step 1: PopoutView.tsx 訂閱語音頻道成員**

```tsx
/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import ErrorBoundary from "@components/ErrorBoundary";
import { findStoreLazy } from "@webpack";
import { ChannelStore, SelectedChannelStore, UserStore, useStateFromStores } from "@webpack/common";

import { avatarUrl } from "../_shared/avatar";
import { settings } from "./settings";

const VoiceStateStore = findStoreLazy("VoiceStateStore");

interface Member {
    userId: string;
    selfMute: boolean;
    selfDeaf: boolean;
}

function useVoiceMembers(): { channelName: string | null; members: Member[]; } {
    return useStateFromStores([SelectedChannelStore, VoiceStateStore], () => {
        const channelId = SelectedChannelStore.getVoiceChannelId();
        if (!channelId) return { channelName: null, members: [] };
        const channel = ChannelStore.getChannel(channelId);
        const states = VoiceStateStore.getVoiceStatesForChannel(channelId) ?? {};
        const members: Member[] = Object.values(states).map((s: any) => ({
            userId: s.userId,
            selfMute: !!s.selfMute,
            selfDeaf: !!s.selfDeaf
        }));
        return { channelName: channel?.name ?? "語音頻道", members };
    });
}

function MemberAvatar({ userId }: { userId: string; }) {
    const user = UserStore.getUser(userId);
    const name = (user as any)?.globalName ?? user?.username ?? "使用者";
    const url = user ? avatarUrl(user.id, (user as any).avatar, 64) : null;
    const initial = name.slice(0, 1).toUpperCase();

    return (
        <div className="vc-vsp-member" title={name}>
            <div className="vc-vsp-avatar-wrap">
                {url
                    ? <img className="vc-vsp-avatar" src={url} alt="" />
                    : <span className="vc-vsp-avatar vc-vsp-avatar-fallback">{initial}</span>}
            </div>
        </div>
    );
}

function PopoutViewInner() {
    const { channelName, members } = useVoiceMembers();
    const { layout } = settings.use(["layout"]);

    if (!channelName) {
        return (
            <div className="vc-vsp-root">
                <div className="vc-vsp-empty">目前不在語音頻道</div>
            </div>
        );
    }

    return (
        <div className="vc-vsp-root">
            <div className="vc-vsp-title">{channelName} · {members.length}</div>
            <div className={"vc-vsp-members vc-vsp-" + layout}>
                {members.map(m => <MemberAvatar key={m.userId} userId={m.userId} />)}
            </div>
        </div>
    );
}

export const PopoutView = ErrorBoundary.wrap(PopoutViewInner, { noop: true });
```

- [ ] **Step 2: styles.css 補成員/頭像佈局**

```css
.vc-vsp-root {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    background: var(--background-base-lowest);
    color: var(--text-default);
    user-select: none;
}
.vc-vsp-empty {
    margin: auto;
    color: var(--text-muted);
    font-size: 13px;
}
.vc-vsp-title {
    -webkit-app-region: drag;
    padding: 6px 10px;
    font-size: 12px;
    font-weight: 600;
    color: var(--text-muted);
    border-bottom: 1px solid var(--border-subtle);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
.vc-vsp-members {
    flex: 1 1 auto;
    overflow-y: auto;
    padding: 10px;
    scrollbar-width: none;
}
.vc-vsp-members::-webkit-scrollbar { display: none; }
.vc-vsp-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    align-content: flex-start;
}
.vc-vsp-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
}
.vc-vsp-member {
    display: flex;
    align-items: center;
    gap: 8px;
}
.vc-vsp-avatar-wrap {
    position: relative;
    width: 44px;
    height: 44px;
    flex-shrink: 0;
}
.vc-vsp-avatar {
    width: 44px;
    height: 44px;
    border-radius: 50%;
    object-fit: cover;
    display: block;
}
.vc-vsp-avatar-fallback {
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 16px;
    font-weight: 700;
    background: var(--background-surface-higher);
    color: var(--text-default);
}
```

- [ ] **Step 3: 建置與驗證**

Run: `cd D:\Codes\Projects\Discord\Vencord && pnpm build && pnpm testTsc && pnpm lint`
Expected: 無錯誤。Vesktop Ctrl+R 後,加入一個語音頻道,開浮窗:顯示頻道名 + 成員頭像。不在語音時顯示「目前不在語音頻道」。

- [ ] **Step 4: Commit**

```bash
cd "D:\Codes\Projects\Discord" && git add plugins/voiceSpeakerPopout && git commit -m "Render voice channel members in popout"
```

---

### Task 3: 說話效果 + mute/deaf 圖示

**Files:**
- Modify: `D:\Codes\Projects\Discord\Vencord\src\userplugins\voiceSpeakerPopout\PopoutView.tsx`
- Modify: `D:\Codes\Projects\Discord\Vencord\src\userplugins\voiceSpeakerPopout\styles.css`

**Interfaces:**
- Consumes: Task 2 的 MemberAvatar 結構
- Produces: 說話中頭像亮綠圈+放大;selfMute/selfDeaf 顯示圖示

- [ ] **Step 1: PopoutView.tsx 加 SpeakingStore 與圖示**

在檔頭 import 補 `useEffect, useReducer`,並新增 SpeakingStore:

```tsx
const SpeakingStore = findStoreLazy("SpeakingStore");
```

MemberAvatar 改為(接收 selfMute/selfDeaf,訂閱說話狀態):

```tsx
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

function MemberAvatar({ userId, selfMute, selfDeaf }: { userId: string; selfMute: boolean; selfDeaf: boolean; }) {
    const user = UserStore.getUser(userId);
    const speaking = useStateFromStores([SpeakingStore], () => SpeakingStore.isSpeaking(userId));
    const { showMode } = settings.use(["showMode"]);

    if (showMode === "speakingOnly" && !speaking) return null;

    const name = (user as any)?.globalName ?? user?.username ?? "使用者";
    const url = user ? avatarUrl(user.id, (user as any).avatar, 64) : null;
    const initial = name.slice(0, 1).toUpperCase();

    return (
        <div className="vc-vsp-member" title={name}>
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
```

PopoutViewInner 傳入 selfMute/selfDeaf:

```tsx
{members.map(m => <MemberAvatar key={m.userId} userId={m.userId} selfMute={m.selfMute} selfDeaf={m.selfDeaf} />)}
```

- [ ] **Step 2: styles.css 加說話綠圈/放大/圖示/名稱**

```css
.vc-vsp-avatar-wrap {
    position: relative;
    width: 44px;
    height: 44px;
    flex-shrink: 0;
    border-radius: 50%;
    transition: transform 0.12s ease, box-shadow 0.12s ease, opacity 0.15s, filter 0.15s;
}
.vc-vsp-speaking {
    transform: scale(1.08);
    box-shadow: 0 0 0 3px #23a55a;
}
.vc-vsp-quiet {
    opacity: 0.55;
    filter: grayscale(0.5);
}
.vc-vsp-status {
    position: absolute;
    right: -2px;
    bottom: -2px;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: var(--status-danger);
    color: var(--white);
    display: flex;
    align-items: center;
    justify-content: center;
    border: 2px solid var(--background-base-lowest);
}
.vc-vsp-name {
    font-size: 13px;
    color: var(--text-default);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.vc-vsp-grid .vc-vsp-name { display: none; }
```

- [ ] **Step 3: 建置與驗證**

Run: `cd D:\Codes\Projects\Discord\Vencord && pnpm build && pnpm testTsc && pnpm lint`
Expected: 無錯誤。Vesktop 中加入語音,浮窗開啟後:
1. 自己或他人說話 → 對應頭像亮綠圈 + 放大;停止 → 恢復
2. all 模式:安靜成員頭像變暗/去飽和
3. 自我靜音 → 麥克風斜線圖示;拒聽 → 耳機斜線圖示
DevTools 驗證說話 store:`Vencord.Webpack.findStore("SpeakingStore").isSpeaking("<自己 id>")`

- [ ] **Step 4: Commit**

```bash
cd "D:\Codes\Projects\Discord" && git add plugins/voiceSpeakerPopout && git commit -m "Add speaking highlight and mute/deaf icons to popout"
```

---

### Task 4: 設定生效(showMode/layout)+ autoOpen + 狀態記憶 + alwaysOnTop

**Files:**
- Modify: `D:\Codes\Projects\Discord\Vencord\src\userplugins\voiceSpeakerPopout\index.tsx`
- Create: `D:\Codes\Projects\Discord\Vencord\src\userplugins\voiceSpeakerPopout\state.ts`

**Interfaces:**
- Consumes: Task 1 的 openPopout/closePopout/isPopoutOpen
- Produces: 進出語音自動開關(autoOpen);啟動記憶上次開關;alwaysOnTop 設定即時套用

備註:showMode / layout 已在 PopoutView 以 `settings.use` 即時反映(Task 2、3 完成),本任務只處理生命週期。

- [ ] **Step 1: state.ts(記憶上次開關狀態)**

```ts
/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import * as DataStore from "@api/DataStore";

const KEY = "VoiceSpeakerPopout_wasOpen";

export async function loadWasOpen(): Promise<boolean> {
    return (await DataStore.get<boolean>(KEY)) ?? false;
}

export function saveWasOpen(open: boolean): void {
    DataStore.set(KEY, open);
}
```

- [ ] **Step 2: index.tsx 整合生命週期**

```tsx
/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import definePlugin from "@utils/types";
import { PopoutActions, SelectedChannelStore } from "@webpack/common";

import { PopoutView } from "./PopoutView";
import { settings } from "./settings";
import { loadWasOpen, saveWasOpen } from "./state";

const POPOUT_KEY = "vc-voice-speaker";
let popoutOpen = false;

export function isPopoutOpen() {
    return popoutOpen;
}

export function openPopout() {
    popoutOpen = true;
    saveWasOpen(true);
    PopoutActions.open(
        POPOUT_KEY,
        () => <PopoutView />,
        { width: 260, height: 200, x: 100, y: 100 }
    );
    PopoutActions.setAlwaysOnTop(POPOUT_KEY, settings.store.alwaysOnTop);
}

export function closePopout() {
    popoutOpen = false;
    saveWasOpen(false);
    PopoutActions.close(POPOUT_KEY);
}

function togglePopout() {
    if (popoutOpen) closePopout();
    else openPopout();
}

export default definePlugin({
    name: "VoiceSpeakerPopout",
    description: "獨立置頂小視窗顯示語音頻道成員與說話狀態,不必開 Discord 主畫面也能看誰在講話",
    authors: [{ name: "ontisme", id: 0n }],
    settings,

    toolboxActions: {
        "語音浮窗"() {
            togglePopout();
        }
    },

    flux: {
        // autoOpen:進出語音頻道自動開關
        VOICE_STATE_UPDATES() {
            if (!settings.store.autoOpen) return;
            const inVoice = SelectedChannelStore.getVoiceChannelId() != null;
            if (inVoice && !popoutOpen) openPopout();
            else if (!inVoice && popoutOpen) closePopout();
        }
    },

    async start() {
        // 記憶上次:若上次開著且目前仍在語音,自動恢復
        const wasOpen = await loadWasOpen();
        if (wasOpen && SelectedChannelStore.getVoiceChannelId() != null) {
            openPopout();
        }
    },

    stop() {
        PopoutActions.close(POPOUT_KEY);
        popoutOpen = false;
    }
});
```

- [ ] **Step 3: alwaysOnTop 即時套用(設定變更時)**

不在 settings.ts 內處理(避免與 index.tsx 循環相依)。改在 index.tsx 的 `start()` 註冊設定變更監聽,浮窗開著時即時套用。於 index.tsx 檔頭 import 補 `SettingsStore`:

```tsx
import { SettingsStore } from "@api/Settings";
```

在 `start()` 內(await loadWasOpen 之後)加入:

```tsx
        SettingsStore.addChangeListener("plugins.VoiceSpeakerPopout.alwaysOnTop", () => {
            if (popoutOpen) PopoutActions.setAlwaysOnTop(POPOUT_KEY, settings.store.alwaysOnTop);
        });
```

- [ ] **Step 4: 建置與驗證**

Run: `cd D:\Codes\Projects\Discord\Vencord && pnpm build && pnpm testTsc && pnpm lint`
Expected: 無錯誤。Vesktop 中:
1. 設定切 showMode 為「只顯示正在說話的人」→ 浮窗只留說話者;切回「全部成員」→ 全員顯示
2. 設定切 layout 為「垂直列表」→ 頭像旁出現名稱;切「橫向網格」→ 只有頭像
3. 開 autoOpen → 加入語音自動彈窗,離開自動關
4. 手動開浮窗後重啟 Vesktop(仍在語音)→ 自動恢復浮窗
5. alwaysOnTop 開/關 → 切到其他視窗測試是否置頂

- [ ] **Step 5: Commit**

```bash
cd "D:\Codes\Projects\Discord" && git add plugins/voiceSpeakerPopout && git commit -m "Add autoOpen, state persistence and alwaysOnTop handling"
```

---

### Task 5: 樣式打磨與整體驗收

**Files:**
- Modify: `D:\Codes\Projects\Discord\Vencord\src\userplugins\voiceSpeakerPopout\styles.css`
- Modify: `D:\Codes\Projects\Discord\README.md`

**Interfaces:**
- Consumes: 全部

- [ ] **Step 1: 全量重建**

Run: `cd D:\Codes\Projects\Discord\Vencord && pnpm build && pnpm testTsc && pnpm lint`
Expected: 全部通過(userplugins 內不得有錯)

- [ ] **Step 2: 整合驗收(Vesktop)**

1. 外掛啟用,加入語音,開浮窗,無 console 錯誤、無 patch 警告
2. 說話效果流暢(綠圈+放大 transition 平順)
3. 兩種 layout、兩種 showMode 皆正確
4. mute/deaf 圖示正確
5. autoOpen 與狀態記憶正確
6. 關閉 Discord 主視窗(最小化)後浮窗仍浮動且持續更新說話狀態
7. 重啟 Vesktop 記憶狀態

- [ ] **Step 3: README 補外掛說明**

在 README 的外掛一覽表格新增一列:

```
| VoiceSpeakerPopout | 獨立置頂小視窗顯示語音頻道成員與說話狀態(說話亮綠圈+放大、mute/deaf 圖示);工具箱開關,可設定顯示對象/排列/自動開啟 | `VoiceSpeakerPopout_wasOpen` |
```

- [ ] **Step 4: 最終 commit**

```bash
cd "D:\Codes\Projects\Discord" && git add -A && git commit -m "Polish VoiceSpeakerPopout styles and docs"
```

---

## Self-Review 紀錄

- Spec 覆蓋:PopoutActions 獨立視窗(Task 1)、成員頭像(Task 2)、說話綠圈+放大與 mute/deaf 圖示(Task 3)、showMode/layout 設定+autoOpen+狀態記憶+alwaysOnTop(Task 4、settings)、錯誤處理(ErrorBoundary + 空狀態)、效能(useStateFromStores 各自訂閱)、測試(各任務 runtime 清單 + Task 5)均有對應
- 型別一致:`Member` 結構(userId/selfMute/selfDeaf)在 Task 2 定義,Task 3 消費一致;popout key 全程 `vc-voice-speaker`;openPopout/closePopout/isPopoutOpen 簽名一致
- 已知妥協:PopoutActions 的 render callback 參數形狀(是否傳 window props)未在計畫寫死,Task 1 Step 6 runtime 確認;若 render 需要包 Discord 的 popout root wrapper,依實機微調(不影響其他任務)
- 平台:PopoutActions 為桌面版 API,Vesktop 適用;瀏覽器版無獨立視窗(spec 已述,此計畫以 Vesktop 為目標)
