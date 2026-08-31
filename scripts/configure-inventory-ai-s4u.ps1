param([switch]$Apply)

$ErrorActionPreference = 'Stop'
$runtimeTaskName = 'SQCMI-Inventory-AI-Runtime'
$bridgeTaskName = 'SQCMI-Inventory-AI-Bridge'
$observabilityTaskName = 'SQCMI-Inventory-AI-Observability'
$identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$repo = 'D:\seowon_projects\sqcm-i-inventory-system'
$observabilityScript = Join-Path $repo 'scripts\inventory-ai-observability.ps1'

$runtimeTask = Get-ScheduledTask -TaskName $runtimeTaskName
$bridgeTask = Get-ScheduledTask -TaskName $bridgeTaskName
if (-not (Test-Path -LiteralPath $observabilityScript -PathType Leaf)) { throw 'Observability script is missing.' }

$plan = [ordered]@{
  status = if ($Apply) { 'APPLY' } else { 'DRY_RUN' }
  identity = $identity
  logonType = 'S4U'
  triggers = @('AtStartup', 'AtLogOn')
  tasks = @($runtimeTaskName, $bridgeTaskName, $observabilityTaskName)
  secretValuesIncluded = $false
}
if (-not $Apply) { $plan | ConvertTo-Json -Depth 4; exit 0 }

$originalXml = @{
  $runtimeTaskName = Export-ScheduledTask -TaskName $runtimeTaskName
  $bridgeTaskName = Export-ScheduledTask -TaskName $bridgeTaskName
}
$observabilityExisted = $null -ne (Get-ScheduledTask -TaskName $observabilityTaskName -ErrorAction SilentlyContinue)
if ($observabilityExisted) { $originalXml[$observabilityTaskName] = Export-ScheduledTask -TaskName $observabilityTaskName }

$principal = New-ScheduledTaskPrincipal -UserId $identity -LogonType S4U -RunLevel Limited
$startup = New-ScheduledTaskTrigger -AtStartup
$logon = New-ScheduledTaskTrigger -AtLogOn -User $identity
$settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit (New-TimeSpan -Seconds 0) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
$observationStart = (Get-Date).AddMinutes(1)
$observationRepeat = New-ScheduledTaskTrigger -Once -At $observationStart -RepetitionInterval (New-TimeSpan -Minutes 5) -RepetitionDuration (New-TimeSpan -Days 3650)
$powerShell = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
$observationAction = New-ScheduledTaskAction -Execute $powerShell -Argument "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$observabilityScript`" -StartupGraceSeconds 90" -WorkingDirectory $repo

try {
  Register-ScheduledTask -TaskName $runtimeTaskName -Action $runtimeTask.Actions -Trigger @($startup, $logon) -Principal $principal -Settings $settings -Description 'SQCM-i inventory AI runtime, least-privilege S4U startup.' -Force | Out-Null
  Register-ScheduledTask -TaskName $bridgeTaskName -Action $bridgeTask.Actions -Trigger @($startup, $logon) -Principal $principal -Settings $settings -Description 'SQCM-i inventory AI bridge, least-privilege S4U startup.' -Force | Out-Null
  Register-ScheduledTask -TaskName $observabilityTaskName -Action $observationAction -Trigger @($startup, $observationRepeat) -Principal $principal -Settings $settings -Description 'SQCM-i inventory AI Secret-free local observability.' -Force | Out-Null
  $plan.status = 'APPLIED'
  $plan | ConvertTo-Json -Depth 4
} catch {
  foreach ($name in @($runtimeTaskName, $bridgeTaskName)) { Register-ScheduledTask -TaskName $name -Xml $originalXml[$name] -Force | Out-Null }
  if ($observabilityExisted) { Register-ScheduledTask -TaskName $observabilityTaskName -Xml $originalXml[$observabilityTaskName] -Force | Out-Null }
  elseif (Get-ScheduledTask -TaskName $observabilityTaskName -ErrorAction SilentlyContinue) { Unregister-ScheduledTask -TaskName $observabilityTaskName -Confirm:$false }
  throw
}
