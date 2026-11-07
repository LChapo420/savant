# Pull Savant's backup sets from the Onidel server to this PC. These files hold LEARNER DATA: accounts, emails, password hashes, answers, notes, possibly
# children's. They stay in this folder, readable only by this Windows user, and are never put in git or on any other service.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File pull-backups.ps1              pull what is missing, verify it, rotate
#   powershell -NoProfile -ExecutionPolicy Bypass -File pull-backups.ps1 -Install     make the folder, restrict it to this user, copy these scripts in
#   powershell -NoProfile -ExecutionPolicy Bypass -File C:\coding\savant-backups\pull-backups.ps1 -Schedule     run every 6 hours and at sign-in (the owner's step)
#
# Each pull first makes a fresh set on the server, by sending savant-backup.sh (kept beside this script) over ssh as user savant: one run, nothing left running
# or scheduled there. So with this PC off no new sets are made, and the server's own copies stop too. -NoFreshSet only pulls what is there.
# Each file arrives in _incoming, and a set moves to sets\ only when its checksums match the server's manifest, so what is in sets\ is whole.
# Rotation matches the server: every set for 48 hours, then the newest of each UTC day, nothing past 28 days (the privacy policy promises deletion
# of a closed account within 30), and the newest 3 always stay. If the PC was off, the next run catches up and rotation runs then.
# Nothing is written to the log but file names, sizes and the result. On failure the exit code is 1 and the task shows it; see pull-log.txt.
[CmdletBinding()]
param(
  [switch]$Install,
  [switch]$Schedule,
  [switch]$NoFreshSet,
  [string]$Dest = 'C:\coding\savant-backups',
  [string]$RemoteHost = 'root@192.209.63.151',
  [string]$KeyFile = (Join-Path $env:USERPROFILE '.ssh\onidel'),
  [string]$RemoteDir = '/srv/savant-backups/sets',
  [int]$KeepAllHours = 48,
  [int]$MaxAgeDays = 28,
  [int]$KeepNewest = 3,
  [string]$TaskName = 'Savant backup pull'
)
$ErrorActionPreference = 'Stop'
$Ssh = Join-Path $env:WINDIR 'System32\OpenSSH\ssh.exe'
$Scp = Join-Path $env:WINDIR 'System32\OpenSSH\scp.exe'
$SshOpts = @('-i', $KeyFile, '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=20', '-o', 'StrictHostKeyChecking=yes', '-o', 'ServerAliveInterval=30')
$Sets = Join-Path $Dest 'sets'
$Incoming = Join-Path $Dest '_incoming'
$LogFile = Join-Path $Dest 'pull-log.txt'

function Log([string]$Message) {
  $line = "$((Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')) $Message"
  Write-Output $line
  Add-Content -Path $LogFile -Value $line -Encoding utf8
}

function Restrict-Folder {
  # Only this user: inheritance off, every other entry gone. Applied again on each run in case something widened it.
  $me = "$env:USERDOMAIN\$env:USERNAME"
  & icacls $Dest /inheritance:r /grant:r "${me}:(OI)(CI)F" /C /Q | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "icacls failed ($LASTEXITCODE) on $Dest" }
  # Everything inside takes the folder's rule and nothing else. (Not /T on the grant: that strips a file's inherited rights and leaves it unreadable to all.)
  & icacls "$Dest\*" /reset /T /C /Q | Out-Null
}

if ($Install) {
  New-Item -ItemType Directory -Force -Path $Dest, $Sets | Out-Null
  $inGit = & cmd /c "git -C `"$Dest`" rev-parse --is-inside-work-tree 2>nul"
  if ($inGit -eq 'true') { throw "$Dest is inside a git repository. It must not be." }
  Restrict-Folder
  $target = Join-Path $Dest 'pull-backups.ps1'
  if ($PSCommandPath -ne $target) {
    Copy-Item -Force $PSCommandPath $target
    # bash on the server refuses CRLF, and a Windows checkout can make it so.
    [System.IO.File]::WriteAllText((Join-Path $Dest 'savant-backup.sh'), [System.IO.File]::ReadAllText((Join-Path $PSScriptRoot 'savant-backup.sh')).Replace("`r`n", "`n"))
  }
  Restrict-Folder
  Write-Output "Ready: $Dest, only $env:USERNAME can read it."
  exit 0
}

if ($Schedule) {
  $target = Join-Path $Dest 'pull-backups.ps1'
  if (-not (Test-Path $target)) { throw "Run -Install first." }
  $action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$target`""
  $now = (Get-Date).Date.AddHours(1)
  $triggers = @(
    (New-ScheduledTaskTrigger -Once -At $now -RepetitionInterval (New-TimeSpan -Hours 6) -RepetitionDuration (New-TimeSpan -Days 3650)),
    (New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME")
  )
  $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RunOnlyIfNetworkAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 2) -Priority 7
  $principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited
  Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $triggers -Settings $settings -Principal $principal -Force | Out-Null

  Write-Output "Scheduled '$TaskName' every 6 hours and at sign-in; it runs from $target."
  exit 0
}

New-Item -ItemType Directory -Force -Path $Dest, $Sets, $Incoming | Out-Null
try { [System.Diagnostics.Process]::GetCurrentProcess().PriorityClass = 'BelowNormal' } catch { }

# One at a time.
$lock = Join-Path $Dest 'pull.lock'
try { $lockStream = [System.IO.File]::Open($lock, 'OpenOrCreate', 'ReadWrite', 'None') } catch { Write-Output 'Another pull is running.'; exit 0 }

function Sha256OfStream([System.IO.Stream]$Stream) {
  $sha = [System.Security.Cryptography.SHA256]::Create()
  try { return ([BitConverter]::ToString($sha.ComputeHash($Stream))).Replace('-', '').ToLowerInvariant() } finally { $sha.Dispose() }
}
function Sha256OfFile([string]$Path) {
  $s = [System.IO.File]::OpenRead($Path)
  try { return Sha256OfStream $s } finally { $s.Dispose() }
}
function Sha256OfGunzip([string]$Path) {
  $s = [System.IO.File]::OpenRead($Path)
  try {
    $gz = New-Object System.IO.Compression.GZipStream($s, [System.IO.Compression.CompressionMode]::Decompress)
    try { return Sha256OfStream $gz } finally { $gz.Dispose() }
  } finally { $s.Dispose() }
}
function StampOf([string]$Id) { return [datetime]::ParseExact($Id.Substring(3), "yyyyMMdd'T'HHmmss'Z'", [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]'AssumeUniversal,AdjustToUniversal') }

# Which of these ids to keep: the newest few, every one in the last 48 hours, then the newest of each day, nothing past the limit.
function KeepList([string[]]$Ids) {
  $now = (Get-Date).ToUniversalTime()
  $seenDay = @{}
  $keep = New-Object System.Collections.ArrayList
  $i = 0
  foreach ($id in ($Ids | Sort-Object -Descending)) {
    $at = StampOf $id
    $day = $at.ToString('yyyyMMdd')
    $firstOfDay = -not $seenDay.ContainsKey($day)
    $seenDay[$day] = $true
    if ($i -lt $KeepNewest -or (($at -gt $now.AddDays(-$MaxAgeDays)) -and (($at -gt $now.AddHours(-$KeepAllHours)) -or $firstOfDay))) { [void]$keep.Add($id) }
    $i++
  }
  return ,$keep
}

$failed = $false
$pulled = 0
try {
  Restrict-Folder
  if (-not $NoFreshSet) {
    # cmd's < sends the file's bytes as they are; PowerShell's pipe would change them. The script stays LF, or bash on the server refuses it.
    $sh = Join-Path $PSScriptRoot 'savant-backup.sh'
    $fresh = & cmd /c "`"$Ssh`" -i `"$KeyFile`" -o BatchMode=yes -o ConnectTimeout=20 -o StrictHostKeyChecking=yes $RemoteHost `"nice -n 15 ionice -c3 runuser -u savant -- bash -s`" < `"$sh`" 2>&1"
    $freshExit = $LASTEXITCODE
    $tail = @($fresh) | Select-Object -Last 1
    if ($freshExit -ne 0) { Log "WARNING: making a fresh set on the server failed (exit $freshExit): $tail"; $failed = $true } else { Log "fresh set on the server: $tail" }
  }
  $remote = & $Ssh @SshOpts $RemoteHost "ls -1 '$RemoteDir' 2>/dev/null; cat '$RemoteDir/last-run.json' 2>/dev/null"
  if ($LASTEXITCODE -ne 0) { throw "could not reach the server (ssh exit $LASTEXITCODE)" }
  $names = @($remote | Where-Object { $_ -match '^db-\d{8}T\d{6}Z\.manifest\.json$' })
  $lastRun = @($remote | Where-Object { $_ -match '^\{"at"' }) | Select-Object -Last 1
  if ($names.Count -eq 0) { throw 'the server has no backup sets' }
  $ids = @($names | ForEach-Object { $_ -replace '\.manifest\.json$', '' })
  $have = @(Get-ChildItem -Path $Sets -Directory -ErrorAction SilentlyContinue | ForEach-Object { $_.Name })
  $wanted = KeepList $ids

  Get-ChildItem -Path $Incoming -Force -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force
  foreach ($id in ($wanted | Sort-Object)) {
    if ($have -contains $id) { continue }
    $work = Join-Path $Incoming $id
    New-Item -ItemType Directory -Force -Path $work | Out-Null
    & $Scp -q @SshOpts "${RemoteHost}:$RemoteDir/$id.*" "$work\"
    if ($LASTEXITCODE -ne 0) { throw "scp of $id failed (exit $LASTEXITCODE)" }
    $manifest = Get-Content -Raw -Path (Join-Path $work "$id.manifest.json") | ConvertFrom-Json
    $dataFile = Join-Path $work $manifest.file
    if ((Sha256OfFile $dataFile) -ne $manifest.gz_sha256) { throw "$($manifest.file): compressed checksum does not match" }
    if ((Sha256OfGunzip $dataFile) -ne $manifest.sha256) { throw "$($manifest.file): data checksum does not match" }
    foreach ($e in @($manifest.extras)) {
      if (-not $e) { continue }
      if ((Sha256OfGunzip (Join-Path $work $e.file)) -ne $e.sha256) { throw "$($e.file): checksum does not match" }
    }
    Move-Item -Path $work -Destination (Join-Path $Sets $id)
    $pulled++
    Log "pulled $id, $([math]::Round($manifest.gz_bytes / 1MB, 1)) MB, $(@($manifest.extras).Count) extras, checksums match"
  }

  # Rotation here, on what is here. The server's list does not matter: if the server is gone, what is here must not vanish by it.
  $here = @(Get-ChildItem -Path $Sets -Directory -ErrorAction SilentlyContinue | Where-Object { $_.Name -match '^db-\d{8}T\d{6}Z$' } | ForEach-Object { $_.Name })
  if ($here.Count -gt 0) {
    $keepHere = KeepList $here
    foreach ($id in $here) {
      if ($keepHere -notcontains $id) { Remove-Item -Recurse -Force (Join-Path $Sets $id); Log "rotated out $id" }
    }
  }

  # Tell the server when it was last copied off, so anyone looking there can see how old the off-server copy is.
  & $Ssh @SshOpts $RemoteHost "date -u +%FT%TZ > '$RemoteDir/last-offsite-pull'"

  $newest = @(Get-ChildItem -Path $Sets -Directory | Sort-Object Name) | Select-Object -Last 1
  $ageH = [math]::Round(((Get-Date).ToUniversalTime() - (StampOf $newest.Name)).TotalHours, 1)
  $sizeMb = [math]::Round((Get-ChildItem -Path $Sets -Recurse -File | Measure-Object -Property Length -Sum).Sum / 1MB, 1)
  Log "ok: pulled $pulled, $(@(Get-ChildItem -Path $Sets -Directory).Count) sets here, $sizeMb MB, newest $($newest.Name) is $ageH h old. Server's last run: $lastRun"
  if ($ageH -gt 13) { Log "WARNING: the newest set is $ageH h old"; $failed = $true }
  if ($lastRun -and $lastRun -notmatch '"ok":true') { Log "WARNING: the server's last backup run failed"; $failed = $true }
} catch {
  Log "FAILED: $($_.Exception.Message)"
  $failed = $true
} finally {
  Get-ChildItem -Path $Incoming -Force -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
  $lockStream.Dispose()
}
if ($failed) { exit 1 }
exit 0
