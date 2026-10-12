# Copies a bounded source allowlist into a NEW Jenkins build directory. Never copies local credentials.
[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$Source, [Parameter(Mandatory=$true)][string]$Destination)
$ErrorActionPreference = 'Stop'
$sourceRoot = [IO.Path]::GetFullPath($Source).TrimEnd('\')
$targetRoot = [IO.Path]::GetFullPath($Destination).TrimEnd('\')
function Assert-PlainPath([string]$Path) {
  $current = [IO.Path]::GetFullPath($Path)
  while ($current) {
    if ((Test-Path -LiteralPath $current) -and ((Get-Item -LiteralPath $current -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Source snapshots reject junctions and symbolic links.' }
    $parent = [IO.Directory]::GetParent($current)
    if (!$parent) { break }
    $current = $parent.FullName
  }
}
Assert-PlainPath $sourceRoot
Assert-PlainPath $targetRoot
if (!(Test-Path -LiteralPath (Join-Path $sourceRoot 'package.json'))) { throw 'Source must be the Validore project directory.' }
if ($sourceRoot -eq $targetRoot -or $sourceRoot.StartsWith($targetRoot + '\',[StringComparison]::OrdinalIgnoreCase)) { throw 'Source must not be inside the destination.' }
if ($targetRoot.StartsWith($sourceRoot + '\',[StringComparison]::OrdinalIgnoreCase) -and !$targetRoot.StartsWith((Join-Path $sourceRoot '.classroom') + '\',[StringComparison]::OrdinalIgnoreCase)) { throw 'Nested snapshot destinations are only allowed inside the ignored .classroom directory.' }
if (Test-Path -LiteralPath $targetRoot) { throw 'Use a new build directory; existing workspaces are not overwritten or deleted.' }
New-Item -ItemType Directory -Path $targetRoot | Out-Null
$manifest = New-Object 'System.Collections.Generic.List[object]'
function Copy-SourceFile([string]$File,[string]$Target) {
  Assert-PlainPath $File
  $name = [IO.Path]::GetFileName($File)
  if (($name -like '.env*' -and $name -ne '.env.example') -or $name -match '\.(pem|key|p12|pfx)$') { return }
  Copy-Item -LiteralPath $File -Destination $Target
  $relative = $File.Substring($sourceRoot.Length + 1).Replace('\','/')
  $manifest.Add([pscustomobject]@{ path = $relative; sha256 = (Get-FileHash -LiteralPath $Target -Algorithm SHA256).Hash.ToLowerInvariant() })
}
function Copy-SourceDirectory([string]$Directory,[string]$Target) {
  Assert-PlainPath $Directory
  New-Item -ItemType Directory -Path $Target | Out-Null
  foreach ($entry in (Get-ChildItem -LiteralPath $Directory -Force | Sort-Object Name)) {
    if ($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Source snapshots reject junctions and symbolic links.' }
    if ($entry.Name -in @('node_modules','.next','.git','reports','coverage','.classroom','.tmp','.npm-cache','.trivy-cache')) { continue }
    $next = Join-Path $Target $entry.Name
    if ($entry.PSIsContainer) { Copy-SourceDirectory $entry.FullName $next }
    else { Copy-SourceFile $entry.FullName $next }
  }
}
foreach ($name in @('src','public','scripts','tests','drizzle','infra','docs')) {
  $directory = Join-Path $sourceRoot $name
  if (Test-Path -LiteralPath $directory -PathType Container) { Copy-SourceDirectory $directory (Join-Path $targetRoot $name) }
}
foreach ($name in @('package.json','package-lock.json','next.config.ts','next.config.mjs','tsconfig.json','eslint.config.mjs','eslint.config.js','vitest.config.ts','postcss.config.mjs','.env.example','.gitignore','LICENSE','README.md','DESIGN.md','JENKINS_SETUP.md','CICD.md','Jenkinsfile','Jenkinsfile.classroom','Dockerfile','docker-compose.yml','render.yaml')) {
  $file = Join-Path $sourceRoot $name
  if (Test-Path -LiteralPath $file -PathType Leaf) { Copy-SourceFile $file (Join-Path $targetRoot $name) }
}
$document = [pscustomobject]@{ kind = 'local-working-tree'; createdAt = [DateTime]::UtcNow.ToString('o'); files = @($manifest.ToArray()) }
$document | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $targetRoot 'classroom-source-manifest.json') -Encoding UTF8
Write-Host ('Copied ' + $manifest.Count + ' source files. Local environment files and generated artifacts were excluded.')
