#!/usr/bin/env bash
# 把已 build 好的 Vencord dist 複製到 Vesktop 實際載入的 vencordFiles 目錄。
#
# 背景:此機的 Vesktop vencordDir 設定不生效,Vesktop 一律載入
# %APPDATA%\vesktop\sessionData\vencordFiles\ 下的檔案。因此每次 build 後
# 必須把 dist 的 vencordDesktop* 檔覆蓋過去,插件變更才會生效(再 Ctrl+R 重載)。
set -euo pipefail

DIST="${VENCORD_DIST:-D:/Codes/Projects/Discord/Vencord/dist}"
VF="${APPDATA}/vesktop/sessionData/vencordFiles"

if [ ! -f "${DIST}/vencordDesktopMain.js" ]; then
    echo "找不到 ${DIST}/vencordDesktopMain.js;請先 build。" >&2
    exit 1
fi
if [ ! -d "${VF}" ]; then
    echo "找不到 ${VF};請先啟動過一次 Vesktop 讓它建立此目錄。" >&2
    exit 1
fi

echo "==> 複製 dist 至 ${VF}"
for f in vencordDesktopMain.js vencordDesktopMain.js.map \
         vencordDesktopPreload.js vencordDesktopPreload.js.map \
         vencordDesktopRenderer.js vencordDesktopRenderer.js.map \
         vencordDesktopRenderer.css vencordDesktopRenderer.css.map; do
    cp -f "${DIST}/${f}" "${VF}/${f}"
done

echo "==> 完成。在 Discord 按 Ctrl+R 重載即生效。"
