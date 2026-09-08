param([switch]$StartNow)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$taskName = 'SQCMI-Inventory-Production-Tunnel'
$repo = 'D:\seowon_projects\sqcm-i-inventory-system'
$watchdog = Join-Path $repo 'scripts\ensure-inventory-production-tunnel.mjs'
$node = (Get-Command node.exe -ErrorAction Stop).Source
$identity = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name

foreach ($file in @($node, $watchdog)) {
  $item = Get-Item -LiteralPath $file -Force -ErrorAction Stop
  if (-not $item.PSIsContainer -and -not ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) { continue }
  throw "Autostart input is not an exact physical file: $file"
}

$existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
$originalXml = if ($existing) { Export-ScheduledTask -TaskName $taskName } else { $null }
$arguments = "`"$watchdog`" --execute"
$action = New-ScheduledTaskAction -Execute $node -Argument $arguments -WorkingDirectory $repo
$logon = New-ScheduledTaskTrigger -AtLogOn -User $identity
$repeat = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 5) -RepetitionDuration (New-TimeSpan -Days 3650)
$principal = New-ScheduledTaskPrincipal -UserId $identity -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -StartWhenAvailable -RestartCount 2 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit (New-TimeSpan -Minutes 2) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries

try {
  Register-ScheduledTask -TaskName $taskName -Action $action -Trigger @($logon, $repeat) -Principal $principal -Settings $settings -Description 'Keep the isolated SQCM-i Inventory Production tunnel connected without changing the SQCM-i OS tunnel.' -Force | Out-Null
  $registered = Get-ScheduledTask -TaskName $taskName -ErrorAction Stop
  if ($registered.Actions.Count -ne 1 -or $registered.Actions[0].Execute -ne $node -or $registered.Actions[0].Arguments -ne $arguments) {
    throw 'Registered task action does not match the exact watchdog contract.'
  }
  if ($StartNow) {
    Start-ScheduledTask -TaskName $taskName
    Start-Sleep -Seconds 5
  }
  [pscustomobject]@{
    status = 'PASS_INVENTORY_TUNNEL_AUTOSTART_REGISTERED'
    taskName = $taskName
    principal = $identity
    runLevel = 'Limited'
    triggerCount = $registered.Triggers.Count
    startRequested = [bool]$StartNow
  } | ConvertTo-Json -Compress
} catch {
  if ($originalXml) {
    Register-ScheduledTask -TaskName $taskName -Xml $originalXml -Force | Out-Null
  } elseif (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
  }
  throw
}
