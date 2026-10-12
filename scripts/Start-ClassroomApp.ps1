# Ordinary developer launcher; Codex Luna verification still requires its R-only runner.
[CmdletBinding()]
param([ValidateRange(1024,65535)][int]$Port = 3000, [switch]$InstallDependencies)
$ErrorActionPreference = 'Stop'
$taskRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
$npmCommand = Get-Command npm.cmd -ErrorAction SilentlyContinue
if (!$nodeCommand -or !$npmCommand) { throw 'Install Node.js 24 LTS and reopen PowerShell so node.exe and npm.cmd are on PATH.' }
$nodeVersion = & $nodeCommand.Source -p 'process.versions.node'
if ($LASTEXITCODE -ne 0) { throw 'Node could not start.' }
$parts = $nodeVersion.Split('.')
if (!(($parts[0] -eq '22' -and [int]$parts[1] -ge 12) -or [int]$parts[0] -ge 24)) { throw 'Use Node 22.12+ or Node 24+.' }
if (!(Test-Path -LiteralPath (Join-Path $taskRoot '.env.local'))) { throw 'Create .env.local from .env.example and configure Supabase before starting the authenticated app.' }
$previousRunner = [Environment]::GetEnvironmentVariable('VALIDATION_RUNNER','Process')
$previousAppUrl = [Environment]::GetEnvironmentVariable('NEXT_PUBLIC_APP_URL','Process')
Push-Location -LiteralPath $taskRoot
try {
  if ($InstallDependencies) {
    & $npmCommand.Source ci --include=dev --no-fund --prefer-offline
    if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed. Review the npm error above.' }
  }
  if (!(Test-Path -LiteralPath (Join-Path $taskRoot 'node_modules/next/package.json'))) { throw 'Run this script with -InstallDependencies first.' }
  $env:VALIDATION_RUNNER = 'local'
  $env:NEXT_PUBLIC_APP_URL = 'http://localhost:' + $Port
  Write-Host ('Validore: http://localhost:' + $Port)
  Write-Host 'Keep this terminal open. Press Ctrl+C to stop. Local jobs run within the app process.'
  & $npmCommand.Source run dev -- --hostname 127.0.0.1 --port $Port
  if ($LASTEXITCODE -ne 0) { throw 'The local app stopped with an error. Review the output above.' }
} finally {
  [Environment]::SetEnvironmentVariable('VALIDATION_RUNNER',$previousRunner,'Process')
  [Environment]::SetEnvironmentVariable('NEXT_PUBLIC_APP_URL',$previousAppUrl,'Process')
  Pop-Location
}
