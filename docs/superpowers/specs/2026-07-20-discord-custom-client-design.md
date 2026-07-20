# Discord 自製客戶端設計文件

日期:2026-07-20
狀態:待使用者核准

## 1. 目標與範圍

以主帳號日常安全使用為前提,打造客製化 Discord 客戶端。不直接連 Discord API 自製客戶端(封號風險),改採 Vesktop + 自建 Vencord 的架構,所有功能以自寫 Vencord userplugin 實作。

三項功能:

1. favoriteChannels:頻道最愛置頂
2. channelTabs:瀏覽器式頻道分頁
3. messageBoard:訊息動態磚(未靜音頻道的即時訊息牆)

## 2. 整體架構

```
Vesktop(官方 release,Electron 外殼,不修改)
  └─ Discord Web App(官方,不修改)
      └─ Vencord(clone 原始碼自行 build)
          └─ src/userplugins/
              ├─ favoriteChannels/
              ├─ channelTabs/
              └─ messageBoard/
```

- Vesktop 使用官方安裝版,跟隨上游自動更新
- Vencord clone 至 `D:\Codes\Projects\Discord\Vencord`,以 pnpm 建置
- 自訂外掛全部放在 `src/userplugins/`(上游保留目錄,git pull 不衝突)
- Vesktop 設定中將 Vencord Location 指向自建 build,重啟生效
- 開發迭代:`pnpm build --watch` + Discord 內 Ctrl+R 重載

共用技術基礎:

- DataStore(IndexedDB 包裝):所有持久化狀態
- Webpack finders:取得 Discord 內部模組(ChannelStore、ReadStateStore、NavigationRouter、UserGuildSettingsStore 等)
- FluxDispatcher:訂閱 CHANNEL_SELECT、MESSAGE_CREATE、CHANNEL_DELETE 等事件
- ContextMenu API:右鍵選單插入自訂項目

## 3. 外掛一:favoriteChannels(最愛頻道置頂)

### 互動

- 右鍵頻道,選單出現「加入最愛」;已在最愛則顯示「移除最愛」
- 該伺服器頻道列表最頂端出現「最愛」虛擬分類,列出該伺服器所有最愛頻道
- 最愛區頻道的點擊、未讀標記、提及數字與原生頻道完全相同
- 範圍採「每伺服器各自的最愛」,顯示於該伺服器頻道列表頂端(非跨伺服器全域清單)

### 實作

- ContextMenu API 掛在 `channel-context` 選單
- Patch 伺服器頻道列表元件,頂端注入合成分類,重用原生頻道元件渲染
- DataStore 鍵 `favoriteChannels`,結構 `{ [guildId]: channelId[] }`,順序為加入順序
- 監聽 CHANNEL_DELETE,頻道刪除時自動移出清單;讀取時過濾已不存在的頻道(退出伺服器情境)

## 4. 外掛二:channelTabs(頻道分頁)

### 互動

- 聊天區上方顯示分頁列
- 切換到任何頻道(含私訊、群組)時,無對應分頁則自動新增;已有則點亮
- 分頁可點擊切換、X 或滑鼠中鍵關閉、拖曳排序
- 分頁顯示頻道名稱(私訊顯示對方名稱)與未讀狀態
- 完整持久化:分頁清單、順序、最後停留分頁;重啟後全部還原並自動導向上次頻道

### 實作

- Patch 聊天區標題列上方,渲染自訂 React 分頁列
- 監聽 CHANNEL_SELECT 追蹤導覽;點分頁時呼叫 NavigationRouter.transitionTo
- DataStore 鍵 `channelTabs`,結構 `{ tabs: channelId[], activeTab: channelId | null }`
- 啟動還原時逐一驗證頻道存在性(ChannelStore),不存在的分頁靜默移除
- 分頁數不設上限,超出寬度時分頁列可橫向捲動

## 5. 外掛三:messageBoard(訊息動態磚)

### 互動

- 首頁(私訊)側欄頂部新增「動態磚」入口按鈕,點擊開啟全螢幕視圖
- 版面為頻道卡片網格:每張卡片代表一個有新訊息的未靜音頻道,卡片內列出該頻道最近訊息(新在上),卡片依最新活動時間排序
- 訊息互動:
  - 點擊訊息:卡片內展開快速回覆輸入框,Enter 以「回覆」形式送出
  - 跳轉按鈕:關閉視圖並導向該訊息所在位置(deep link)
  - 右鍵訊息或卡片:
    - 「靜音此頻道」:呼叫 Discord 原生靜音(通知停止,卡片消失)
    - 「僅從動態磚隱藏」:加入外掛層黑名單,不影響 Discord 原生通知
- 入口按鈕顯示徽章:上次開啟動態磚後有新活動的頻道數

### 訊息來源與過濾

- 來源:訂閱 MESSAGE_CREATE 即時接收(Gateway 自動推送,無須主動請求),加上 MessageStore 既有快取
- 不做跨頻道歷史回填抓取(離線期間的訊息不補撈,避免異常流量與 rate limit,維持帳號安全)
- 過濾條件(全部須通過才顯示):
  - 頻道未靜音且所屬伺服器未靜音(UserGuildSettingsStore)
  - 不在外掛黑名單
  - 非自己發送的訊息
  - 非被封鎖使用者的訊息

### 訊息儲存與按需讀取

- 通過過濾的訊息精簡後持久化寫入 DataStore(IndexedDB):保留 id、頻道 id、作者名稱與頭像、內容、時間戳、附件摘要、回覆對象摘要;重啟 Vesktop 後仍保留
- 儲存上限:每頻道 500 則、全域 10000 則,超出時淘汰最舊;寫入採批次(節流)避免高頻 IndexedDB 操作
- 按需讀取(同 Discord 原生訊息載入方式):開啟動態磚時每張卡片僅讀取最新一頁(30 則)進記憶體,卡片內向下捲動時再分頁載入更舊的訊息
- 記憶體僅保留畫面所需頁面,其餘留在 IndexedDB;卡片本身採虛擬化渲染,頻道數量多時不影響效能

### 實作

- 全螢幕視圖以 Modal(FULL size)呈現,跳轉時自動關閉
- 回覆透過 Discord 內部 MessageActions 附 message_reference 送出
- DataStore 鍵 `messageBoard`,結構 `{ blacklist: channelId[], lastOpened: timestamp }`;訊息本體另以每頻道獨立鍵 `messageBoard.msgs.<channelId>` 儲存,便於分頁讀取與逐頻道淘汰

## 6. 錯誤處理

- 每個外掛獨立,任一外掛 patch 失敗不影響其他外掛與 Discord 本體
- Patch 比對失敗時(Discord 更新內部程式碼):Vencord 記錄警告,外掛該部分功能靜默停用,不產生錯誤彈窗
- DataStore 讀取到格式不符的舊資料時,重置該鍵為預設值
- messageBoard 的 Flux 訂閱包 try/catch,單則訊息處理失敗不中斷後續訊息

## 7. 相容性維護

- Discord 內部程式碼更新可能使 patch 失效;維護方式為調整 patch 比對字串,Vencord 核心 finder 由上游社群維護
- 定期 `git pull` Vencord 上游後重新 build;userplugins 目錄不受上游變更影響

## 8. 測試

- 建置驗證:`pnpm build` 與 TypeScript 檢查通過
- 每個外掛附手動測試清單:
  - favoriteChannels:加入/移除最愛、置頂顯示、未讀標記、重啟還原、刪除頻道後自動清理
  - channelTabs:自動開分頁、切換、關閉、拖曳排序、中鍵關閉、重啟還原、失效頻道清理
  - messageBoard:訊息即時出現、過濾規則(靜音/黑名單/自己/封鎖)、快速回覆、跳轉、右鍵靜音、徽章計數、緩衝上限淘汰
- 每項功能在 Vesktop 中依上述清單實測通過後,才視為完成

## 9. 安全前提

- 不修改網路層、不偽造流量、不大量抓取 API;所有行為皆為官方 Web App 內的 UI 層操作
- 與 Vencord 一般外掛的風險等級相同(實務上無封號案例),但使用者知悉 client mod 嚴格而言不符 Discord ToS

## 10. 建置順序建議

1. 開發環境:Vencord clone、建置、Vesktop 掛載自建 build
2. favoriteChannels(最簡單,驗證開發流程)
3. channelTabs
4. messageBoard(最複雜,依賴前兩者累積的模式)
