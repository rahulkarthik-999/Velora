# Downloads the pinned whisper.cpp source release used by the desktop app,
# verifies its SHA-256, and extracts it to apps/desktop/src-tauri/third_party/whisper.cpp.
# Run once per checkout (and again after changing the pinned version).

$ErrorActionPreference = 'Stop'

$Version = '1.8.3'
$Sha256 = '870ba21409cdf66697dc4db15ebdb13bc67037d76c7cc63756c81471d8f1731a'
$Url = "https://github.com/ggml-org/whisper.cpp/archive/refs/tags/v$Version.tar.gz"

$ThirdParty = Join-Path $PSScriptRoot '..\apps\desktop\src-tauri\third_party'
$Dest = Join-Path $ThirdParty 'whisper.cpp'
$Stamp = Join-Path $Dest '.velora-version'

if ((Test-Path $Stamp) -and ((Get-Content $Stamp -Raw).Trim() -eq $Version)) {
    Write-Host "whisper.cpp $Version already present at $Dest"
    exit 0
}

New-Item -ItemType Directory -Force $ThirdParty | Out-Null
$Archive = Join-Path ([IO.Path]::GetTempPath()) "whisper.cpp-$Version.tar.gz"

Write-Host "Downloading whisper.cpp $Version..."
Invoke-WebRequest -Uri $Url -OutFile $Archive -UseBasicParsing

$Actual = (Get-FileHash -Algorithm SHA256 $Archive).Hash.ToLowerInvariant()
if ($Actual -ne $Sha256) {
    Remove-Item $Archive -Force
    throw "Checksum mismatch for whisper.cpp $Version. Expected $Sha256, got $Actual."
}

$Staging = Join-Path $ThirdParty "whisper.cpp-$Version"
if (Test-Path $Staging) { Remove-Item -Recurse -Force $Staging }
& "$env:SystemRoot\System32\tar.exe" -xzf $Archive -C $ThirdParty
if ($LASTEXITCODE -ne 0) { throw "Could not extract $Archive" }

if (Test-Path $Dest) { Remove-Item -Recurse -Force $Dest }
Move-Item $Staging $Dest
Set-Content -Path $Stamp -Value $Version -NoNewline
Remove-Item $Archive -Force

Write-Host "whisper.cpp $Version ready at $Dest"
