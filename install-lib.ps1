# Helpers for this repo's Explorer menu installer.
function ConvertTo-Ico($pngPath, $icoPath) {
    $pngBytes = [System.IO.File]::ReadAllBytes($pngPath)
    $stream = [System.IO.FileStream]::new($icoPath, [System.IO.FileMode]::Create)
    $writer = [System.IO.BinaryWriter]::new($stream)
    try {
        # The existing icon is a 16x16 PNG. ICO can store the PNG directly.
        $writer.Write([uint16]0); $writer.Write([uint16]1); $writer.Write([uint16]1)
        $writer.Write([byte]16); $writer.Write([byte]16); $writer.Write([byte]0)
        $writer.Write([byte]0); $writer.Write([uint16]1); $writer.Write([uint16]32)
        $writer.Write([uint32]$pngBytes.Length); $writer.Write([uint32]22)
        $writer.Write($pngBytes)
    } finally {
        $writer.Dispose()
        $stream.Dispose()
    }
}

function Set-MikesToolsRoot($rootKey) {
    # Other tools share this parent. Leave existing properties and verbs alone.
    if (-not (Test-Path -LiteralPath $rootKey)) {
        New-Item -Path $rootKey -Force | Out-Null
        Set-ItemProperty -LiteralPath $rootKey -Name "MUIVerb" -Value "Mike's Tools"
        Set-ItemProperty -LiteralPath $rootKey -Name "SubCommands" -Value ""
        # A Windows icon keeps the shared parent independent of this install.
        Set-ItemProperty -LiteralPath $rootKey -Name "Icon" -Value "shell32.dll,316"
    }
}

function Add-MikesVerb($rootKey, $verbName, $label, $icon, $command) {
    $verbKey = "$rootKey\shell\$verbName"
    $cmdKey = "$verbKey\command"
    New-Item -Path $verbKey -Force | Out-Null
    New-Item -Path $cmdKey -Force | Out-Null
    Set-ItemProperty -LiteralPath $verbKey -Name "MUIVerb" -Value $label
    Set-ItemProperty -LiteralPath $verbKey -Name "Icon" -Value $icon
    Set-ItemProperty -LiteralPath $cmdKey -Name "(Default)" -Value $command
}
