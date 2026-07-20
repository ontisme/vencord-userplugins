# Discord 自製客戶端

Vesktop + 自建 Vencord。四個自訂外掛(FavoriteChannels、FavoriteServers、ChannelTabs、MessageBoard)以 Vencord userplugin 形式打包,發佈到 GitHub Release。

## 一鍵安裝(使用者)

在 PowerShell 執行(先確認 install.ps1 內的 `$Repo` 已填正確的 owner/repo):

```powershell
iwr -useb https://raw.githubusercontent.com/<owner>/<repo>/main/install.ps1 | iex
```

腳本會:自動安裝 Vesktop(若未裝)-> 下載最新 Release 的 dist -> 解壓到 `%LOCALAPPDATA%\CustomVencord\dist` -> 設定 Vesktop 指向它。
完成後**完全重啟 Vesktop**,到設定 -> Plugins 啟用四個外掛即可。

手動安裝:到 Release 下載 `vencord-custom-dist.zip`,解壓後把 Vesktop 設定 -> Vesktop 分頁 -> Developer Options -> Vencord Location 指向解壓資料夾。

## 發佈(維護者)

每次 `git push` 到 main,GitHub Actions(`.github/workflows/build.yml`)會自動建置並更新 `latest` Release 的 dist。無需手動操作。

首次設定:
1. 建立 GitHub repo,`git remote add origin ...` 後 push
2. 把 `install.ps1` 內 `$Repo` 改成你的 `owner/repo`
3. push 後 Actions 自動產出第一個 Release

## 目錄結構

```
plugins\                  自訂外掛原始碼(git 追蹤)
scripts\build-dist.sh     建置腳本:clone 鎖定版 Vencord、套入外掛、產出 dist(CI 與本機共用)
install.ps1               使用者一鍵安裝腳本
.github\workflows\        GitHub Actions 自動建置
Vencord\                  本機開發用的 Vencord clone(git 忽略)
docs\superpowers\         設計規格與實作計畫
```

Vencord 版本鎖定在 `scripts\build-dist.sh` 的 `VENCORD_COMMIT`(目前 0a5dfaa,v1.14.16)。升級時更新此值並重測 patch。

## 建置(維護者)

一次性乾淨建置(等同 CI):

```
bash scripts/build-dist.sh   # 產出 dist/,可直接給 Vesktop 掛載
```

需求:Node >= 22、pnpm 11.9.0、git、bash。

## 本機開發迭代

開發時用 junction 讓 `plugins\` 直接對應 Vencord 的 userplugins,配合 `pnpm watch` 即時重建:

```
cmd /c mklink /J "D:\Codes\Projects\Discord\Vencord\src\userplugins" "D:\Codes\Projects\Discord\plugins"
cd Vencord && pnpm install && pnpm watch
```

Vesktop 設定 -> Developer Options -> Vencord Location 指向 `Vencord\dist`,改完在 Discord 內 Ctrl+R 重載。

注意:junction 真實檔案方向為 `plugins\` -> `Vencord\src\userplugins`(esbuild alias 需在 src 樹內)。git checkout / merge 切分支時可能把 junction 換成真實目錄,發生時把檔案移回後重建 junction。

## 開發迭代

`pnpm watch` 常駐 + Vesktop 內 Ctrl+R 重載即可看到變更。

## 外掛一覽

| 外掛 | 功能 | DataStore 鍵 |
|------|------|--------------|
| FavoriteChannels | 右鍵頻道加入最愛,置頂顯示於該伺服器頻道列表頂端 | `FavoriteChannels_data` |
| FavoriteServers | 視窗最左獨立的最愛伺服器列,支援拖曳排序與資料夾分組;右鍵伺服器加入/移除 | `FavoriteServers_data` |
| ChannelTabs | 伺服器分頁列(標題列下方整列,icon + 名稱),點擊回到該伺服器最後停留頻道;分頁過多時擠壓+橫向捲動;可拖曳/右鍵關閉;重啟還原 | `ChannelTabs_guildTabs` |
| MessageBoard | 好友頁「動態磚」分頁:未靜音頻道訊息牆,卡片虛擬化(不可見不渲染);新訊息淡入+重排動畫;快速回覆/跳轉;右鍵靜音/隱藏頻道/隱藏整個伺服器;管理介面(動態磚右上角按鈕 + Vencord 外掛設定頁)可逐項解除或一鍵清空黑名單 | `MessageBoard_meta`、`MessageBoard_index`、`MessageBoard_msgs_<channelId>` |

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
