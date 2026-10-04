$ErrorActionPreference = 'Stop'
$workspaceRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Push-Location $workspaceRoot
try {
  node scripts/check-release.mjs
  if ($LASTEXITCODE -ne 0) { throw 'Release checks failed; no archive created.' }
  $version = (Get-Content package.json -Raw | ConvertFrom-Json).version
  if ($version -notmatch '^\d+\.\d+\.\d+$') { throw 'Invalid release version' }
  $releaseDirectory = Join-Path $workspaceRoot 'release'
  New-Item -ItemType Directory -Path $releaseDirectory -Force | Out-Null
  $archivePath = Join-Path $releaseDirectory "easyApply-$version-store.zip"
  Compress-Archive -Path (Join-Path $workspaceRoot 'dist\*') -DestinationPath $archivePath -Force
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $archive = [IO.Compression.ZipFile]::OpenRead($archivePath)
  try {
    $names = @($archive.Entries | ForEach-Object { $_.FullName.Replace('\', '/') })
    if ($names -notcontains 'manifest.json' -or $names -notcontains 'privacy.html') { throw 'Invalid ZIP layout' }
  } finally { $archive.Dispose() }
  $hasher = [System.Security.Cryptography.SHA256]::Create()
  $archiveStream = [System.IO.File]::OpenRead($archivePath)
  try { $hash = [System.BitConverter]::ToString($hasher.ComputeHash($archiveStream)).Replace('-', '') }
  finally { $archiveStream.Dispose(); $hasher.Dispose() }
  "$hash  easyApply-$version-store.zip" | Set-Content -LiteralPath "$archivePath.sha256.txt"
  Write-Output "Created $archivePath"
  Write-Output "SHA-256: $hash"
} finally { Pop-Location }
