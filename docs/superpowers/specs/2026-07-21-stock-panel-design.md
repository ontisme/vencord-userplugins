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

1. CSP:Vesktop 1.6.5 main process 不處理 CSP,而是 `require()` 使用者自建 Vencord dist 的 `vencordDesktopMain.js`,其中 `initCsp` 以 `CspPolicies` 白名單改寫 Discord 的 CSP header。Vencord 官方設計允許 plugin 在 `native.ts` 直接向 `CspPolicies` 加網域與任意 directive。
2. Discord CSP 本身已有明確 `frame-src` 白名單,append `www.tradingview-widget.com` 不影響其他來源。
3. build 腳本會自動把 `src/userplugins/*/native.ts` 打進 `vencordDesktopMain.js`;CSP 變更需完整重啟 Vesktop(僅 Ctrl+R 無效)。
4. TradingView widget 頁面(`https://www.tradingview-widget.com/embed-widget/advanced-chart/`)HTTP 200,無 X-Frame-Options / frame-ancestors 限制,可直接 iframe 嵌入,無需載入外部 script(自行組 iframe URL,widget 設定以 URL hash 帶入),因此不動 script-src。

## 3. 架構與元件

```
plugins/stockPanel/
  index.tsx      definePlugin:patch、renderLink、開閉狀態
  StockPage.tsx  全版頁面(portal 到 page 容器)+ TradingView iframe
  native.ts      CspPolicies 加 frame-src 白名單
  styles.css     頁面與 iframe 版面
```

## 4. 入口按鈕(好友下方)

- Patch 模組:私訊側欄組裝模組(現行 id 143586),`find: '"section-divider-top"'`(全域唯一)
- 插入點:children 陣列中好友項 `…},"friends"),` 之後(該字串全域唯一),`match: /(?<=\},"friends"\),)/`,`replace: "$self.renderLink(),"`
- 按鈕重用原生 LinkButton 元件(模組 715069 export z9):`findComponentByCode("nitroHoverGradient:", "iconClassName:")`
  - props:`route`(帶 `/channels/@me`,點擊時同時開啟頁面)、`selected`(頁面開啟時高亮)、`icon`(自訂 svg 元件,接 `{size, className, color}`,以 currentColor 繪製)、`text: "股票"`、`onClick`
- 列表容器對非特殊 key 的 children 給 40px 列高,與原生連結一致,無需額外處理

## 5. 頁面(StockPage)

- 開啟:`ReactDOM.createPortal` 到 `[class*="page_"]` 容器,`position: absolute; inset: 0` 全版覆蓋主內容區;側欄與伺服器列保持可見可點
- 頂欄:標題「股票查詢」+ 關閉(X)按鈕;其餘空間全部給 TradingView iframe
- iframe URL:`https://www.tradingview-widget.com/embed-widget/advanced-chart/?locale=zh_TW#<encodeURIComponent(JSON config)>`
  - config:`autosize、symbol 預設 TWSE:2330、interval D、timezone Asia/Taipei、locale zh_TW、allow_symbol_change、withdateranges、details、hide_side_toolbar:false`
  - theme 依 Discord 主題(ThemeStore,dark 系 → dark,light → light);主題切換時重建 iframe
- 換股票:使用 widget 內建 symbol search(涵蓋所有市場),不另做搜尋列
- 關閉行為(任一觸發即關):X 按鈕、ESC、Flux `CHANNEL_SELECT`(點任何頻道/私訊)、document 層 click 監聽點擊頁面外的路由連結(好友/Nitro/商店等)

## 6. CSP(native.ts)

```ts
import { CspPolicies } from "@main/csp";
CspPolicies["www.tradingview-widget.com"] = ["frame-src"];
```

- 生效條件:重新 build 後完整重啟 Vesktop

## 7. 錯誤處理

- renderLink 外層包 ErrorBoundary;patch 失敗時 Vencord 靜默停用該 patch,不影響側欄本體
- portal 目標 `[class*="page_"]` 不存在時不渲染(返回 null)
- iframe 載入失敗(離線等)顯示 TradingView 自身的錯誤畫面,插件不另處理

## 8. 測試

- `pnpm build` 與 TypeScript 檢查通過
- CDP(9222)實機驗證:
  - 側欄好友下方出現「股票」按鈕,樣式與原生一致
  - 點擊開啟全版頁面,TradingView 圖表載入(CSP 生效,需先重啟 Vesktop)
  - symbol search 可查美股/台股/港股/加密貨幣等
  - X、ESC、切頻道、點其他側欄連結皆可關閉
  - 重載後乾淨 session 再驗一次錨點
