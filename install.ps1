# 自訂 Vencord 一鍵安裝腳本(Windows / Vesktop)
# 用法:在 PowerShell 執行  iwr -useb <raw url>/install.ps1 | iex
#       或下載後執行  powershell -ExecutionPolicy Bypass -File install.ps1

$ErrorActionPreference = "Stop"

$Repo = "ontisme/vencord-userplugins"

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

Write-Host "==> 自動啟用插件"
# Vesktop 執行中會在退出時覆寫 settings.json,寫入前先關閉
$vesktopProc = Get-Process vesktop -ErrorAction SilentlyContinue
if ($vesktopProc) {
    Write-Host "    偵測到 Vesktop 執行中,先關閉以套用設定..."
    $vesktopProc | Stop-Process -Force
    Start-Sleep -Seconds 2
}

$Plugins = @("FavoriteChannels", "FavoriteServers", "ChannelTabs", "MessageBoard", "VoiceSpeakerPopout")
$SettingsPath = Join-Path $env:APPDATA "vesktop\settings\settings.json"
try {
    if (Test-Path $SettingsPath) {
        $settings = Get-Content $SettingsPath -Raw | ConvertFrom-Json
    } else {
        New-Item -ItemType Directory -Force -Path (Split-Path $SettingsPath) | Out-Null
        $settings = [PSCustomObject]@{}
    }
    if (-not $settings.PSObject.Properties["plugins"]) {
        $settings | Add-Member -NotePropertyName "plugins" -NotePropertyValue ([PSCustomObject]@{})
    }
    foreach ($name in $Plugins) {
        $entry = $settings.plugins.PSObject.Properties[$name]
        if ($entry) {
            # 保留既有插件設定,只改 enabled
            $entry.Value | Add-Member -NotePropertyName "enabled" -NotePropertyValue $true -Force
        } else {
            $settings.plugins | Add-Member -NotePropertyName $name -NotePropertyValue ([PSCustomObject]@{ enabled = $true })
        }
    }
    # 不帶 BOM 寫出,避免 JSON.parse 失敗
    [IO.File]::WriteAllText($SettingsPath, ($settings | ConvertTo-Json -Depth 100))
    Write-Host "    已啟用: $($Plugins -join ' / ')"
} catch {
    Write-Warning "    自動啟用失敗($_),請手動到 Vesktop 設定 -> Plugins 啟用。"
}

Write-Host ""
Write-Host "==> 安裝完成!"
Write-Host "    自訂 Vencord 已安裝至: $InstallDir"
Write-Host "    插件已自動啟用,開啟 Vesktop 即可使用。"
