# Portable, loopback-only controller. User runs this launcher; it is not a Luna verification fallback.
[CmdletBinding()]
param([string]$JavaPath, [ValidateRange(1024,65535)][int]$Port = 8080)
$ErrorActionPreference = 'Stop'
$taskRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$classroomRoot = Join-Path $taskRoot '.classroom'
function Assert-PlainPath([string]$Path) {
  $current = [IO.Path]::GetFullPath($Path)
  while ($current) {
    if ((Test-Path -LiteralPath $current) -and ((Get-Item -LiteralPath $current -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Junctions and symbolic links are not accepted for classroom tool paths.' }
    $parent = [IO.Directory]::GetParent($current)
    if (!$parent) { break }
    $current = $parent.FullName
  }
}
Assert-PlainPath $taskRoot
if (!$JavaPath) {
  $command = Get-Command java.exe -ErrorAction SilentlyContinue
  if ($command) { $JavaPath = $command.Source }
  elseif ($env:JAVA_HOME -and (Test-Path -LiteralPath (Join-Path $env:JAVA_HOME 'bin/java.exe'))) { $JavaPath = Join-Path $env:JAVA_HOME 'bin/java.exe' }
  elseif (Test-Path -LiteralPath (Join-Path $classroomRoot 'tools/jdk/bin/java.exe')) { $JavaPath = Join-Path $classroomRoot 'tools/jdk/bin/java.exe' }
}
if (!$JavaPath -or !(Test-Path -LiteralPath $JavaPath -PathType Leaf)) { throw 'Java is missing. Install Java 21 or 25, or extract a JDK ZIP and pass -JavaPath to its bin/java.exe. See docs/CLASSROOM_DEMO.md.' }
$JavaPath = (Resolve-Path -LiteralPath $JavaPath).Path
# Java prints version to stderr; Windows PowerShell 5.1 wraps that as error records.
$previousNativePreference = $ErrorActionPreference
try {
  $ErrorActionPreference = 'Continue'
  $javaVersion = (& $JavaPath -version 2>&1 | Out-String)
  $versionExit = $LASTEXITCODE
} finally { $ErrorActionPreference = $previousNativePreference }
if ($versionExit -ne 0 -or $javaVersion -notmatch 'version\s+"(21|25)(?:[.+-]|")') { throw 'This Jenkins LTS requires Java 21 or Java 25.' }
$tools = Join-Path $classroomRoot 'tools'
$tempPath = Join-Path $classroomRoot 'tmp'
$jenkinsHome = Join-Path $classroomRoot 'jenkins-home'
foreach ($directory in @($tools,$tempPath,$jenkinsHome)) {
  Assert-PlainPath $directory
  New-Item -ItemType Directory -Path $directory -Force | Out-Null
}
$war = Join-Path $tools 'jenkins-2.580.1.war'
$expected = '393bf2476352dd726519fd1f92ce66eac7d23c0936e6967420b717060c4c40d0'
if (!(Test-Path -LiteralPath $war)) {
  $download = $war + '.download'
  Assert-PlainPath $download
  $previousTls = [Net.ServicePointManager]::SecurityProtocol
  try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -UseBasicParsing -Uri 'https://get.jenkins.io/war-stable/2.580.1/jenkins.war' -OutFile $download -TimeoutSec 300
    if ((Get-FileHash -LiteralPath $download -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expected) { throw 'Jenkins download checksum did not match the official release.' }
    Move-Item -LiteralPath $download -Destination $war
  } finally { [Net.ServicePointManager]::SecurityProtocol = $previousTls }
}
Assert-PlainPath $war
if ((Get-FileHash -LiteralPath $war -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expected) { throw 'Stored Jenkins WAR checksum is invalid. Do not run it.' }
$previousJenkinsHome = [Environment]::GetEnvironmentVariable('JENKINS_HOME','Process')
try {
  $env:JENKINS_HOME = $jenkinsHome
  Write-Host ('Jenkins: http://localhost:' + $Port)
  Write-Host ('Unlock password file: ' + (Join-Path $jenkinsHome 'secrets/initialAdminPassword'))
  Write-Host 'Complete the setup wizard, install suggested plugins, and keep this terminal open. Ctrl+C stops Jenkins.'
  & $JavaPath '-Xms256m' '-Xmx1024m' ('-Djava.io.tmpdir=' + $tempPath) '-jar' $war '--httpListenAddress=127.0.0.1' ('--httpPort=' + $Port)
  if ($LASTEXITCODE -ne 0) { throw 'Jenkins stopped with an error. Review its output above.' }
} finally { [Environment]::SetEnvironmentVariable('JENKINS_HOME',$previousJenkinsHome,'Process') }
