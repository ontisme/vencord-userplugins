# Discord 自製客戶端(Vesktop + Vencord userplugins)實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在自建 Vencord 中實作三個 userplugin(favoriteChannels、channelTabs、messageBoard),由 Vesktop 載入,達成頻道最愛置頂、瀏覽器式分頁、訊息動態磚三項功能。

**Architecture:** Vesktop(官方 release,不改)載入自建 Vencord build;三個外掛放在 `src/userplugins/`,彼此獨立。持久化用 `@api/DataStore`(IndexedDB),即時訊息用 Flux `MESSAGE_CREATE`,UI 注入用 Vencord patches + ErrorBoundary。

**Tech Stack:** Vencord v1.14.16(已 clone 至 `D:\Codes\Projects\Discord\Vencord`,commit 0a5dfaa)、TypeScript、React 19、pnpm 11.9.0、Node >= 22。

## Global Constraints

- 所有程式碼、註解、commit message、文件禁用 emoji
- 不做跨頻道歷史回填 API 抓取;僅用 Gateway 推送與客戶端既有快取
- 所有注入 UI 必須包 `ErrorBoundary`(`noop: true`),patch 失敗不得影響 Discord 本體
- 外掛名稱:`FavoriteChannels`、`ChannelTabs`、`MessageBoard`;DataStore 鍵前綴與外掛同名
- 驗證指令:`pnpm build` 與 `pnpm testTsc` 必須通過才可 commit
- Vencord repo 內的變更只允許出現在 `src/userplugins/`(git 管理:userplugins 目錄以獨立 git repo 或複製方式納入 `D:\Codes\Projects\Discord` 主 repo 追蹤,見 Task 1)
- Discord 內部模組的 patch `find` 字串可能與計畫所寫不同:每個 patch 任務都含「runtime 錨點驗證」步驟,用 Vesktop DevTools 的 `Vencord.Webpack` 工具確認後才定案
- 介面文字使用繁體中文(僅限自訂 UI 內)

## Discord 內部 API 速查(供所有任務引用)

```ts
import definePlugin, { OptionType } from "@utils/types";
import { definePluginSettings } from "@api/Settings";
import { Devs } from "@utils/constants";
import ErrorBoundary from "@components/ErrorBoundary";
import { findGroupChildrenByChildId, NavContextMenuPatchCallback } from "@api/ContextMenu";
import * as DataStore from "@api/DataStore";
import { sendMessage } from "@utils/discord";
import { findByPropsLazy, findComponentByCodeLazy } from "@webpack";
import {
    Menu, ContextMenuApi, ChannelStore, GuildStore, UserStore, RelationshipStore,
    SelectedGuildStore, SelectedChannelStore, ReadStateStore, UserGuildSettingsStore,
    NavigationRouter, ChannelRouter, FluxDispatcher, Modal, openModal, closeModal,
    React, useState, useEffect, useReducer, useStateFromStores, Tooltip, moment
} from "@webpack/common";
```

- 導覽:`ChannelRouter.transitionToChannel(channelId)`;深連結 `NavigationRouter.transitionTo("/channels/<guildId|@me>/<channelId>/<messageId>")`
- 靜音判斷:`UserGuildSettingsStore.isGuildOrCategoryOrChannelMuted(guildId, channelId)`、`isMuted(guildId)`、DM 用 `isChannelMuted(null, channelId)`
- 回覆:`sendMessage(channelId, { content }, false, { messageReference: { channel_id, message_id, guild_id }, allowedMentions: { parse: ["users"], replied_user: true } })`
- Flux:plugin 的 `flux: { MESSAGE_CREATE({ message, optimistic }) { if (optimistic) return; ... } }`
- 右鍵自訂選單:`ContextMenuApi.openContextMenu(e, () => <Menu.Menu navId="..." onClose={ContextMenuApi.closeContextMenu}>...</Menu.Menu>)`
- 標題列按鈕範本:`src/plugins/vencordToolbox/index.tsx`(`HeaderBarIcon = findComponentByCodeLazy(".HEADER_BAR_BADGE_BOTTOM,", 'position:"bottom"')`,patch `find: '?"BACK_FORWARD_NAVIGATION":'`)
- 清單注入範本:`src/plugins/pinDms/index.tsx`
- userplugin 作者:`Devs` 沒有本人,改用 `authors: [{ name: "ontisme", id: 0n }]`

---

### Task 1: 開發環境建置與載入驗證

**Files:**
- Create: `D:\Codes\Projects\Discord\Vencord\src\userplugins\.gitkeep`(建立目錄)
- Create: `D:\Codes\Projects\Discord\.gitignore`
- Modify: `D:\Codes\Projects\Discord\README.md`(新建,記錄建置與掛載步驟)

**Interfaces:**
- Produces: 可用的 `pnpm build` 產物 `Vencord\dist\`;Vesktop 掛載自建 build 的操作程序

- [ ] **Step 1: 確認 Node 與 pnpm 版本**

Run: `node --version && pnpm --version`
Expected: Node >= 22、pnpm 11.x。若無 pnpm:`corepack enable && corepack prepare pnpm@11.9.0 --activate`

- [ ] **Step 2: 安裝依賴**

Run: `cd D:\Codes\Projects\Discord\Vencord && pnpm install --frozen-lockfile`
Expected: 無錯誤結束

- [ ] **Step 3: 建立 userplugins 目錄與基準建置**

Run: `mkdir src\userplugins`,然後 `pnpm build`
Expected: `Built in xxx ms`,產出 `dist\patcher.js` 等檔案

- [ ] **Step 4: 基準型別檢查**

Run: `pnpm testTsc`
Expected: 無錯誤(此為後續任務的比較基準)

- [ ] **Step 5: 主 repo 追蹤設定**

`D:\Codes\Projects\Discord\.gitignore` 內容:

```
Vencord/
!Vencord/src/userplugins/
```

git 無法用上述方式追蹤被忽略目錄的子目錄,改用以下策略:`Vencord/` 整個 ignore,在主 repo 建立 `plugins\` 目錄存放外掛原始碼,並以 junction 連到 Vencord:

```
D:\Codes\Projects\Discord\plugins\           <- git 追蹤的真實檔案
D:\Codes\Projects\Discord\Vencord\src\userplugins  <- junction 指向上面
```

Run(cmd 語法,經 bash 呼叫):

```bash
rmdir "D:\Codes\Projects\Discord\Vencord\src\userplugins" 2>/dev/null
mkdir -p "D:\Codes\Projects\Discord\plugins"
cmd //c mklink //J "D:\Codes\Projects\Discord\Vencord\src\userplugins" "D:\Codes\Projects\Discord\plugins"
```

Expected: `Junction created for ...`
`.gitignore` 內容改為一行:`Vencord/`

- [ ] **Step 6: 撰寫 README(建置與 Vesktop 掛載程序)**

`D:\Codes\Projects\Discord\README.md` 記錄:

```markdown
# Discord 自製客戶端

Vesktop + 自建 Vencord,自訂外掛在 plugins/(junction 至 Vencord/src/userplugins)。

## 建置

    cd Vencord
    pnpm install
    pnpm build          # 或 pnpm watch 持續建置

## Vesktop 掛載自建 build

1. 安裝 Vesktop: https://github.com/Vencord/Vesktop/releases (Windows installer)
2. 開啟 Vesktop -> Settings -> Vesktop 分頁 -> Developer Options
   -> Vencord Location 填入 D:\Codes\Projects\Discord\Vencord\dist
3. 完全重啟 Vesktop
4. 驗證: Discord 設定內 Vencord 分頁的版本號應為 1.14.16 dev,
   Plugins 清單可搜尋到自訂外掛

## 開發迭代

pnpm watch 常駐 + Vesktop 內 Ctrl+R 重載即可看到變更。
```

- [ ] **Step 7: Commit**

```bash
cd "D:\Codes\Projects\Discord" && git add -A && git commit -m "Set up Vencord build environment and plugin junction"
```

- [ ] **Step 8: 手動驗證(需使用者操作 Vesktop)**

依 README 步驟安裝 Vesktop 並掛載 `dist`。驗證:Vencord 設定頁版本號正確。此步驟若使用者尚未執行,不阻塞後續程式碼任務,但 Task 3 起的 runtime 驗證都依賴它。

---

### Task 2: FavoriteChannels 資料層與右鍵選單

**Files:**
- Create: `D:\Codes\Projects\Discord\plugins\favoriteChannels\data.ts`
- Create: `D:\Codes\Projects\Discord\plugins\favoriteChannels\index.tsx`

**Interfaces:**
- Produces: `data.ts` 匯出 `getFavorites(guildId): string[]`、`isFavorite(guildId, channelId): boolean`、`toggleFavorite(guildId, channelId): Promise<void>`、`removeChannel(channelId): Promise<void>`、`subscribe(cb: () => void): () => void`、`loadFavorites(): Promise<void>`。Task 3 的 UI 依賴這些簽名。

- [ ] **Step 1: 實作 data.ts**

```ts
import * as DataStore from "@api/DataStore";

const KEY = "FavoriteChannels_data";

type FavoritesData = Record<string, string[]>;

let favorites: FavoritesData = {};
const listeners = new Set<() => void>();

function emit() {
    for (const cb of listeners) cb();
}

export function subscribe(cb: () => void): () => void {
    listeners.add(cb);
    return () => listeners.delete(cb);
}

export async function loadFavorites(): Promise<void> {
    const stored = await DataStore.get<FavoritesData>(KEY);
    favorites = stored && typeof stored === "object" ? stored : {};
    emit();
}

export function getFavorites(guildId: string): string[] {
    return favorites[guildId] ?? [];
}

export function isFavorite(guildId: string, channelId: string): boolean {
    return getFavorites(guildId).includes(channelId);
}

async function persist(): Promise<void> {
    await DataStore.set(KEY, favorites);
}

export async function toggleFavorite(guildId: string, channelId: string): Promise<void> {
    const list = favorites[guildId] ?? [];
    if (list.includes(channelId)) {
        favorites[guildId] = list.filter(id => id !== channelId);
        if (favorites[guildId].length === 0) delete favorites[guildId];
    } else {
        favorites[guildId] = [...list, channelId];
    }
    emit();
    await persist();
}

export async function removeChannel(channelId: string): Promise<void> {
    let changed = false;
    for (const guildId of Object.keys(favorites)) {
        if (favorites[guildId].includes(channelId)) {
            favorites[guildId] = favorites[guildId].filter(id => id !== channelId);
            if (favorites[guildId].length === 0) delete favorites[guildId];
            changed = true;
        }
    }
    if (changed) {
        emit();
        await persist();
    }
}
```

- [ ] **Step 2: 實作 index.tsx(外掛骨架 + 右鍵選單 + CHANNEL_DELETE 清理)**

```tsx
import { NavContextMenuPatchCallback } from "@api/ContextMenu";
import definePlugin from "@utils/types";
import { Menu } from "@webpack/common";

import { isFavorite, loadFavorites, removeChannel, toggleFavorite } from "./data";

const channelContextPatch: NavContextMenuPatchCallback = (children, { channel }: any) => {
    if (!channel?.guild_id) return;
    const fav = isFavorite(channel.guild_id, channel.id);
    children.splice(-1, 0,
        <Menu.MenuItem
            id="vc-favchan-toggle"
            label={fav ? "移除最愛" : "加入最愛"}
            action={() => toggleFavorite(channel.guild_id, channel.id)}
        />
    );
};

export default definePlugin({
    name: "FavoriteChannels",
    description: "右鍵將頻道加入最愛,最愛頻道置頂顯示於該伺服器頻道列表",
    authors: [{ name: "ontisme", id: 0n }],

    contextMenus: {
        "channel-context": channelContextPatch
    },

    flux: {
        CHANNEL_DELETE({ channel }: any) {
            if (channel?.id) removeChannel(channel.id);
        }
    },

    async start() {
        await loadFavorites();
    }
});
```

- [ ] **Step 3: 建置與型別檢查**

Run: `cd D:\Codes\Projects\Discord\Vencord && pnpm build && pnpm testTsc`
Expected: 兩者皆無錯誤

- [ ] **Step 4: Runtime 驗證(Vesktop)**

Ctrl+R 重載 → 設定啟用 FavoriteChannels → 右鍵任一伺服器頻道:選單倒數第二項出現「加入最愛」;點擊後再右鍵同頻道變為「移除最愛」。DevTools console 驗證持久化:

```js
Vencord.Api.DataStore.get("FavoriteChannels_data").then(console.log)
```

Expected: `{ "<guildId>": ["<channelId>"] }`

- [ ] **Step 5: Commit**

```bash
cd "D:\Codes\Projects\Discord" && git add plugins/favoriteChannels && git commit -m "Add FavoriteChannels data layer and context menu"
```

---

### Task 3: FavoriteChannels 置頂區 UI 與 patch

**Files:**
- Create: `D:\Codes\Projects\Discord\plugins\favoriteChannels\FavoritesSection.tsx`
- Create: `D:\Codes\Projects\Discord\plugins\favoriteChannels\styles.css`
- Modify: `D:\Codes\Projects\Discord\plugins\favoriteChannels\index.tsx`

**Interfaces:**
- Consumes: Task 2 的 `getFavorites`、`toggleFavorite`、`subscribe`
- Produces: `FavoritesSection`(無 props 的 React 元件,自行從 `SelectedGuildStore` 取得當前伺服器)

- [ ] **Step 1: 實作 FavoritesSection.tsx**

```tsx
import ErrorBoundary from "@components/ErrorBoundary";
import {
    ChannelRouter, ChannelStore, ContextMenuApi, Menu, ReadStateStore,
    SelectedChannelStore, SelectedGuildStore, useEffect, useReducer, useStateFromStores
} from "@webpack/common";

import { getFavorites, subscribe, toggleFavorite } from "./data";

function FavoriteRow({ channelId }: { channelId: string; }) {
    const channel = ChannelStore.getChannel(channelId);
    const [hasUnread, mentionCount, selected] = useStateFromStores(
        [ReadStateStore, SelectedChannelStore],
        () => [
            ReadStateStore.hasUnread(channelId),
            ReadStateStore.getMentionCount(channelId),
            SelectedChannelStore.getChannelId() === channelId
        ]
    );
    if (!channel) return null;

    return (
        <div
            className={"vc-favchan-row" + (selected ? " vc-favchan-selected" : "") + (hasUnread ? " vc-favchan-unread" : "")}
            onClick={() => ChannelRouter.transitionToChannel(channelId)}
            onContextMenu={e => ContextMenuApi.openContextMenu(e, () => (
                <Menu.Menu navId="vc-favchan-row-menu" onClose={ContextMenuApi.closeContextMenu}>
                    <Menu.MenuItem
                        id="vc-favchan-remove"
                        label="移除最愛"
                        color="danger"
                        action={() => toggleFavorite(channel.guild_id, channelId)}
                    />
                </Menu.Menu>
            ))}
        >
            <span className="vc-favchan-hash">#</span>
            <span className="vc-favchan-name">{channel.name}</span>
            {mentionCount > 0 && <span className="vc-favchan-badge">{mentionCount}</span>}
        </div>
    );
}

function FavoritesSectionInner() {
    const guildId = useStateFromStores([SelectedGuildStore], () => SelectedGuildStore.getGuildId());
    const [, forceUpdate] = useReducer(x => x + 1, 0);
    useEffect(() => subscribe(forceUpdate), []);

    if (!guildId) return null;
    const favs = getFavorites(guildId);
    if (favs.length === 0) return null;

    return (
        <div className="vc-favchan-section">
            <div className="vc-favchan-header">最愛</div>
            {favs.map(id => <FavoriteRow key={id} channelId={id} />)}
        </div>
    );
}

export const FavoritesSection = ErrorBoundary.wrap(FavoritesSectionInner, { noop: true });
```

- [ ] **Step 2: 實作 styles.css**

```css
.vc-favchan-section {
    padding: 8px 8px 4px;
    border-bottom: 1px solid var(--background-modifier-accent);
}
.vc-favchan-header {
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    color: var(--channels-default);
    padding: 0 8px 4px;
}
.vc-favchan-row {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 5px 8px;
    border-radius: 4px;
    cursor: pointer;
    color: var(--channels-default);
}
.vc-favchan-row:hover { background: var(--background-modifier-hover); }
.vc-favchan-selected { background: var(--background-modifier-selected); color: var(--interactive-active); }
.vc-favchan-unread { color: var(--interactive-active); font-weight: 600; }
.vc-favchan-hash { opacity: 0.6; }
.vc-favchan-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
.vc-favchan-badge {
    background: var(--status-danger);
    color: #fff;
    border-radius: 8px;
    font-size: 11px;
    font-weight: 700;
    min-width: 16px;
    height: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0 4px;
}
```

- [ ] **Step 3: Runtime 錨點探勘(Vesktop DevTools)**

目標:找到「伺服器頻道列表容器」模組,將 `FavoritesSection` 注入列表最上方。程序:

1. Vesktop DevTools console 執行,尋找頻道列表元件模組:

```js
Vencord.Webpack.search("GUILD_CHANNEL_LIST")
Vencord.Webpack.search("channel-list")
Vencord.Webpack.search('role:"list"', "aria-label")
```

2. 對候選模組用 `Vencord.Webpack.findModuleFactory("<獨特字串>").toString()` 檢視原始碼,找到渲染列表 header/scroller 的 JSX 位置(特徵:同時引用頻道 scroller 與 guild header,常見獨特字串如 `"channels"`、`AutoSizer` 相鄰程式碼)。
3. 也可用 Settings → Patch Helper 互動測試 `find` / `match` / `replace`。
4. 選定的 `find` 字串必須全 bundle 唯一(`Vencord.Webpack.search` 回傳恰一個模組)。

記錄選定的 `find` 與 `match` 於 commit message 或程式碼註解(僅記錄約束,不寫推導過程)。

- [ ] **Step 4: 在 index.tsx 加入 patch 與 style**

依 Step 3 探勘結果填入實際字串(以下 `find`/`match` 為候選示意,以探勘結果為準):

```tsx
import "./styles.css";

import { FavoritesSection } from "./FavoritesSection";

// definePlugin 內新增:
    patches: [
        {
            find: "<Step3 選定的唯一字串>",
            replacement: {
                match: /(?<=<Step3 選定的列表 children 開頭錨點>)/,
                replace: "$self.renderFavorites(),"
            }
        }
    ],

    renderFavorites() {
        return <FavoritesSection />;
    },
```

- [ ] **Step 5: 建置、型別檢查、runtime 驗證**

Run: `pnpm build && pnpm testTsc` → 無錯誤。
Vesktop Ctrl+R 後驗證:

1. 有最愛的伺服器:頻道列表最頂端出現「最愛」區與頻道列
2. 點擊最愛列可切換頻道;選中、未讀粗體、提及數字徽章正確
3. 右鍵最愛列可移除;右鍵一般頻道加入後即時出現
4. 沒有最愛的伺服器與 DM 頁:不顯示任何多餘 UI
5. Console 無 patch 失敗警告(搜尋 "Patch by FavoriteChannels")

- [ ] **Step 6: 重啟持久化驗證**

完全關閉 Vesktop 重開:最愛清單仍在、順序不變。

- [ ] **Step 7: Commit**

```bash
cd "D:\Codes\Projects\Discord" && git add plugins/favoriteChannels && git commit -m "Add FavoriteChannels pinned section UI"
```

---

### Task 4: ChannelTabs 狀態層與持久化

**Files:**
- Create: `D:\Codes\Projects\Discord\plugins\channelTabs\tabs.ts`
- Create: `D:\Codes\Projects\Discord\plugins\channelTabs\index.tsx`

**Interfaces:**
- Produces: `tabs.ts` 匯出 `getTabs(): string[]`、`getActiveTab(): string | null`、`openTab(channelId): void`、`closeTab(channelId): void`、`moveTab(fromIndex, toIndex): void`、`subscribe(cb): () => void`、`loadTabs(): Promise<void>`、`restoreLastChannel(): void`。Task 5 的 TabBar 依賴這些簽名。

- [ ] **Step 1: 實作 tabs.ts**

```ts
import * as DataStore from "@api/DataStore";
import { ChannelRouter, ChannelStore } from "@webpack/common";

const KEY = "ChannelTabs_data";

interface TabsData {
    tabs: string[];
    activeTab: string | null;
}

let state: TabsData = { tabs: [], activeTab: null };
const listeners = new Set<() => void>();
let persistTimer: ReturnType<typeof setTimeout> | null = null;

function emit() {
    for (const cb of listeners) cb();
}

function persistSoon() {
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
        persistTimer = null;
        DataStore.set(KEY, state);
    }, 500);
}

export function subscribe(cb: () => void): () => void {
    listeners.add(cb);
    return () => listeners.delete(cb);
}

export function getTabs(): string[] {
    return state.tabs;
}

export function getActiveTab(): string | null {
    return state.activeTab;
}

export async function loadTabs(): Promise<void> {
    const stored = await DataStore.get<TabsData>(KEY);
    if (stored && Array.isArray(stored.tabs)) {
        state = {
            tabs: stored.tabs.filter(id => ChannelStore.getChannel(id) != null),
            activeTab: stored.activeTab && ChannelStore.getChannel(stored.activeTab) ? stored.activeTab : null
        };
    }
    emit();
}

export function openTab(channelId: string): void {
    if (!state.tabs.includes(channelId)) state.tabs = [...state.tabs, channelId];
    state.activeTab = channelId;
    emit();
    persistSoon();
}

export function closeTab(channelId: string): void {
    const idx = state.tabs.indexOf(channelId);
    if (idx === -1) return;
    state.tabs = state.tabs.filter(id => id !== channelId);
    if (state.activeTab === channelId) {
        const next = state.tabs[Math.min(idx, state.tabs.length - 1)] ?? null;
        state.activeTab = next;
        if (next) ChannelRouter.transitionToChannel(next);
    }
    emit();
    persistSoon();
}

export function moveTab(fromIndex: number, toIndex: number): void {
    if (fromIndex === toIndex) return;
    const tabs = [...state.tabs];
    const [moved] = tabs.splice(fromIndex, 1);
    tabs.splice(toIndex, 0, moved);
    state.tabs = tabs;
    emit();
    persistSoon();
}

export function restoreLastChannel(): void {
    if (state.activeTab && ChannelStore.getChannel(state.activeTab)) {
        ChannelRouter.transitionToChannel(state.activeTab);
    }
}

export function pruneInvalidTabs(): void {
    const valid = state.tabs.filter(id => ChannelStore.getChannel(id) != null);
    if (valid.length !== state.tabs.length) {
        state.tabs = valid;
        if (state.activeTab && !valid.includes(state.activeTab)) state.activeTab = valid[0] ?? null;
        emit();
        persistSoon();
    }
}
```

- [ ] **Step 2: 實作 index.tsx 骨架(flux 追蹤導覽)**

```tsx
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
        CHANNEL_DELETE({ channel }: any) {
            if (channel?.id) pruneInvalidTabs();
        }
    },

    async start() {
        restored = false;
        await loadTabs();
    }
});
```

- [ ] **Step 3: 建置與型別檢查**

Run: `pnpm build && pnpm testTsc`
Expected: 無錯誤

- [ ] **Step 4: Runtime 驗證(尚無 UI,以 console 驗證狀態)**

Vesktop Ctrl+R,啟用 ChannelTabs,切換三個頻道後:

```js
Vencord.Api.DataStore.get("ChannelTabs_data").then(console.log)
```

Expected: `tabs` 含三個頻道 id、`activeTab` 為最後一個。重啟 Vesktop 後自動導向最後頻道。

- [ ] **Step 5: Commit**

```bash
cd "D:\Codes\Projects\Discord" && git add plugins/channelTabs && git commit -m "Add ChannelTabs state layer with persistence and restore"
```

---

### Task 5: ChannelTabs 分頁列 UI 與 patch

**Files:**
- Create: `D:\Codes\Projects\Discord\plugins\channelTabs\TabBar.tsx`
- Create: `D:\Codes\Projects\Discord\plugins\channelTabs\styles.css`
- Modify: `D:\Codes\Projects\Discord\plugins\channelTabs\index.tsx`

**Interfaces:**
- Consumes: Task 4 的 `getTabs`、`getActiveTab`、`closeTab`、`moveTab`、`subscribe`
- Produces: `TabBar`(無 props React 元件)

- [ ] **Step 1: 實作 TabBar.tsx**

```tsx
import ErrorBoundary from "@components/ErrorBoundary";
import {
    ChannelRouter, ChannelStore, ReadStateStore, useEffect, useReducer,
    UserStore, useStateFromStores
} from "@webpack/common";

import { closeTab, getActiveTab, getTabs, moveTab, subscribe } from "./tabs";

function tabLabel(channelId: string): string {
    const channel = ChannelStore.getChannel(channelId);
    if (!channel) return "未知頻道";
    if (channel.guild_id) return "#" + channel.name;
    if (channel.name) return channel.name;
    const userId = channel.recipients?.[0];
    const user = userId ? UserStore.getUser(userId) : null;
    return (user as any)?.globalName ?? user?.username ?? "私訊";
}

function Tab({ channelId, index }: { channelId: string; index: number; }) {
    const [active, hasUnread] = useStateFromStores([ReadStateStore], () => [
        getActiveTab() === channelId,
        ReadStateStore.hasUnread(channelId)
    ]);

    return (
        <div
            className={"vc-chtabs-tab" + (active ? " vc-chtabs-active" : "") + (hasUnread ? " vc-chtabs-unread" : "")}
            draggable
            onDragStart={e => e.dataTransfer.setData("text/vc-chtabs", String(index))}
            onDragOver={e => e.preventDefault()}
            onDrop={e => {
                e.preventDefault();
                const from = Number(e.dataTransfer.getData("text/vc-chtabs"));
                if (!Number.isNaN(from)) moveTab(from, index);
            }}
            onClick={() => ChannelRouter.transitionToChannel(channelId)}
            onAuxClick={e => { if (e.button === 1) closeTab(channelId); }}
        >
            <span className="vc-chtabs-label">{tabLabel(channelId)}</span>
            <span
                className="vc-chtabs-close"
                onClick={e => { e.stopPropagation(); closeTab(channelId); }}
            >
                {"×"}
            </span>
        </div>
    );
}

function TabBarInner() {
    const [, forceUpdate] = useReducer(x => x + 1, 0);
    useEffect(() => subscribe(forceUpdate), []);

    const tabs = getTabs();
    if (tabs.length === 0) return null;

    return (
        <div className="vc-chtabs-bar">
            {tabs.map((id, i) => <Tab key={id} channelId={id} index={i} />)}
        </div>
    );
}

export const TabBar = ErrorBoundary.wrap(TabBarInner, { noop: true });
```

- [ ] **Step 2: 實作 styles.css**

```css
.vc-chtabs-bar {
    display: flex;
    align-items: center;
    gap: 2px;
    overflow-x: auto;
    scrollbar-width: none;
    max-width: 60vw;
    min-width: 0;
    -webkit-app-region: no-drag;
}
.vc-chtabs-bar::-webkit-scrollbar { display: none; }
.vc-chtabs-tab {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 2px 6px 2px 10px;
    border-radius: 6px;
    font-size: 12px;
    color: var(--interactive-normal);
    background: var(--background-secondary);
    cursor: pointer;
    white-space: nowrap;
    user-select: none;
}
.vc-chtabs-tab:hover { background: var(--background-modifier-hover); }
.vc-chtabs-active { background: var(--background-modifier-selected); color: var(--interactive-active); }
.vc-chtabs-unread { font-weight: 700; color: var(--interactive-active); }
.vc-chtabs-label { max-width: 140px; overflow: hidden; text-overflow: ellipsis; }
.vc-chtabs-close {
    opacity: 0.5;
    padding: 0 3px;
    border-radius: 3px;
    line-height: 1;
}
.vc-chtabs-close:hover { opacity: 1; background: var(--background-modifier-hover); }
```

- [ ] **Step 3: Runtime 錨點探勘(標題列)**

沿用 vencordToolbox 已驗證的錨點模組:`find: '?"BACK_FORWARD_NAVIGATION":'`。在 DevTools 中執行:

```js
Vencord.Webpack.findModuleFactory('?"BACK_FORWARD_NAVIGATION":').toString()
```

檢視原始碼,找出標題列中央/前段可插入 children 的 JSX 位置(vencordToolbox 是包 trailing 區的 Fragment;TabBar 插在 leading 或 trailing 皆可,選視覺上分頁列在標題列左半的插點)。用 Patch Helper 驗證 match/replace。

- [ ] **Step 4: index.tsx 加入 patch**

依探勘結果填入(match 為示意,以探勘為準):

```tsx
import "./styles.css";

import { TabBar } from "./TabBar";

// definePlugin 內新增:
    patches: [
        {
            find: '?"BACK_FORWARD_NAVIGATION":',
            replacement: {
                match: /(?<=<Step3 選定的 leading 錨點>)/,
                replace: "$self.renderTabBar(),"
            }
        }
    ],

    renderTabBar() {
        return <TabBar />;
    },
```

- [ ] **Step 5: 建置、型別檢查、runtime 驗證**

Run: `pnpm build && pnpm testTsc` → 無錯誤。Vesktop Ctrl+R 後驗證清單:

1. 開啟數個頻道與私訊,標題列出現對應分頁;當前分頁高亮
2. 點分頁切換頻道;中鍵與 X 關閉;關閉當前分頁自動切到鄰近分頁
3. 拖曳分頁改變順序
4. 其他頻道有新訊息時對應分頁變粗體
5. 分頁超出寬度時可橫向捲動;標題列的視窗拖曳與縮放不受影響
6. 重啟 Vesktop:分頁、順序、當前分頁全數還原

- [ ] **Step 6: Commit**

```bash
cd "D:\Codes\Projects\Discord" && git add plugins/channelTabs && git commit -m "Add ChannelTabs tab bar UI in title bar"
```

---

### Task 6: MessageBoard 儲存層與訊息收集

**Files:**
- Create: `D:\Codes\Projects\Discord\plugins\messageBoard\storage.ts`
- Create: `D:\Codes\Projects\Discord\plugins\messageBoard\index.tsx`

**Interfaces:**
- Produces: `storage.ts` 匯出:
  - `interface StoredMessage { id: string; channelId: string; guildId: string | null; authorId: string; authorName: string; authorAvatar: string | null; content: string; timestamp: number; attachmentCount: number; }`
  - `interface ChannelMeta { channelId: string; lastActivity: number; count: number; }`
  - `init(): Promise<void>`、`handleMessage(message: any): void`(過濾+入列)、`flush(): Promise<void>`、`getChannelIndex(): ChannelMeta[]`(依 lastActivity 新到舊)、`readPage(channelId, before?: number, limit?: number): Promise<StoredMessage[]>`、`getBlacklist(): string[]`、`addToBlacklist(channelId): Promise<void>`、`getNewActivityCount(): number`、`markOpened(): Promise<void>`、`subscribe(cb): () => void`、`stopFlushing(): void`

- [ ] **Step 1: 實作 storage.ts**

```ts
import * as DataStore from "@api/DataStore";
import { ChannelStore, RelationshipStore, UserGuildSettingsStore, UserStore } from "@webpack/common";

const META_KEY = "MessageBoard_meta";
const INDEX_KEY = "MessageBoard_index";
const msgKey = (channelId: string) => `MessageBoard_msgs_${channelId}`;

const PER_CHANNEL_CAP = 500;
const GLOBAL_CAP = 10000;
const FLUSH_INTERVAL = 5000;

export interface StoredMessage {
    id: string;
    channelId: string;
    guildId: string | null;
    authorId: string;
    authorName: string;
    authorAvatar: string | null;
    content: string;
    timestamp: number;
    attachmentCount: number;
}

export interface ChannelMeta {
    channelId: string;
    lastActivity: number;
    count: number;
}

interface Meta {
    blacklist: string[];
    lastOpened: number;
}

let meta: Meta = { blacklist: [], lastOpened: 0 };
let index: ChannelMeta[] = [];
let pending: StoredMessage[] = [];
let newActivityChannels = new Set<string>();
let flushTimer: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<() => void>();

function emit() {
    for (const cb of listeners) cb();
}

export function subscribe(cb: () => void): () => void {
    listeners.add(cb);
    return () => listeners.delete(cb);
}

export async function init(): Promise<void> {
    const storedMeta = await DataStore.get<Meta>(META_KEY);
    if (storedMeta && Array.isArray(storedMeta.blacklist)) meta = storedMeta;
    const storedIndex = await DataStore.get<ChannelMeta[]>(INDEX_KEY);
    if (Array.isArray(storedIndex)) index = storedIndex;
    if (!flushTimer) flushTimer = setInterval(() => { flush(); }, FLUSH_INTERVAL);
}

export function stopFlushing(): void {
    if (flushTimer) {
        clearInterval(flushTimer);
        flushTimer = null;
    }
    flush();
}

function shouldStore(message: any): boolean {
    if (!message?.author?.id || !message.channel_id) return false;
    if (message.author.id === UserStore.getCurrentUser()?.id) return false;
    if (RelationshipStore.isBlocked(message.author.id)) return false;
    if (meta.blacklist.includes(message.channel_id)) return false;
    const channel = ChannelStore.getChannel(message.channel_id);
    if (!channel) return false;
    if (channel.guild_id) {
        if (UserGuildSettingsStore.isMuted(channel.guild_id)) return false;
        if (UserGuildSettingsStore.isGuildOrCategoryOrChannelMuted(channel.guild_id, channel.id)) return false;
    } else {
        if (UserGuildSettingsStore.isChannelMuted(null as any, channel.id)) return false;
    }
    return true;
}

export function handleMessage(message: any): void {
    try {
        if (!shouldStore(message)) return;
        pending.push({
            id: message.id,
            channelId: message.channel_id,
            guildId: message.guild_id ?? null,
            authorId: message.author.id,
            authorName: message.author.global_name ?? message.author.username,
            authorAvatar: message.author.avatar ?? null,
            content: message.content ?? "",
            timestamp: Date.parse(message.timestamp) || 0,
            attachmentCount: (message.attachments?.length ?? 0) + (message.embeds?.length ?? 0)
        });
        newActivityChannels.add(message.channel_id);
        emit();
    } catch {
        // 單則訊息處理失敗不得中斷後續訊息
    }
}

export async function flush(): Promise<void> {
    if (pending.length === 0) return;
    const batch = pending;
    pending = [];

    const byChannel = new Map<string, StoredMessage[]>();
    for (const m of batch) {
        const list = byChannel.get(m.channelId) ?? [];
        list.push(m);
        byChannel.set(m.channelId, list);
    }

    for (const [channelId, msgs] of byChannel) {
        await DataStore.update<StoredMessage[]>(msgKey(channelId), old => {
            const merged = [...(Array.isArray(old) ? old : []), ...msgs];
            return merged.slice(-PER_CHANNEL_CAP);
        });
        const entry = index.find(e => e.channelId === channelId);
        const lastTs = msgs[msgs.length - 1].timestamp;
        if (entry) {
            entry.lastActivity = lastTs;
            entry.count = Math.min(entry.count + msgs.length, PER_CHANNEL_CAP);
        } else {
            index.push({ channelId, lastActivity: lastTs, count: msgs.length });
        }
    }

    let total = index.reduce((sum, e) => sum + e.count, 0);
    if (total > GLOBAL_CAP) {
        const sorted = [...index].sort((a, b) => a.lastActivity - b.lastActivity);
        for (const victim of sorted) {
            if (total <= GLOBAL_CAP) break;
            await DataStore.del(msgKey(victim.channelId));
            index = index.filter(e => e.channelId !== victim.channelId);
            total -= victim.count;
        }
    }

    await DataStore.set(INDEX_KEY, index);
    emit();
}

export function getChannelIndex(): ChannelMeta[] {
    return [...index].sort((a, b) => b.lastActivity - a.lastActivity);
}

export async function readPage(channelId: string, before?: number, limit = 30): Promise<StoredMessage[]> {
    const all = await DataStore.get<StoredMessage[]>(msgKey(channelId)) ?? [];
    const filtered = before ? all.filter(m => m.timestamp < before) : all;
    return filtered.slice(-limit);
}

export function getBlacklist(): string[] {
    return meta.blacklist;
}

export async function addToBlacklist(channelId: string): Promise<void> {
    if (!meta.blacklist.includes(channelId)) {
        meta.blacklist = [...meta.blacklist, channelId];
        await DataStore.set(META_KEY, meta);
    }
    await DataStore.del(msgKey(channelId));
    index = index.filter(e => e.channelId !== channelId);
    newActivityChannels.delete(channelId);
    await DataStore.set(INDEX_KEY, index);
    emit();
}

export function getNewActivityCount(): number {
    return newActivityChannels.size;
}

export async function markOpened(): Promise<void> {
    newActivityChannels.clear();
    meta.lastOpened = pending.length > 0 || index.length > 0
        ? Math.max(...index.map(e => e.lastActivity), 0)
        : meta.lastOpened;
    await DataStore.set(META_KEY, meta);
    emit();
}
```

- [ ] **Step 2: 實作 index.tsx 骨架**

```tsx
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
```

- [ ] **Step 3: 建置與型別檢查**

Run: `pnpm build && pnpm testTsc`
Expected: 無錯誤

- [ ] **Step 4: Runtime 驗證(console)**

Vesktop Ctrl+R,啟用 MessageBoard,等有新訊息的頻道活動至少 5 秒(一個 flush 週期)後:

```js
Vencord.Api.DataStore.get("MessageBoard_index").then(console.log)
```

Expected: 出現 `{ channelId, lastActivity, count }` 陣列;對其中一個 channelId 執行 `Vencord.Api.DataStore.get("MessageBoard_msgs_<id>").then(console.log)` 可看到精簡訊息物件。驗證過濾:自己發訊息、靜音頻道的訊息不出現。

- [ ] **Step 5: Commit**

```bash
cd "D:\Codes\Projects\Discord" && git add plugins/messageBoard && git commit -m "Add MessageBoard storage layer and message collection"
```

---

### Task 7: MessageBoard 看板 UI(卡片網格與分頁載入)

**Files:**
- Create: `D:\Codes\Projects\Discord\plugins\messageBoard\BoardModal.tsx`
- Create: `D:\Codes\Projects\Discord\plugins\messageBoard\styles.css`

**Interfaces:**
- Consumes: Task 6 的 `getChannelIndex`、`readPage`、`subscribe`、`markOpened`、`flush`
- Produces: `openBoard(): void`(開啟看板 Modal;Task 8 的工具鈕呼叫)。`ChannelCard` 內部元件在 Task 8 擴充互動。

- [ ] **Step 1: 實作 BoardModal.tsx**

```tsx
import ErrorBoundary from "@components/ErrorBoundary";
import { ChannelStore, GuildStore, Modal, moment, openModal, React, useEffect, useReducer, UserStore, useState } from "@webpack/common";

import { ChannelMeta, flush, getChannelIndex, markOpened, readPage, StoredMessage, subscribe } from "./storage";

function channelTitle(channelId: string): string {
    const channel = ChannelStore.getChannel(channelId);
    if (!channel) return "未知頻道";
    if (channel.guild_id) {
        const guild = GuildStore.getGuild(channel.guild_id);
        return (guild?.name ? guild.name + " " : "") + "#" + channel.name;
    }
    if (channel.name) return channel.name;
    const user = channel.recipients?.[0] ? UserStore.getUser(channel.recipients[0]) : null;
    return (user as any)?.globalName ?? user?.username ?? "私訊";
}

function MessageRow({ msg }: { msg: StoredMessage; }) {
    return (
        <div className="vc-msgboard-msg">
            <div className="vc-msgboard-msg-head">
                <span className="vc-msgboard-author">{msg.authorName}</span>
                <span className="vc-msgboard-time">{moment(msg.timestamp).format("HH:mm")}</span>
            </div>
            <div className="vc-msgboard-content">
                {msg.content || (msg.attachmentCount > 0 ? `[${msg.attachmentCount} 個附件]` : "")}
            </div>
        </div>
    );
}

export function ChannelCard({ meta }: { meta: ChannelMeta; }) {
    const [messages, setMessages] = useState<StoredMessage[]>([]);
    const [exhausted, setExhausted] = useState(false);

    useEffect(() => {
        readPage(meta.channelId).then(page => setMessages(page.reverse()));
    }, [meta.channelId, meta.lastActivity]);

    async function loadOlder() {
        const oldest = messages[messages.length - 1];
        if (!oldest) return;
        const page = await readPage(meta.channelId, oldest.timestamp);
        if (page.length === 0) { setExhausted(true); return; }
        setMessages([...messages, ...page.reverse()]);
    }

    return (
        <div className="vc-msgboard-card">
            <div className="vc-msgboard-card-title">{channelTitle(meta.channelId)}</div>
            <div className="vc-msgboard-card-body">
                {messages.map(m => <MessageRow key={m.id} msg={m} />)}
                {!exhausted && messages.length >= 30 && (
                    <div className="vc-msgboard-more" onClick={loadOlder}>載入更早的訊息</div>
                )}
            </div>
        </div>
    );
}

function BoardInner() {
    const [, forceUpdate] = useReducer(x => x + 1, 0);
    useEffect(() => subscribe(forceUpdate), []);

    const channels = getChannelIndex();
    return (
        <div className="vc-msgboard-grid">
            {channels.length === 0 && (
                <div className="vc-msgboard-empty">尚無訊息,新訊息進來後會自動出現在這裡</div>
            )}
            {channels.map(meta => <ChannelCard key={meta.channelId} meta={meta} />)}
        </div>
    );
}

const Board = ErrorBoundary.wrap(BoardInner, { noop: true });

export function openBoard(): void {
    flush().then(() => markOpened());
    openModal(props => (
        <Modal {...props} size="xxl" title="訊息動態磚">
            <Board />
        </Modal>
    ));
}
```

- [ ] **Step 2: 實作 styles.css**

```css
.vc-msgboard-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: 12px;
    padding: 12px;
    overflow-y: auto;
    max-height: 75vh;
}
.vc-msgboard-empty {
    grid-column: 1 / -1;
    text-align: center;
    color: var(--text-muted);
    padding: 48px 0;
}
.vc-msgboard-card {
    background: var(--background-secondary);
    border-radius: 8px;
    display: flex;
    flex-direction: column;
    max-height: 320px;
}
.vc-msgboard-card-title {
    font-weight: 700;
    font-size: 13px;
    padding: 10px 12px 6px;
    color: var(--header-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    border-bottom: 1px solid var(--background-modifier-accent);
}
.vc-msgboard-card-body { overflow-y: auto; padding: 6px 12px 10px; }
.vc-msgboard-msg { padding: 4px 0; }
.vc-msgboard-msg-head { display: flex; gap: 8px; align-items: baseline; }
.vc-msgboard-author { font-weight: 600; font-size: 13px; color: var(--header-primary); }
.vc-msgboard-time { font-size: 11px; color: var(--text-muted); }
.vc-msgboard-content { font-size: 13px; color: var(--text-normal); word-break: break-word; }
.vc-msgboard-more {
    text-align: center;
    font-size: 12px;
    color: var(--text-link);
    cursor: pointer;
    padding: 6px 0;
}
```

在 `index.tsx` 加入 `import "./styles.css";`

- [ ] **Step 3: 臨時入口驗證(console)**

尚未做工具鈕前,先建置後在 DevTools 驗證。`pnpm build && pnpm testTsc` 無錯誤後,Vesktop Ctrl+R,console:

```js
Vencord.Plugins.plugins.MessageBoard  // 確認外掛物件存在
```

再從外掛暫時掛出 `openBoard`(在 index.tsx definePlugin 物件加一行 `openBoard,`,即可用 `Vencord.Plugins.plugins.MessageBoard.openBoard()` 開啟)。驗證:

1. Modal 開啟,卡片依最新活動排序,每張卡片最多 30 則
2. 訊息滿 30 則的卡片出現「載入更早的訊息」,點擊往回翻頁,到底顯示停止
3. 看板開著時新訊息進來,對應卡片即時更新
4. 空狀態文字正確顯示

- [ ] **Step 4: Commit**

```bash
cd "D:\Codes\Projects\Discord" && git add plugins/messageBoard && git commit -m "Add MessageBoard card grid modal with paged loading"
```

---

### Task 8: MessageBoard 互動(回覆、跳轉、右鍵、入口徽章)

**Files:**
- Modify: `D:\Codes\Projects\Discord\plugins\messageBoard\BoardModal.tsx`
- Modify: `D:\Codes\Projects\Discord\plugins\messageBoard\index.tsx`
- Modify: `D:\Codes\Projects\Discord\plugins\messageBoard\styles.css`

**Interfaces:**
- Consumes: Task 6 的 `addToBlacklist`、`getNewActivityCount`;Task 7 的 `openBoard`、`ChannelCard`、`MessageRow`
- Produces: 完整功能的 MessageBoard 外掛

- [ ] **Step 1: 訊息列互動(快速回覆與跳轉)**

`BoardModal.tsx` 的 `MessageRow` 改為(並在檔頭補 import `sendMessage` from `@utils/discord`、`NavigationRouter`、`closeAllModals` 或保存 modal key 用 `closeModal`;採用保存 key 方式):

```tsx
import { sendMessage } from "@utils/discord";
import { closeModal, NavigationRouter, TextInput, Toasts } from "@webpack/common";

let currentModalKey: string | null = null;

function jumpTo(msg: StoredMessage): void {
    if (currentModalKey) closeModal(currentModalKey);
    NavigationRouter.transitionTo(`/channels/${msg.guildId ?? "@me"}/${msg.channelId}/${msg.id}`);
}

function MessageRow({ msg }: { msg: StoredMessage; }) {
    const [replying, setReplying] = useState(false);
    const [text, setText] = useState("");

    async function submitReply() {
        if (!text.trim()) return;
        await sendMessage(msg.channelId, { content: text }, false, {
            messageReference: {
                channel_id: msg.channelId,
                message_id: msg.id,
                ...(msg.guildId ? { guild_id: msg.guildId } : {})
            },
            allowedMentions: { parse: ["users"], replied_user: true }
        });
        setText("");
        setReplying(false);
        Toasts.show({ message: "已回覆", type: Toasts.Type.SUCCESS, id: Toasts.genId() });
    }

    return (
        <div className="vc-msgboard-msg">
            <div className="vc-msgboard-msg-head" onClick={() => setReplying(v => !v)}>
                <span className="vc-msgboard-author">{msg.authorName}</span>
                <span className="vc-msgboard-time">{moment(msg.timestamp).format("HH:mm")}</span>
                <span className="vc-msgboard-jump" onClick={e => { e.stopPropagation(); jumpTo(msg); }}>跳轉</span>
            </div>
            <div className="vc-msgboard-content" onClick={() => setReplying(v => !v)}>
                {msg.content || (msg.attachmentCount > 0 ? `[${msg.attachmentCount} 個附件]` : "")}
            </div>
            {replying && (
                <div className="vc-msgboard-reply">
                    <TextInput
                        value={text}
                        onChange={setText}
                        placeholder="輸入回覆,Enter 送出"
                        autoFocus
                        onKeyDown={(e: React.KeyboardEvent) => {
                            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submitReply(); }
                            if (e.key === "Escape") setReplying(false);
                        }}
                    />
                </div>
            )}
        </div>
    );
}
```

`openBoard` 保存 modal key:`currentModalKey = openModal(...)`。

- [ ] **Step 2: 卡片與訊息右鍵選單(靜音頻道、僅隱藏)**

靜音動作模組(檔頭):

```ts
import { findByPropsLazy } from "@webpack";
const NotificationSettingsActions = findByPropsLazy("updateChannelOverrideSettings");
```

`ChannelCard` 的標題與 `MessageRow` 外層 div 加 `onContextMenu`:

```tsx
import { ContextMenuApi, Menu } from "@webpack/common";
import { addToBlacklist } from "./storage";

function openCardMenu(e: React.MouseEvent, channelId: string, guildId: string | null) {
    ContextMenuApi.openContextMenu(e, () => (
        <Menu.Menu navId="vc-msgboard-card-menu" onClose={ContextMenuApi.closeContextMenu}>
            <Menu.MenuItem
                id="vc-msgboard-mute"
                label="靜音此頻道"
                color="danger"
                action={() => {
                    NotificationSettingsActions.updateChannelOverrideSettings(
                        guildId ?? null,
                        { [channelId]: { muted: true } }
                    );
                    addToBlacklist(channelId);
                }}
            />
            <Menu.MenuItem
                id="vc-msgboard-hide"
                label="僅從動態磚隱藏"
                action={() => addToBlacklist(channelId)}
            />
        </Menu.Menu>
    ));
}
```

注意:`updateChannelOverrideSettings` 的實際參數形狀需 runtime 驗證(Step 4)。

- [ ] **Step 3: 標題列入口按鈕與徽章**

`index.tsx` 加入(vencordToolbox 模式):

```tsx
import ErrorBoundary from "@components/ErrorBoundary";
import { findComponentByCodeLazy } from "@webpack";
import { useEffect, useReducer } from "@webpack/common";

import { openBoard } from "./BoardModal";
import { getNewActivityCount, subscribe } from "./storage";

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

// definePlugin 內新增(patch 錨點沿用 Task 5 探勘的標題列模組,插在 trailing 區,
// 與 vencordToolbox 的 TrailingWrapper 手法相同,match 以 Patch Helper 驗證為準):
    patches: [
        {
            find: '?"BACK_FORWARD_NAVIGATION":',
            replacement: {
                match: /(?<=<Task5 探勘的 trailing 錨點>)/,
                replace: "$self.renderBoardButton(),"
            }
        }
    ],

    renderBoardButton() {
        return (
            <ErrorBoundary noop>
                <BoardButton />
            </ErrorBoundary>
        );
    },
```

補充 styles.css:

```css
.vc-msgboard-jump { font-size: 11px; color: var(--text-link); cursor: pointer; margin-left: auto; }
.vc-msgboard-reply { padding: 4px 0 2px; }
```

- [ ] **Step 4: 建置、型別檢查、runtime 驗證**

Run: `pnpm build && pnpm testTsc` → 無錯誤。Vesktop Ctrl+R 後驗證清單:

1. 標題列出現動態磚按鈕;有新訊息後 tooltip 顯示頻道數;開啟看板後歸零
2. 點訊息展開回覆框,Enter 送出,到該頻道確認訊息以「回覆」形式出現且引用正確
3. 「跳轉」關閉看板並落在該訊息位置(高亮)
4. 右鍵卡片標題:「靜音此頻道」後,到 Discord 原生通知設定確認該頻道已靜音、卡片消失、後續訊息不再收集。若 `updateChannelOverrideSettings` 參數形狀報錯,在 console 執行 `Vencord.Webpack.findByProps("updateChannelOverrideSettings").updateChannelOverrideSettings.toString()` 檢視實際簽名並修正
5. 「僅從動態磚隱藏」後卡片消失,但 Discord 原生通知設定不變
6. 重啟 Vesktop:看板歷史訊息仍在(持久化生效)

- [ ] **Step 5: Commit**

```bash
cd "D:\Codes\Projects\Discord" && git add plugins/messageBoard && git commit -m "Add MessageBoard interactions and title bar entry"
```

---

### Task 9: 整體驗收與文件

**Files:**
- Modify: `D:\Codes\Projects\Discord\README.md`

**Interfaces:**
- Consumes: 全部三個外掛

- [ ] **Step 1: 全量重建**

Run: `cd D:\Codes\Projects\Discord\Vencord && pnpm build && pnpm testTsc && pnpm lint`
Expected: 全部通過(lint 若僅報上游既有問題可忽略,userplugins 內不得有報錯)

- [ ] **Step 2: 三外掛同時啟用的整合驗證**

1. 三個外掛同時啟用,無 console 錯誤、無 patch 失敗警告
2. 交互情境:動態磚「跳轉」後,ChannelTabs 自動為目標頻道開分頁;FavoriteChannels 的最愛頻道被靜音後仍可置頂(最愛與靜音互不影響)
3. 停用任一外掛(Ctrl+R 後)其餘兩者正常
4. 完全重啟 Vesktop:最愛、分頁、動態磚歷史全部還原

- [ ] **Step 3: README 補完(功能說明與維護指南)**

在 README.md 追加:三個外掛的功能簡述、DataStore 鍵一覽、Discord 更新導致 patch 失效時的處理程序(Patch Helper 重新探勘 find/match)。

- [ ] **Step 4: 最終 commit**

```bash
cd "D:\Codes\Projects\Discord" && git add -A && git commit -m "Complete integration verification and docs"
```

---

## Self-Review 紀錄

- Spec 覆蓋:最愛置頂(Task 2-3)、分頁(Task 4-5)、動態磚含持久化與按需讀取(Task 6-7)、回覆/跳轉/右鍵靜音/徽章(Task 8)、錯誤處理(各任務 ErrorBoundary + try/catch + 格式重置)、測試(各任務 runtime 清單 + Task 9)、安全前提(無歷史回填,僅 Gateway 推送)均有對應任務
- 已知妥協:UI 注入的 patch `find`/`match` 字串無法離線確定,以「runtime 錨點探勘」步驟給出精確程序;動態磚卡片虛擬化渲染(spec 提及)以 CSS `max-height` + overflow 卡片內捲動替代,頻道卡片數量級(數十)不需要虛擬化,若實測卡頓再補
- 型別一致性:`data.ts`/`tabs.ts`/`storage.ts` 的匯出簽名與 UI 消費端一致
