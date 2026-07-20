# 建置自訂 Vencord dist(Windows / PowerShell 版,等同 scripts\build-dist.sh)
# clone 鎖定版本的官方 Vencord,套入本 repo 的外掛,產出 dist\。
# 用法:powershell -ExecutionPolicy Bypass -File scripts\build-dist.ps1

$ErrorActionPreference = "Stop"

# 鎖定的 Vencord commit(對應 v1.14.16);升級時同步更新此值並重測 patch。
$VencordCommit = "0a5dfaa1caa0799899b4d14e3862b70c665d8223"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$WorkDir  = Join-Path $RepoRoot ".vencord-build"

Write-Host "==> 準備工作目錄 $WorkDir"
if (Test-Path $WorkDir) { Remove-Item -Recurse -Force $WorkDir }
git clone --filter=blob:none https://github.com/Vendicated/Vencord.git $WorkDir
git -C $WorkDir checkout $VencordCommit

Write-Host "==> 套入自訂外掛"
$UserPlugins = Join-Path $WorkDir "src\userplugins"
if (Test-Path $UserPlugins) { Remove-Item -Recurse -Force $UserPlugins }
New-Item -ItemType Directory -Force -Path $UserPlugins | Out-Null
Copy-Item -Recurse -Force (Join-Path $RepoRoot "plugins\*") $UserPlugins

Write-Host "==> 安裝依賴並建置"
Push-Location $WorkDir
try {
    pnpm install --frozen-lockfile
    pnpm build
} finally {
    Pop-Location
}

Write-Host "==> 複製 dist 到 $RepoRoot\dist"
$DistDir = Join-Path $RepoRoot "dist"
if (Test-Path $DistDir) { Remove-Item -Recurse -Force $DistDir }
Copy-Item -Recurse -Force (Join-Path $WorkDir "dist") $DistDir

# Vesktop 驗證 install 用:需要 package.json 與四個檔案齊全
Copy-Item -Force (Join-Path $WorkDir "package.json") (Join-Path $DistDir "package.json")

Write-Host "==> 完成。dist 內容:"
Get-ChildItem $DistDir | Select-Object -ExpandProperty Name
