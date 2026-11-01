<#
.SYNOPSIS
  Lists, or stops, the local vite dev servers (ports 5173-5180).

.DESCRIPTION
  `npm run dev` on Windows is a chain: npm (node) -> cmd.exe -> vite (node).
  Stopping only the npm process leaves vite running and holding its port, so
  dev servers piled up across chats. This script finds the process LISTENING
  on each port, walks up to the top of its npm/cmd/node chain, and stops that
  whole tree with `taskkill /T /F`.

  With no switches it only LISTS. Stopping needs -Stop <port(s)> or -StopAll.

.EXAMPLE
  .\scripts\dev-servers.ps1               # list what is running
  .\scripts\dev-servers.ps1 -Stop 5174    # stop the server on port 5174
  .\scripts\dev-servers.ps1 -StopAll      # stop every dev server
#>
[CmdletBinding()]
param(
  [int[]]$Stop,
  [switch]$StopAll
)

$ports = 5173..5180

function Get-Proc([int]$ProcId) {
  Get-CimInstance Win32_Process -Filter "ProcessId=$ProcId" -ErrorAction SilentlyContinue
}

# Climb from the listening vite process through cmd.exe and the npm / npx
# node process only. Any other node.exe parent may be Claude Code itself,
# and a tree kill there would end the chat.
function Get-ChainTop($proc) {
  $top = $proc
  while ($true) {
    $parent = Get-Proc $top.ParentProcessId
    if (-not $parent) { break }
    $isCmd = $parent.Name -eq "cmd.exe"
    $isNpm = $parent.Name -eq "node.exe" -and $parent.CommandLine -match 'np[mx]-cli\.js'
    if (-not ($isCmd -or $isNpm)) { break }
    $top = $parent
  }
  return $top
}

$servers = @()
$listeners = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
  Where-Object { $ports -contains $_.LocalPort } |
  Sort-Object LocalPort -Unique
foreach ($l in $listeners) {
  $proc = Get-Proc $l.OwningProcess
  if (-not $proc) { continue }
  $top = Get-ChainTop $proc
  $servers += [pscustomobject]@{
    Port    = $l.LocalPort
    Started = $proc.CreationDate.ToString("yyyy-MM-dd HH:mm")
    TopPid  = $top.ProcessId
  }
}

if ($servers.Count -eq 0) {
  Write-Host "No dev servers running on ports $($ports[0])-$($ports[-1])." -ForegroundColor Green
  exit 0
}

$targets = @()
if ($StopAll) { $targets = $servers }
elseif ($Stop) { $targets = @($servers | Where-Object { $Stop -contains $_.Port }) }

if ($targets.Count -eq 0) {
  $servers | Format-Table -AutoSize Port, Started, TopPid | Out-String | Write-Host
  if ($Stop) { Write-Host "Nothing is running on port(s) $($Stop -join ', ')." -ForegroundColor Yellow }
  exit 0
}

foreach ($t in $targets) {
  & taskkill.exe /T /F /PID $t.TopPid | Out-Null
  Write-Host "Stopped the dev server on port $($t.Port) (started $($t.Started))." -ForegroundColor Green
}

$still = @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
  Where-Object { ($targets | ForEach-Object { $_.Port }) -contains $_.LocalPort })
if ($still.Count -gt 0) {
  Write-Host "Still listening: port(s) $(($still | ForEach-Object { $_.LocalPort }) -join ', ')." -ForegroundColor Red
  exit 1
}
exit 0
