# Discord 自製客戶端

Vesktop + 自建 Vencord。自訂外掛原始碼在 `plugins\`(以 junction 連結至 `Vencord\src\userplugins`,建置時一併編入)。

## 目錄結構

```
plugins\                  自訂外掛(git 追蹤)
Vencord\                  Vencord 原始碼 clone(git 忽略)
Vencord\src\userplugins   junction -> plugins\
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

若 junction 不存在(例如重新 clone 後),重建:

```
cmd /c mklink /J "D:\Codes\Projects\Discord\Vencord\src\userplugins" "D:\Codes\Projects\Discord\plugins"
```
