$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$manifestPath = Join-Path $projectRoot "manifest.json"
$manifest = Get-Content -Raw $manifestPath | ConvertFrom-Json
$releaseDirectory = Join-Path $projectRoot "release"
$archivePath = Join-Path $releaseDirectory ("FluxFrame-{0}.zip" -f $manifest.version)

New-Item -ItemType Directory -Force -Path $releaseDirectory | Out-Null
if (Test-Path -LiteralPath $archivePath) {
  throw "Release archive already exists: $archivePath. Remove or rename it before rebuilding."
}

$packageItems = @(
  (Join-Path $projectRoot "manifest.json"),
  (Join-Path $projectRoot "_locales"),
  (Join-Path $projectRoot "icons"),
  (Join-Path $projectRoot "src")
)
Compress-Archive -Path $packageItems -DestinationPath $archivePath -CompressionLevel Optimal
Write-Output "Created $archivePath"
