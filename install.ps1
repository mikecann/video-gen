param([switch]$SkipDeps)

$ErrorActionPreference = "Stop"
if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) {
    throw "This installer is for Windows. On macOS, run bash install.sh."
}

. (Join-Path $PSScriptRoot "install-lib.ps1")
if (-not $SkipDeps) {
    & (Join-Path $PSScriptRoot "deps.ps1")
}

$iconsOut = Join-Path $env:LOCALAPPDATA "video-gen\icons"
New-Item -ItemType Directory -Path $iconsOut -Force | Out-Null
$videoGenIco = Join-Path $iconsOut "video-gen.ico"
ConvertTo-Ico (Join-Path $PSScriptRoot "icons\video-gen.png") $videoGenIco

$launcher = Join-Path $PSScriptRoot "video-gen.vbs"
$dirRoot = "HKCU:\Software\Classes\Directory\shell\MikesTools"
$bgRoot = "HKCU:\Software\Classes\Directory\Background\shell\MikesTools"
Set-MikesToolsRoot $dirRoot
Set-MikesToolsRoot $bgRoot
Add-MikesVerb $dirRoot "VideoGen" "Video Gen" $videoGenIco "wscript.exe `"$launcher`" `"%1`""
Add-MikesVerb $bgRoot "VideoGen" "Video Gen" $videoGenIco "wscript.exe `"$launcher`" `"%V`""

Write-Host "Installed Video Gen under Mike's Tools in Explorer." -ForegroundColor Green
Write-Host "On Windows 11, use Show more options to see the menu."
Write-Host "Re-run this installer if you move the clone."
