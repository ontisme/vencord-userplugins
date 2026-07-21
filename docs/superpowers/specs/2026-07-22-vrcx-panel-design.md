# vrcxPanel(VRCX 面板)設計文件

日期:2026-07-22
狀態:自動模式下依 /goal 指令直接定案

## 1. 目標與範圍

在 Discord(Vesktop + 自建 Vencord)好友頁新增 VRCX 分頁,把 VRCX 的 Feed 頁面遷移進來:

- 入口:好友頁分頁列新增「VRCX」分頁(做法同 messageBoard 的「動態磚」),插在**最前面**
- 預設:VRCX 已連線(能讀到資料庫)時,好友頁開啟即預設顯示 VRCX 分頁(而非原本的「線上」)
- 內容:遷移使用者截圖的頁面——左側 Feed 表格(Date/Type/User/Detail,含 All/GPS/Online/Offline/Status/Avatar/Bio 過濾分頁),右側好友側欄(ME/FAVORITES/ONLINE 分組)
- 非重複實作 VRCX:僅在 VRCX 有在運行(資料庫可讀)時把資料一併顯示到 Discord;VRCX 未運行則分頁顯示「未偵測到 VRCX」

## 2. 資料來源(2026-07-22 實測確認)

VRCX 無任何對外查詢 API(named pipe 與 34582 WebSocket 皆為單向控制通道,不回傳資料)。唯一可行來源為**唯讀讀取其 SQLite 資料庫** `%APPDATA%\VRCX\VRCX.sqlite3`:

- WAL 模式、`locking_mode=NORMAL`,VRCX 運行時不獨占鎖檔,外部可並行唯讀
- 表名前綴為登入者 userId 去除 `-`/`_`(數字開頭補 `_`),例如 `usr16f4...b330_feed_gps`
- Feed 五表:`feed_gps`(移動)、`feed_online_offline`(type=Online/Offline)、`feed_status`、`feed_avatar`、`feed_bio`;好友名單 `friend_log_current`(user_id、display_name、trust_level、friend_number)
- 好友「即時線上狀態/location」不存在 DB(僅活在 VRCX 記憶體);好友側欄的線上狀態改由 `feed_online_offline` + `feed_gps` 各人最新一筆**推估最後已知狀態**,並標示為推估

### 零依賴 SQLite 讀取(已用原型驗證)

依使用者要求不裝任何 npm 套件,native.ts 自行解析 SQLite 檔:

- 解析主檔 B-tree(interior/leaf table page)、record format(varint + serial types)、overflow page 串接
- WAL 存在時解析 `-wal` frame:取每頁最後一個有效 commit(dbSize!=0)之前的最新版本覆蓋主檔頁
- 原型實測:feed_gps 1448 筆、feed_avatar 2523 筆全讀出、長 URL(overflow)完整、中文 display_name 正常、與 VRCX 顯示一致
- 唯讀,永不寫入;讀檔採 `readFileSync` 快照,單次輪詢內一致

## 3. 架構與元件

```
plugins/vrcxPanel/
  index.tsx     definePlugin:patch 分頁列(插最前)+ 內容區渲染 + 掛載時預設切換
  native.ts     main process:解析 VRCX.sqlite3,IPC 回傳 Feed 與好友資料
  Panel.tsx     面板:左 Feed 表格 + 右好友側欄
  data.ts       renderer 側輪詢、快取、狀態訂閱、location 解析
  styles.css    版面(仿 VRCX 深色表格 + 側欄)
```

## 4. 分頁注入與預設(index.tsx)

- Patch 好友頁模組 `find: '"pendingFriends"'`(messageBoard 同一模組):
  1. 分頁列:在最前面插入 VRCX 分頁(`match` 定位分頁陣列起始,插入 `$self.makeTab()`)
  2. 內容區:選中 VRCX 分頁時渲染 `$self.renderPanel()`(同 messageBoard 的 `BOARD_SECTION` 三元式擴充)
- 預設顯示:好友頁掛載時,若 native 回報 VRCX 可讀,主動將 tab bar 狀態切到 VRCX section。做法為 Panel 或 tab 元件在 mount 時檢查連線並呼叫既有 section 切換(避免改 Discord section store 初始值,降低易碎性);VRCX 不可讀則不搶預設,維持 Discord 原生行為
- VRCX section id 常數 `VRCX_SECTION = "VC_VRCX_PANEL"`

## 5. native.ts(main process,IPC)

- `getStatus()`:回傳 { available, userId, dbPath };available = 檔案存在且可解析
- `getFeed({ limit, filter })`:UNION 五張 feed 表 → 統一為 { created_at, type, userId, displayName, detail },依 created_at DESC,套用 filter(all/gps/online/offline/status/avatar/bio),回傳前 limit 筆
  - detail 組法比照 VRCX:gps→world_name(+ 分組/instance 類型)、online/offline→type(+ world_name)、avatar→avatar_name、status→status + description、bio→bio 摘要
- `getFriends()`:回傳 friend_log_current 全量 + 各人由 feed 推估的最後已知狀態(online/offline/在哪個 world),供側欄分組(ME/FAVORITES/ONLINE/OFFLINE)
- userId 取得:優先讀 DB `configs` 或 cookies 表推斷當前登入者;失敗則掃描表名前綴 `usr..._feed_gps` 反推
- 所有讀取包 try/catch;檔案被短暫鎖住或半寫入時回上一次成功結果

## 6. data.ts(renderer)

- 開啟面板時啟動輪詢(預設每 5 秒)呼叫 native getFeed/getFriends,關閉面板停止
- location 字串解析(`wrld_xxx:instanceId~type(...)~region(..)`)→ 顯示 world 名稱 + instance 類型(Public/Friends+/Private 等)+ region 旗標,比照 VRCX Detail 欄
- 快取上次結果;輪詢失敗沿用快取不清空

## 7. Panel.tsx

- 左側 Feed 表格:欄 Date(MM/DD HH:mm)、Type(GPS/Online/Offline/Status/Avatar/Bio 標籤)、User(display_name)、Detail;頂部過濾分頁 All/GPS/Online/Offline/Status/Avatar/Bio
- 右側好友側欄:ME(自己)、FAVORITES、ONLINE、OFFLINE 分組,每列頭像 + 名稱 + 最後已知 location;線上狀態標「推估」小字
- 頭像/縮圖用 feed_avatar 的 thumbnail URL 或 VRChat 頭像(經 CSP;img-src 對 api.vrchat.cloud 需放行,見第 9 節)
- 虛擬化非必要(Feed 預設 limit 100 筆,分頁載入更多)

## 8. 錯誤處理

- VRCX 未運行/DB 不存在:面板顯示「未偵測到 VRCX,請確認 VRCX 已啟動」,不搶預設分頁
- DB 解析失敗(格式異常/寫入中):沿用快取,面板不崩;native 回 { available:false } 時前端顯示提示
- patch 失敗:Vencord 靜默停用,好友頁本體不受影響;renderPanel 外層 ErrorBoundary

## 9. CSP(native.ts)

- 好友頭像與 avatar 縮圖來自 `api.vrchat.cloud`;若被 Discord CSP 擋,經 `CspPolicies["api.vrchat.cloud"] = ["img-src"]` 放行(需重啟 Vesktop)
- 影像 CDN 若為 `*.vrchat.cloud` 一併放行

## 10. 測試

- native 讀取單元驗證:對真實 VRCX.sqlite3,feed 五表與 friend_log_current 筆數/內容與 VRCX 一致(原型已過)
- WAL 場景:VRCX 活躍寫入(存在 -wal)時仍讀到最新 commit
- 建置:`pnpm build` 與 tsc 通過
- 實機(CDP):好友頁預設顯示 VRCX 分頁、Feed 表格與過濾、好友側欄分組、VRCX 關閉時的降級提示
- 重載後乾淨 session 再驗錨點
