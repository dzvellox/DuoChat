$ErrorActionPreference = "Stop"
$Repo = "dzvellox/DuoChat"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Temp = Join-Path $env:TEMP ("DuoChatUpdate_" + [guid]::NewGuid().ToString("N"))
$Zip = Join-Path $Temp "DuoChat.zip"
$Extract = Join-Path $Temp "extract"
$Backup = Join-Path $Root (".update-backup-" + (Get-Date -Format "yyyyMMdd-HHmmss"))
$Headers = @{"User-Agent"="DuoChat-Updater";"Accept"="application/vnd.github+json";"X-GitHub-Api-Version"="2022-11-28"}

Write-Host "DuoChat GitHub updater" -ForegroundColor Cyan
Write-Host "Current folder: $Root"
New-Item -ItemType Directory -Path $Temp,$Extract -Force | Out-Null
try {
  $Release = Invoke-RestMethod -Uri "https://api.github.com/repos/$Repo/releases/latest" -Headers $Headers
  $Version = ([string]$Release.tag_name).TrimStart('v','V')
  if ($Version -notmatch '^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$') { throw "Invalid DuoChat release tag." }

  $ExpectedAssetName = "DuoChat-$Version.zip"
  $Asset = $Release.assets | Where-Object { $_.name -eq $ExpectedAssetName } | Select-Object -First 1
  if (-not $Asset) { throw "Release does not contain the expected asset: $ExpectedAssetName" }

  $AssetUri = [Uri]$Asset.browser_download_url
  if ($AssetUri.Scheme -ne 'https' -or $AssetUri.Host -ne 'github.com' -or -not $AssetUri.AbsolutePath.StartsWith("/dzvellox/DuoChat/releases/download/", [StringComparison]::Ordinal)) {
    throw "Untrusted GitHub release asset URL."
  }
  if ([string]$Asset.digest -notmatch '^sha256:([0-9a-fA-F]{64})$') { throw "GitHub release asset is missing a valid SHA-256 digest." }
  $ExpectedSha256 = $Matches[1].ToLowerInvariant()

  Write-Host "Latest release: $($Release.tag_name)"
  Invoke-WebRequest -Uri $AssetUri.AbsoluteUri -OutFile $Zip -Headers @{"User-Agent"="DuoChat-Updater"}
  $ActualSha256 = (Get-FileHash -LiteralPath $Zip -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($ActualSha256 -ne $ExpectedSha256) { throw "SHA-256 verification failed. The downloaded update will not be installed." }
  Write-Host "SHA-256 verified." -ForegroundColor Green

  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $ExtractRoot = [IO.Path]::GetFullPath($Extract + [IO.Path]::DirectorySeparatorChar)
  $Archive = [IO.Compression.ZipFile]::OpenRead($Zip)
  try {
    foreach ($Entry in $Archive.Entries) {
      $Name = [string]$Entry.FullName
      if ([string]::IsNullOrWhiteSpace($Name)) { continue }
      if ($Name.StartsWith('/') -or $Name.StartsWith('\') -or $Name -match '^[A-Za-z]:') { throw "Unsafe absolute path found in update archive." }
      $Destination = [IO.Path]::GetFullPath((Join-Path $Extract $Name))
      if (-not $Destination.StartsWith($ExtractRoot, [StringComparison]::OrdinalIgnoreCase)) { throw "Unsafe path traversal found in update archive." }
    }
  } finally { $Archive.Dispose() }

  Expand-Archive -Path $Zip -DestinationPath $Extract -Force
  $Manifest = Join-Path $Extract "manifest.json"
  if (-not (Test-Path -LiteralPath $Manifest -PathType Leaf)) { throw "Downloaded archive must contain manifest.json at its root." }
  $ManifestJson = Get-Content $Manifest -Raw | ConvertFrom-Json
  if ($ManifestJson.manifest_version -ne 3 -or $ManifestJson.short_name -ne "DuoChat") { throw "The downloaded archive is not a valid DuoChat Manifest V3 package." }
  if ([string]$ManifestJson.version -ne $Version) { throw "Release tag and manifest version do not match." }

  foreach ($Required in @("background.js","core.js","content.js","popup.html","popup.js")) {
    if (-not (Test-Path -LiteralPath (Join-Path $Extract $Required) -PathType Leaf)) { throw "Update package is missing required file: $Required" }
  }

  New-Item -ItemType Directory -Path $Backup -Force | Out-Null
  Get-ChildItem -LiteralPath $Root -Force | Where-Object { $_.Name -notlike '.update-backup-*' } | ForEach-Object { Copy-Item $_.FullName -Destination $Backup -Recurse -Force }
  Get-ChildItem -LiteralPath $Extract -Force | ForEach-Object { Copy-Item $_.FullName -Destination $Root -Recurse -Force }

  Write-Host "Updated source files to version $Version." -ForegroundColor Green
  Write-Host "Backup: $Backup"
  Write-Host "Open chrome://extensions and click Reload on DuoChat." -ForegroundColor Yellow
  Start-Process "chrome.exe" "chrome://extensions" -ErrorAction SilentlyContinue
} finally {
  Remove-Item -LiteralPath $Temp -Recurse -Force -ErrorAction SilentlyContinue
}
