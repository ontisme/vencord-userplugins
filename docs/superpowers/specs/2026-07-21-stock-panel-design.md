# stockPanel(股票查詢頁)設計文件

日期:2026-07-21
狀態:自動模式下依 /goal 指令直接定案

## 1. 目標與範圍

在 Discord(Vesktop + 自建 Vencord)新增股票查詢頁:

- 入口:私訊側欄「好友」按鈕正下方新增「股票」連結按鈕(與好友/Nitro/商店同款原生樣式)
- 頁面:點擊後在主內容區(page 區域)開啟全版股票查詢頁
- 內容:TradingView Advanced Chart widget,內建 symbol search 涵蓋全球所有市場(各國股票、指數、外匯、加密貨幣、期貨),介面 zh_TW
- 不自建行情資料、不接任何付費 API;資料完全由 TradingView widget 提供

## 2. 技術可行性(2026-07-21 實測確認)

1. Vesktop 1.6.5 main process `require()` 使用者自建 Vencord dist 的 `vencordDesktopMain.js`;build 腳本會自動把 `src/userplugins/*/native.ts` 打進該檔,插件因此可在 main process 註冊 IPC 與操作 Electron API。native 變更需完整重啟 Vesktop(僅 Ctrl+R 無效)。
2. TradingView embed widget(`www.tradingview-widget.com`)可 iframe(無 frame-ancestors 限制、Discord CSP 可經 `CspPolicies` 白名單放行),但 **台股 TWSE 無 embed 授權**:圖表資料回「此商品僅在 TradingView 上可用」,實測確認不可用。「所有股市都要」因此不能走 embed widget。
3. 完整版 TradingView(`www.tradingview.com` / `tw.tradingview.com`)送 `frame-ancestors 'none'`,不可 iframe。
4. 結論:由插件 native 以 Electron `WebContentsView` 將完整版 TradingView 疊在主視窗的頁面區域上。完整站支援所有市場(含台股),免登入可用延遲行情,登入(session 持久)可用完整功能。不需動 CSP。

## 3. 架構與元件

```
plugins/stockPanel/
  index.tsx      definePlugin:patch、renderLink
  StockPage.tsx  全版頁面(portal 到 page 容器)+ 回報 WebContentsView 座標
  native.ts      main process:WebContentsView 建立/定位/回收
  styles.css     頁面版面與載入提示
```

## 4. 入口按鈕(好友下方)

- Patch 模組:私訊側欄組裝模組(現行 id 143586),`find: '"section-divider-top"'`(全域唯一)
- 插入點:children 陣列中好友項 `…},"friends"),` 之後(該字串全域唯一),`match: /(?<=\},"friends"\),)/`,`replace: "$self.renderLink(),"`
- 按鈕重用原生 LinkButton 元件(模組 715069 export z9):`findComponentByCode("nitroHoverGradient:", "iconClassName:")`
  - props:`route`(帶 `/channels/@me`,點擊時同時開啟頁面)、`selected`(頁面開啟時高亮)、`icon`(自訂 svg 元件,接 `{size, className, color}`,以 currentColor 繪製)、`text: "股票"`、`onClick`
- 列表容器對非特殊 key 的 children 給 40px 列高,與原生連結一致,無需額外處理

## 5. 頁面(StockPage)

- 開啟:`ReactDOM.createPortal` 到 `[class*="page_"]` 容器,`position: absolute; inset: 0` 全版覆蓋主內容區;側欄與伺服器列保持可見可點
- 無頂欄:整個區域即 host,顯示「TradingView 載入中」置中提示直到 WebContentsView 覆蓋;關閉改由 ESC / 切頻道 / 點側欄連結 / 再點一次「股票」入口
- host 區域掛載後量測 `getBoundingClientRect`,IPC 呼叫 native `openChart(bounds, url)`;`ResizeObserver` 與 window resize 時 `setChartBounds` 同步座標;卸載時 `closeChart`
- URL:`https://tw.tradingview.com/chart/?symbol=TWSE%3A2330`(zh_TW 介面,預設台積電);完整站自行記憶主題與最後檢視的 symbol
- 換股票:完整站內建 symbol search,涵蓋所有市場
- 關閉行為(任一觸發即關):X 按鈕、ESC、Flux `CHANNEL_SELECT`(點任何頻道/私訊)、document 層 click 監聽點擊頁面外的路由連結(好友/Nitro/商店等)
- 已知限制:WebContentsView 為原生層,座標假設 zoom 100%;Discord 彈窗/工具提示若落在圖表區域內會被蓋住

## 6. native.ts(main process)

- `openChart(bounds, url)`:以 `BrowserWindow.fromWebContents(event.sender)` 找主視窗,建立 sandbox 化 `WebContentsView`(背景色 #131722),`contentView.addChildView` 後 `setBounds` + `loadURL`;`setWindowOpenHandler` 一律 `shell.openExternal` 外開
- `setChartBounds(bounds)`:同步座標
- `closeChart()`:`removeChildView` + `webContents.close()` 回收
- 主 renderer `did-start-loading`(Ctrl+R 重載)時自動回收,避免殘留
- 生效條件:重新 build 後完整重啟 Vesktop

## 7. 錯誤處理

- renderLink 外層包 ErrorBoundary;patch 失敗時 Vencord 靜默停用該 patch,不影響側欄本體
- portal 目標 `[class*="page_"]` 不存在時不渲染(返回 null)
- TradingView 載入失敗(離線等)由該站自身錯誤畫面呈現,插件不另處理
- 重複 openChart 先回收舊 view,單例

## 8. 測試

- `pnpm build` 與 TypeScript 檢查通過
- CDP(9222)實機驗證:
  - 側欄好友下方出現「股票」按鈕,樣式與原生一致
  - 點擊開啟全版頁面,WebContentsView 出現且對齊 host 區域(CDP targets 可見 tradingview page target)
  - 台股 TWSE:2330 圖表有資料(embed widget 授權問題已解)
  - symbol search 可查美股/台股/港股/加密貨幣等
  - X、ESC、切頻道、點其他側欄連結皆可關閉且 view 回收
  - 重載後乾淨 session 再驗一次錨點
