$ErrorActionPreference = "Stop"
if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) {
    throw "This uninstaller is for Windows. On macOS, remove the video-gen symlink."
}

# Remove only this tool's verbs, never the shared Mike's Tools parent.
foreach ($root in @(
    "HKCU:\Software\Classes\Directory\shell\MikesTools",
    "HKCU:\Software\Classes\Directory\Background\shell\MikesTools"
)) {
    $verb = "$root\shell\VideoGen"
    if (Test-Path -LiteralPath $verb) {
        Remove-Item -LiteralPath $verb -Recurse -Force
    }
}

$icon = Join-Path $env:LOCALAPPDATA "video-gen\icons\video-gen.ico"
if (Test-Path -LiteralPath $icon) {
    Remove-Item -LiteralPath $icon -Force
}
Write-Host "Removed Video Gen's Explorer entries and icon." -ForegroundColor Green
