# 語音說話者浮窗(VoiceSpeakerPopout)設計文件

日期:2026-07-21
狀態:待使用者核准

## 1. 目標

新增一個 Vencord 外掛,提供獨立的置頂小視窗,顯示目前所在語音頻道的成員與說話狀態(說話時頭像亮綠圈並輕微放大),讓使用者不必開 Discord 主畫面也能一眼看到誰在講話。類似 Discord in-game overlay 的語音列。

## 2. 技術架構

**平台限制(2026-07-21 實測確認):** Vesktop 的 `isPlatformEmbedded` 為 `false`,Discord 內建 `PopoutActions.open` 不會建立原生視窗(dispatch 有送出但 PopoutWindowStore 不建視窗);Vesktop 的 `VesktopNative` 也無建立第二視窗的 API。因此**改用 Discord 畫面內的可拖曳浮層**,而非獨立視窗。

浮層以 React Portal 掛到 `document.body`(`position: fixed`,高 z-index),浮在 Discord UI 最上層:

- 可用滑鼠拖曳標題列移動到畫面任何位置
- 位置以 DataStore 記憶
- 需開著 Discord 視窗才看得到浮層(可把 Discord 視窗縮到螢幕一角並讓浮層置於其上)
- 注入方式:patch app 根層渲染 `<Overlay />`(如 ChannelTabs/FavoriteServers 用的 base 佈局注入點),或用 Vencord 的 `renderMessageAccessory` 之外的全域注入;採 base 佈局注入(穩定)

資料來源(皆為 Vencord `@webpack/common` store,即時訂閱):

- `SelectedChannelStore.getVoiceChannelId()`:自己目前所在語音頻道(null = 不在語音)
- `VoiceStateStore.getVoiceStatesForChannel(channelId)`:該頻道所有成員與其狀態(mute、deaf、selfMute、selfDeaf、selfVideo、selfStream)
- `SpeakingStore.isSpeaking(userId)`:某成員是否正在說話
- `UserStore.getUser(userId)`:成員名稱與頭像

外掛結構(`plugins/voiceSpeakerPopout/`):

```
index.tsx        definePlugin:設定、toolbox 開關、進出語音的 flux、base 佈局 patch 注入 Overlay
Overlay.tsx      浮層外殼:可拖曳定位、開關可見、位置記憶;內含 SpeakerList
SpeakerList.tsx  成員清單:訂閱 store,渲染成員頭像網格與說話效果
settings.ts      definePluginSettings:顯示選項
state.ts         DataStore:浮層開關狀態、位置記憶
styles.css       浮層外框、頭像、說話綠圈/放大、mute/deaf 圖示、佈局
```

## 3. 設定選項(definePluginSettings)

- `showMode`(SELECT):顯示對象
  - `all`(預設):顯示頻道全部成員,說話時亮起,安靜時暗/灰
  - `speakingOnly`:只顯示正在說話的人
- `layout`(SELECT):排列方式
  - `grid`(預設):頭像橫向排列,自動換行
  - `list`:垂直列表,頭像旁顯示名字
- `autoOpen`(BOOLEAN,預設 false):加入語音時自動顯示浮層、離開時自動隱藏
- (移除 alwaysOnTop:浮層本就在 Discord UI 最上層,無獨立視窗的置頂概念)

## 4. 浮層內容與外觀(Overlay + SpeakerList)

- 頂部細標題列(拖曳把手):頻道名稱 + 成員數 + 關閉按鈕;按住拖曳可移動浮層
- 成員區:依 `layout` 設定為 grid 或 list
- 每位成員:
  - 圓形頭像
  - 說話中:外圈亮綠色(`#23a55a`)+ 頭像 `transform: scale(1.08)`,以 CSS transition 平滑過渡(不是強烈跳動)
  - 安靜(all 模式):頭像降低透明度/去飽和,無綠圈
  - 右下角狀態小圖示:自我靜音(selfMute)顯示麥克風斜線、拒聽(selfDeaf)顯示耳機斜線;兩者皆無則不顯示圖示
  - list 佈局額外顯示成員名稱(暱稱優先)
- 空狀態:不在語音頻道時,浮層顯示「目前不在語音頻道」
- 定位:`position: fixed`,預設右下角;拖曳標題列改變位置,位置存 DataStore

## 5. 開關入口與生命週期

- 入口:Vencord toolbox(標題列工具箱)新增一個「語音浮層」開關項,點擊顯示/隱藏浮層
- `autoOpen` 開啟時:訂閱 `SelectedChannelStore` 的語音頻道 id 變化(`getVoiceChannelId()` 由 null 變有值 = 加入,由有值變 null = 離開),加入自動顯示、離開自動隱藏
- 顯示狀態記憶:以 DataStore 記錄「使用者上次是否顯示浮層」與浮層座標,外掛啟動時恢復
- 浮層只有一個實例;不在語音且非空狀態時仍可顯示「目前不在語音頻道」

## 6. 效能

- SpeakerList 以 `useStateFromStores` 訂閱,只有相關 store 變化才重繪
- 說話狀態變化頻繁:訂閱 `SpeakingStore` 但以成員為單位各自 memo,避免單一成員說話重繪整個列表
- 成員數通常少(語音頻道人數有限),不需虛擬化

## 7. 錯誤處理

- Overlay 以 `ErrorBoundary`(noop)包裹,渲染錯誤不影響 Discord 本體
- 成員頭像載入失敗:回退為首字母佔位(重用 `_shared/avatar.ts`)
- 拖曳超出視窗邊界:座標讀取時 clamp 回可見範圍

## 8. 相容性

- 浮層為純前端(fixed 定位 + Portal),不依賴任何桌面原生 API,Vesktop / 官方桌面版 / 瀏覽器版皆可用
- 注入點為 app base 佈局(同 ChannelTabs/FavoriteServers);Discord 更新導致 store 名稱或注入點變更時,調整 `findStore` 名稱字串或 patch

## 9. 測試(手動,於 Vesktop)

- 加入語音頻道,顯示浮層:顯示頻道成員頭像
- 自己或他人說話:對應頭像亮綠圈 + 放大;停止說話恢復
- 切換設定 showMode(all/speakingOnly)、layout(grid/list):即時反映
- 自我靜音/拒聽:對應圖示出現
- autoOpen:加入語音自動顯示、離開自動隱藏
- 拖曳標題列移動浮層;重載後位置記憶
- 縮小 Discord 視窗到一角:浮層隨 Discord UI 顯示於最上層
- 重啟 Vesktop:記憶上次顯示狀態與位置

## 10. 建置順序(給實作計畫)

1. 外掛骨架 + settings + toolbox 開關 + base 注入(能顯示空白浮層)
2. PopoutView:訂閱語音頻道成員,渲染頭像(尚無說話效果)
3. 說話效果(SpeakingStore)+ mute/deaf 圖示
4. showMode / layout 設定生效 + autoOpen + 狀態記憶
5. 樣式打磨與手動驗收
