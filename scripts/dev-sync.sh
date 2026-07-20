#!/usr/bin/env bash
# 開發用:把 plugins/ 同步進本機 Vencord/src/userplugins/ 並建置。
# 注意:Vencord 的 esbuild path alias(@webpack 等)僅在專案 root 內生效,
# junction 指向外部路徑會導致別名解析失敗,因此必須用複製而非連結。
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENCORD_DIR="${REPO_ROOT}/Vencord"
DEST="${VENCORD_DIR}/src/userplugins"

if [ ! -d "${VENCORD_DIR}" ]; then
    echo "找不到 ${VENCORD_DIR};請先在該處放置官方 Vencord 原始碼。" >&2
    exit 1
fi

echo "==> 同步 plugins/ 至 ${DEST}"
rm -rf "${DEST}"
mkdir -p "${DEST}"
cp -r "${REPO_ROOT}/plugins/." "${DEST}/"

echo "==> 建置 Vencord"
pushd "${VENCORD_DIR}" >/dev/null
pnpm build
popd >/dev/null

echo "==> 完成。"
