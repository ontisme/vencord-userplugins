# 語音說話者浮窗(VoiceSpeakerPopout)設計文件

日期:2026-07-21
狀態:待使用者核准

## 1. 目標

新增一個 Vencord 外掛,提供獨立的置頂小視窗,顯示目前所在語音頻道的成員與說話狀態(說話時頭像亮綠圈並輕微放大),讓使用者不必開 Discord 主畫面也能一眼看到誰在講話。類似 Discord in-game overlay 的語音列。

## 2. 技術架構

以 Discord 內建 `PopoutActions` 開啟真正獨立的 Electron 視窗:

- `PopoutActions.open(key, renderFn, features)`:開啟獨立視窗,`renderFn` 回傳 React 內容
- `PopoutActions.setAlwaysOnTop(key, boolean)`:置頂
- `PopoutActions.close(key)`:關閉
- 視窗獨立於 Discord 主視窗,可拖曳、可置頂、可縮放;關閉主畫面仍浮在最上層

資料來源(皆為 Vencord `@webpack/common` store,即時訂閱):

- `SelectedChannelStore.getVoiceChannelId()`:自己目前所在語音頻道(null = 不在語音)
- `VoiceStateStore.getVoiceStatesForChannel(channelId)`:該頻道所有成員與其狀態(mute、deaf、selfMute、selfDeaf、selfVideo、selfStream)
- `SpeakingStore.isSpeaking(userId)`:某成員是否正在說話
- `UserStore.getUser(userId)`:成員名稱與頭像

外掛結構(`plugins/voiceSpeakerPopout/`):

```
index.tsx        definePlugin:設定、toolbox/指令入口、進出語音的 flux、popout 開關
PopoutView.tsx   浮窗內容元件:訂閱上述 store,渲染成員頭像網格
settings.ts      definePluginSettings:顯示選項
styles.css       頭像、說話綠圈/放大、mute/deaf 圖示、佈局
```

## 3. 設定選項(definePluginSettings)

- `showMode`(SELECT):顯示對象
  - `all`(預設):顯示頻道全部成員,說話時亮起,安靜時暗/灰
  - `speakingOnly`:只顯示正在說話的人
- `layout`(SELECT):排列方式
  - `grid`(預設):頭像橫向排列,自動換行
  - `list`:垂直列表,頭像旁顯示名字
- `autoOpen`(BOOLEAN,預設 false):加入語音時自動開啟浮窗、離開時自動關閉
- `alwaysOnTop`(BOOLEAN,預設 true):浮窗置頂

## 4. 浮窗內容與外觀(PopoutView)

- 頂部細標題列:頻道名稱 + 成員數
- 成員區:依 `layout` 設定為 grid 或 list
- 每位成員:
  - 圓形頭像
  - 說話中:外圈亮綠色(`#23a55a`)+ 頭像 `transform: scale(1.08)`,以 CSS transition 平滑過渡(不是強烈跳動)
  - 安靜(all 模式):頭像降低透明度/去飽和,無綠圈
  - 右下角狀態小圖示:自我靜音(selfMute)顯示麥克風斜線、拒聽(selfDeaf)顯示耳機斜線;兩者皆無則不顯示圖示
  - list 佈局額外顯示成員名稱(暱稱優先)
- 空狀態:不在語音頻道時,浮窗顯示「目前不在語音頻道」

## 5. 開關入口與生命週期

- 入口:Vencord toolbox(標題列工具箱)新增一個「語音浮窗」開關項,點擊開/關浮窗
- `autoOpen` 開啟時:訂閱 `SelectedChannelStore` 的語音頻道 id 變化(`getVoiceChannelId()` 由 null 變有值 = 加入,由有值變 null = 離開),加入自動開浮窗、離開自動關
- 手動開啟後狀態記憶:以 DataStore 記錄「使用者上次是否開著浮窗」,外掛啟動時若上次為開且仍在語音則自動恢復
- 浮窗只會有一個實例(固定 popout key `vc-voice-speaker`),重複開啟只聚焦既有視窗

## 6. 效能

- PopoutView 以 `useStateFromStores` 訂閱,只有相關 store 變化才重繪
- 說話狀態變化頻繁:訂閱 `SpeakingStore` 但以成員為單位各自 memo,避免單一成員說話重繪整個列表
- 成員數通常少(語音頻道人數有限),不需虛擬化

## 7. 錯誤處理

- PopoutView 以 `ErrorBoundary`(noop)包裹,渲染錯誤不影響 Discord 本體
- 取不到 popout API(理論上不會,桌面版皆有)時:記警告並靜默停用開關,不彈錯誤
- 成員頭像載入失敗:回退為首字母佔位(重用 `_shared/avatar.ts`)

## 8. 相容性

- 依賴 `PopoutActions`(Discord 內建獨立視窗 API):此為桌面版功能,Vesktop / 官方桌面版皆有;瀏覽器版無獨立視窗,外掛在瀏覽器版停用開關並提示
- Discord 更新導致 store 名稱變更時,調整 `findStore` 名稱字串

## 9. 測試(手動,於 Vesktop)

- 加入語音頻道,開啟浮窗:顯示頻道成員頭像
- 自己或他人說話:對應頭像亮綠圈 + 放大;停止說話恢復
- 切換設定 showMode(all/speakingOnly)、layout(grid/list):即時反映
- 自我靜音/拒聽:對應圖示出現
- autoOpen:加入語音自動開、離開自動關
- alwaysOnTop:切到其他視窗時浮窗仍在最上層
- 關閉 Discord 主畫面(最小化):浮窗仍浮動且持續更新
- 重啟 Vesktop:記憶上次開關狀態

## 10. 建置順序(給實作計畫)

1. 外掛骨架 + settings + toolbox 開關(能開一個空白 popout)
2. PopoutView:訂閱語音頻道成員,渲染頭像(尚無說話效果)
3. 說話效果(SpeakingStore)+ mute/deaf 圖示
4. showMode / layout 設定生效 + autoOpen + 狀態記憶
5. 樣式打磨與手動驗收
