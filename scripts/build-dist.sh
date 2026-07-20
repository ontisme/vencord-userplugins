#!/usr/bin/env bash
# 建置自訂 Vencord dist:clone 鎖定版本的官方 Vencord,套入本 repo 的外掛,產出 dist。
# CI 與本機共用。輸出至 repo 根目錄的 dist/。
set -euo pipefail

# 鎖定的 Vencord commit(對應 v1.14.16);升級時同步更新此值並重測 patch。
VENCORD_COMMIT="0a5dfaa1caa0799899b4d14e3862b70c665d8223"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORK_DIR="${REPO_ROOT}/.vencord-build"

echo "==> 準備工作目錄 ${WORK_DIR}"
rm -rf "${WORK_DIR}"
git clone --filter=blob:none https://github.com/Vendicated/Vencord.git "${WORK_DIR}"
git -C "${WORK_DIR}" checkout "${VENCORD_COMMIT}"

echo "==> 套入自訂外掛"
rm -rf "${WORK_DIR}/src/userplugins"
mkdir -p "${WORK_DIR}/src/userplugins"
cp -r "${REPO_ROOT}/plugins/." "${WORK_DIR}/src/userplugins/"

echo "==> 安裝依賴並建置"
pushd "${WORK_DIR}" >/dev/null
pnpm install --frozen-lockfile
pnpm build
popd >/dev/null

echo "==> 複製 dist 到 ${REPO_ROOT}/dist"
rm -rf "${REPO_ROOT}/dist"
cp -r "${WORK_DIR}/dist" "${REPO_ROOT}/dist"

# Vesktop 驗證 install 用:需要 package.json 與四個檔案齊全
cp "${WORK_DIR}/package.json" "${REPO_ROOT}/dist/package.json"

echo "==> 完成。dist 內容:"
ls -1 "${REPO_ROOT}/dist"
