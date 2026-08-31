param([switch]$Apply)

$ErrorActionPreference = 'Stop'
$taskName = 'SQCMI-Inventory-AI-Observability'
$identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$repo = 'D:\seowon_projects\sqcm-i-inventory-system'
$observabilityScript = Join-Path $repo 'scripts\inventory-ai-observability.ps1'
if (-not (Test-Path -LiteralPath $observabilityScript -PathType Leaf)) { throw 'Observability script is missing.' }

$plan = [ordered]@{
  status = if ($Apply) { 'APPLY' } else { 'DRY_RUN' }
  identity = $identity
  logonType = 'Interactive'
  triggers = @('AtLogOn', 'Every5Minutes')
  task = $taskName
  existingRuntimeBridgeTasksChanged = $false
  secretValuesIncluded = $false
}
if (-not $Apply) { $plan | ConvertTo-Json -Depth 4; exit 0 }

$existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
$originalXml = if ($existing) { Export-ScheduledTask -TaskName $taskName } else { $null }
$principal = New-ScheduledTaskPrincipal -UserId $identity -LogonType Interactive -RunLevel Limited
$logon = New-ScheduledTaskTrigger -AtLogOn -User $identity
$repeat = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 5) -RepetitionDuration (New-TimeSpan -Days 3650)
$settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 3) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
$powerShell = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
$action = New-ScheduledTaskAction -Execute $powerShell -Argument "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$observabilityScript`" -StartupGraceSeconds 60" -WorkingDirectory $repo

try {
  Register-ScheduledTask -TaskName $taskName -Action $action -Trigger @($logon, $repeat) -Principal $principal -Settings $settings -Description 'SQCM-i inventory AI Secret-free observability after user logon.' -Force | Out-Null
  $plan.status = 'APPLIED'
  $plan | ConvertTo-Json -Depth 4
} catch {
  if ($originalXml) { Register-ScheduledTask -TaskName $taskName -Xml $originalXml -Force | Out-Null }
  elseif (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) { Unregister-ScheduledTask -TaskName $taskName -Confirm:$false }
  throw
}
