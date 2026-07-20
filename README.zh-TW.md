# vencord-userplugins

[English](README.md) | **繁體中文**

一套 [Vencord](https://github.com/Vendicated/Vencord) userplugins 插件集,以預打包的 Vencord build 形式發佈,供 [Vesktop](https://github.com/Vencord/Vesktop) 掛載使用。

所有插件皆針對鎖定版 Vencord 開發與測試(見[建置](#建置)),每次 push 到 `main` 由 GitHub Actions 自動產出可安裝的 build。

## 插件一覽

| 插件 | 說明 |
|------|------|
| FavoriteChannels | 右鍵頻道加入最愛,置頂顯示於該伺服器頻道列表頂端。 |
| FavoriteServers | 視窗最左側獨立的最愛伺服器列,支援拖曳排序與資料夾分組。 |
| ChannelTabs | 標題列下方的伺服器分頁列(icon + 名稱),點擊回到該伺服器最後停留的頻道;分頁過多時自動壓縮並可橫向捲動,重啟後還原。 |
| MessageBoard | 好友頁的「動態磚」分頁:未靜音頻道的訊息牆,卡片虛擬化渲染,支援快速回覆、跳轉訊息,以及逐頻道/逐伺服器的靜音與隱藏管理。 |
| VoiceSpeakerPopout | 畫面內可拖曳、可調整大小的語音浮層:顯示語音頻道成員與即時說話狀態、靜音/拒聽圖示、自身麥克風與拒聽開關,右鍵開啟原生成員選單(含使用者音量滑桿)。 |

## 安裝

在 PowerShell 執行:

```powershell
iwr -useb https://raw.githubusercontent.com/ontisme/vencord-userplugins/main/install.ps1 | iex
```

腳本會自動安裝 Vesktop(若未安裝)、下載最新 Release build、解壓到 `%LOCALAPPDATA%\CustomVencord\dist`、設定 Vesktop 指向它,並自動啟用所有插件(若 Vesktop 執行中會先關閉)。完成後直接開啟 Vesktop 即可使用。

手動安裝:到最新 Release 下載 `vencord-custom-dist.zip`,解壓後把 Vesktop 設定 -> Vesktop 分頁 -> Developer Options -> Vencord Location 指向解壓資料夾。

## 建置

需求:Node >= 22、pnpm 11.9.0、git。

一次性乾淨建置(等同 CI):

```powershell
# Windows
powershell -ExecutionPolicy Bypass -File scripts\build-dist.ps1
```

```bash
# 其他平台
bash scripts/build-dist.sh
```

流程為:clone 鎖定版 Vencord -> 套入插件 -> 產出可直接給 Vesktop 掛載的 `dist/`。Vencord 版本鎖定於 `scripts/build-dist.sh` 的 `VENCORD_COMMIT`(目前 `0a5dfaa`,v1.14.16),升級時需重測所有 patch。

## 開發

開發迭代用 junction 把 `plugins\` 接進本機 Vencord clone,配合 watcher 即時重建:

```
git clone https://github.com/ontisme/vencord-userplugins
cd vencord-userplugins
git clone https://github.com/Vendicated/Vencord
cmd /c mklink /J "Vencord\src\userplugins" "%CD%\plugins"
cd Vencord && pnpm install && pnpm watch
```

Vesktop 的 Vencord Location 指向 `Vencord\dist`,改完在 Discord 內按 Ctrl+R 重載。

junction 注意事項:esbuild path alias(`@webpack` 等)只在 Vencord 原始碼樹內生效,因此 junction 方向必須是 `Vencord\src\userplugins` 指向 `plugins\`(真實檔案在 `plugins\`)。`git checkout` / `git merge` 偶爾會把 junction 換成真實目錄;發生時把檔案移回後重建 junction 即可。

## Discord 更新導致 patch 失效時

Discord 更新頻繁,webpack 模組錨點可能漂移。插件失效時:

1. 在 Console 搜尋 `Patch by` 警告確認哪個 patch 失效,或搜尋 `Didn't find module` 確認哪個 webpack find 失配。
2. 用 Vencord 內建 Patch Helper(設定 -> Patch Helper)重新測試 find/match/replace。
3. 或在 DevTools 用 `Vencord.Webpack.search("<字串>")` 與 `Vencord.Webpack.findModuleFactory("<字串>").toString()` 重新定位錨點。
4. 更新插件內的錨點字串,重建並重啟。

各插件已知錨點與慣例記錄於插件原始碼註解中。

## 目錄結構

```
plugins\                  插件原始碼(git 追蹤)
scripts\build-dist.sh     乾淨建置:clone 鎖定版 Vencord、套入插件、產出 dist/(CI 與本機共用)
scripts\build-dist.ps1    build-dist.sh 的 PowerShell 等價版
install.ps1               使用者一鍵安裝腳本
.github\workflows\        CI:每次 push 到 main 自動建置並更新最新 Release
docs\                     設計規格與實作筆記
Vencord\                  本機開發用 Vencord clone(git 忽略)
```

## 注意事項

- 插件使用 Discord 現行 CSS 變數(`--background-base-low`、`--background-surface-higher`、`--text-default`、`--background-mod-subtle` 等)。舊版變數(`--background-secondary`、`--interactive-normal`、`--header-primary` 等)在現行 Discord 已解析為空,請勿使用。
- 所有插件在 merge 至 `main` 前,皆於 Vesktop 實機搭配鎖定版 Vencord 驗證通過。

## 授權

GPL-3.0-or-later,與 Vencord 一致。
