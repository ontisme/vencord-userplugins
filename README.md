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
| FavoriteChannels | 右鍵頻道加入最愛,置頂顯示於該伺服器頻道列表頂端 | `FavoriteChannels_data` |
| FavoriteServers | 視窗最左獨立的最愛伺服器列,支援拖曳排序與資料夾分組;右鍵伺服器加入/移除 | `FavoriteServers_data` |
| ChannelTabs | 伺服器分頁列(標題列下方整列,icon + 名稱),點擊回到該伺服器最後停留頻道;分頁過多時擠壓+橫向捲動;可拖曳/右鍵關閉;重啟還原 | `ChannelTabs_guildTabs` |
| MessageBoard | 好友頁「動態磚」分頁:未靜音頻道訊息牆,卡片虛擬化(不可見不渲染);新訊息淡入+重排動畫;快速回覆/跳轉/右鍵靜音 | `MessageBoard_meta`、`MessageBoard_index`、`MessageBoard_msgs_<channelId>` |

三個外掛皆已在 Vesktop 實機驗證通過(2026-07-20)。

## 已知注意事項

- 本專案使用 Discord 新版 CSS 變數(如 `--background-base-low`、`--background-surface-higher`、`--text-default`、`--background-mod-subtle`)。舊版變數(`--background-secondary`、`--interactive-normal`、`--header-primary` 等)在現行 Discord 已失效解析為空,請勿使用。
- patch 錨點:ChannelTabs 注入 app base 佈局(`find: /"data-fullscreen":\i,children:\[!\i&&/`)、MessageBoard 注入好友頁(`find: '"pendingFriends"'`)、FavoriteChannels 注入頻道列表(`find: '"guild-channels")'`)。Discord 更新導致失效時依下節重新探勘。

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

注意:git checkout / merge 切換分支時可能把 `plugins\` junction 換成真實目錄。
若發生,把檔案移回 `Vencord\src\userplugins` 後依上述指令重建 junction。
