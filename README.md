# Discord 自製客戶端

Vesktop + 自建 Vencord。自訂外掛原始碼在 `plugins\`(以 junction 連結至 `Vencord\src\userplugins`,建置時一併編入)。

## 目錄結構

```
plugins\                  junction -> Vencord\src\userplugins(git 經此追蹤外掛)
Vencord\                  Vencord 原始碼 clone(git 忽略)
Vencord\src\userplugins   自訂外掛真實檔案(esbuild alias 需在 src 樹內)
docs\superpowers\         設計規格與實作計畫
```

## 建置

```
cd Vencord
pnpm install
pnpm build          # 或 pnpm watch 持續建置
```

需求:Node >= 22、pnpm 11.9.0。

## Vesktop 掛載自建 build

1. 安裝 Vesktop:https://github.com/Vencord/Vesktop/releases (Windows installer)
2. 開啟 Vesktop -> Settings -> Vesktop 分頁 -> Developer Options
   -> Vencord Location 填入 `D:\Codes\Projects\Discord\Vencord\dist`
3. 完全重啟 Vesktop
4. 驗證:Discord 設定內 Vencord 分頁版本號為 1.14.16 dev,Plugins 清單可搜尋到自訂外掛

## 開發迭代

`pnpm watch` 常駐 + Vesktop 內 Ctrl+R 重載即可看到變更。

## 外掛一覽

| 外掛 | 功能 | DataStore 鍵 |
|------|------|--------------|
| FavoriteChannels | 右鍵頻道加入最愛,置頂顯示於該伺服器頻道列表 | `FavoriteChannels_data` |
| ChannelTabs | 瀏覽器式頻道分頁(標題列),重啟還原 | `ChannelTabs_data` |
| MessageBoard | 訊息動態磚:未靜音頻道訊息牆,快速回覆/跳轉/右鍵靜音 | `MessageBoard_meta`、`MessageBoard_index`、`MessageBoard_msgs_<channelId>` |

## 已知注意事項

- MessageBoard 與內建 VencordToolbox 外掛 patch 同一個標題列位置,兩者同時啟用時後套用者會失效(僅警告,不影響其他功能)。擇一啟用即可。
- FavoriteChannels 的置頂區注入 patch 尚待 runtime 錨點探勘(需登入後用 Patch Helper 定位頻道列表模組),完成前右鍵加入最愛與資料持久化已可用,但列表頂端不會顯示最愛區。
- ChannelTabs 的標題列 leading 區 match 與 MessageBoard 的靜音 API 參數形狀,首次登入後需依實際 bundle 驗證。

## Discord 更新導致 patch 失效時

1. Console 搜尋 "Patch by" 警告確認哪個 patch 失效
2. 開啟 Vencord 設定內的 Patch Helper,重新測試 find/match/replace
3. 或在 DevTools 用 `Vencord.Webpack.search("<字串>")` 與 `Vencord.Webpack.findModuleFactory("<字串>").toString()` 重新定位錨點
4. 更新外掛內對應的 patch 字串後 `pnpm build` 並重啟

若 junction 不存在(例如重新 clone 後),重建:

```
cmd /c mklink /J "D:\Codes\Projects\Discord\plugins" "D:\Codes\Projects\Discord\Vencord\src\userplugins"
```

注意方向:真實檔案在 Vencord\src\userplugins,`plugins\` 只是入口。
