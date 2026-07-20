# 自訂 Vencord 一鍵安裝腳本(Windows / Vesktop)
# 用法:在 PowerShell 執行  iwr -useb <raw url>/install.ps1 | iex
#       或下載後執行  powershell -ExecutionPolicy Bypass -File install.ps1

$ErrorActionPreference = "Stop"

# ===== 設定:推上 GitHub 後把這行改成你的 owner/repo =====
$Repo = "REPLACE_ME_GITHUB_REPO"   # 例如 "ontisme/discord-custom-vencord"
# ========================================================

$InstallDir = Join-Path $env:LOCALAPPDATA "CustomVencord\dist"
$StatePath  = Join-Path $env:APPDATA "vesktop\state.json"
$ZipName    = "vencord-custom-dist.zip"

Write-Host "==> 檢查 Vesktop 是否已安裝"
$vesktopExe = Join-Path $env:LOCALAPPDATA "vesktop\vesktop.exe"
if (-not (Test-Path $vesktopExe)) {
    Write-Host "    未偵測到 Vesktop,嘗試以 winget 安裝..."
    winget install --id Vencord.Vesktop --silent --accept-package-agreements --accept-source-agreements
} else {
    Write-Host "    已安裝: $vesktopExe"
}

Write-Host "==> 下載最新自訂 Vencord build"
$downloadUrl = "https://github.com/$Repo/releases/latest/download/$ZipName"
$tmpZip = Join-Path $env:TEMP $ZipName
Invoke-WebRequest -Uri $downloadUrl -OutFile $tmpZip -UseBasicParsing

Write-Host "==> 解壓到 $InstallDir"
if (Test-Path $InstallDir) { Remove-Item -Recurse -Force $InstallDir }
New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
Expand-Archive -Path $tmpZip -DestinationPath $InstallDir -Force
Remove-Item $tmpZip

Write-Host "==> 設定 Vesktop 指向自訂 build"
$stateDir = Split-Path $StatePath
if (-not (Test-Path $stateDir)) { New-Item -ItemType Directory -Force -Path $stateDir | Out-Null }

if (Test-Path $StatePath) {
    $state = Get-Content $StatePath -Raw | ConvertFrom-Json
} else {
    $state = [PSCustomObject]@{}
}
# 用固定安裝路徑(含反斜線,符合 Vesktop 期望格式)
$state | Add-Member -NotePropertyName "vencordDir" -NotePropertyValue $InstallDir -Force
$state | ConvertTo-Json -Depth 10 | Set-Content $StatePath -Encoding UTF8

Write-Host ""
Write-Host "==> 安裝完成!"
Write-Host "    自訂 Vencord 已安裝至: $InstallDir"
Write-Host "    請「完全關閉並重新開啟」Vesktop 讓變更生效。"
Write-Host "    到 Vesktop 設定 -> Plugins 啟用 FavoriteChannels / FavoriteServers / ChannelTabs / MessageBoard。"
