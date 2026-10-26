# Download a verified, prebuilt Tether backend. No administrator access required.
$ErrorActionPreference = 'Stop'
$TetherChatOrigin = if ($env:TETHER_CHAT_ORIGIN) { $env:TETHER_CHAT_ORIGIN.TrimEnd('/') } else { 'https://www.basanta.cc' }
if (-not $TetherChatOrigin.StartsWith('https://')) { throw 'The download origin must use HTTPS.' }
if ($env:PROCESSOR_ARCHITECTURE -ne 'AMD64' -and $env:PROCESSOR_ARCHITEW6432 -ne 'AMD64') { throw 'This package currently supports x86-64 Windows.' }
$TetherBackendVersion = (Invoke-RestMethod "$TetherChatOrigin/chat/backend-version.txt").Trim()
if ($TetherBackendVersion -notmatch '^\d+\.\d+\.\d+$') { throw 'The backend version could not be verified.' }
$TetherArtifact = "neonet-backend-windows-x86_64-v$TetherBackendVersion.exe"
$TetherChecksums = [string](Invoke-RestMethod "$TetherChatOrigin/chat/backend-sha256.txt")
$TetherExpectedHash = $null
foreach ($TetherLine in ($TetherChecksums -split '\r?\n')) {
    if ($TetherLine -match '^([a-fA-F0-9]{64})\s+(.+)$' -and $Matches[2] -eq $TetherArtifact) { $TetherExpectedHash = $Matches[1].ToLowerInvariant(); break }
}
if (-not $TetherExpectedHash) { throw 'This platform package is not available yet.' }
$TetherInstallDirectory = Join-Path $env:LOCALAPPDATA "Tether\backend\$TetherBackendVersion"
New-Item -ItemType Directory -Path $TetherInstallDirectory -Force | Out-Null
$TetherBinary = Join-Path $TetherInstallDirectory 'neonet.exe'
$TetherNeedsDownload = -not (Test-Path -LiteralPath $TetherBinary)
if (-not $TetherNeedsDownload) { $TetherNeedsDownload = (Get-FileHash -LiteralPath $TetherBinary -Algorithm SHA256).Hash.ToLowerInvariant() -ne $TetherExpectedHash }
if ($TetherNeedsDownload) {
    $TetherTemporary = Join-Path $TetherInstallDirectory ([Guid]::NewGuid().ToString() + '.download')
    try {
        Write-Host "Downloading Tether $TetherBackendVersion for Windows..."
        Invoke-WebRequest "$TetherChatOrigin/tether/downloads/backend/$TetherArtifact" -OutFile $TetherTemporary -UseBasicParsing
        if ((Get-FileHash -LiteralPath $TetherTemporary -Algorithm SHA256).Hash.ToLowerInvariant() -ne $TetherExpectedHash) { throw 'Download verification failed. Nothing was installed.' }
        Move-Item -LiteralPath $TetherTemporary -Destination $TetherBinary -Force
    } finally { if (Test-Path -LiteralPath $TetherTemporary) { Remove-Item -LiteralPath $TetherTemporary -Force } }
}
Write-Host 'Starting chat. Keep this terminal open; Ctrl-C disconnects and locks this session.'
& $TetherBinary web-chat
