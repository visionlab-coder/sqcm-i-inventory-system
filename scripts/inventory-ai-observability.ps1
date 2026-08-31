param(
  [ValidateRange(0, 120)]
  [int]$StartupGraceSeconds = 0
)

$ErrorActionPreference = 'Stop'
$runtimeRoot = 'D:\seowon_runtime\sqcmi-inventory-ai'
$configPath = Join-Path $runtimeRoot 'config\bridge.json'
$logDirectory = Join-Path $runtimeRoot 'logs'
$mutex = [Threading.Mutex]::new($false, 'Local\SQCMIInventoryAIObservability')
if (-not $mutex.WaitOne(0)) { exit 0 }

function Invoke-LocalProbe {
  param([string]$Uri, [string]$TokenFile)
  $headers = @{ Accept = 'application/json' }
  if ($TokenFile) {
    $token = [IO.File]::ReadAllText($TokenFile).Trim()
    if (-not $token) { throw 'Probe token file is empty.' }
    $headers.Authorization = "Bearer $token"
  }
  $timer = [Diagnostics.Stopwatch]::StartNew()
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri $Uri -Headers $headers -Method Get -TimeoutSec 10
    [pscustomobject]@{ status = if ($response.StatusCode -eq 200) { 'PASS' } else { 'FAIL' }; httpStatus = [int]$response.StatusCode; latencyMs = [math]::Round($timer.Elapsed.TotalMilliseconds, 1); errorType = $null }
  } catch {
    [pscustomobject]@{ status = 'FAIL'; httpStatus = $null; latencyMs = [math]::Round($timer.Elapsed.TotalMilliseconds, 1); errorType = $_.Exception.GetType().Name }
  } finally {
    $timer.Stop()
  }
}

function Get-ListenerPid([int]$Port) {
  $listener = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($listener) { return [int]$listener.OwningProcess }
  return $null
}

try {
  $config = Get-Content -Raw -LiteralPath $configPath | ConvertFrom-Json
  $deadline = [DateTime]::UtcNow.AddSeconds($StartupGraceSeconds)
  do {
    $runtime = Invoke-LocalProbe -Uri 'http://127.0.0.1:18767/health' -TokenFile $config.runtimeApiKeyFile
    $bridgeHealth = Invoke-LocalProbe -Uri 'http://127.0.0.1:18766/health' -TokenFile ''
    $bridgeReady = Invoke-LocalProbe -Uri 'http://127.0.0.1:18766/ready' -TokenFile $config.bearerTokenFile
    $application = Invoke-LocalProbe -Uri 'http://127.0.0.1:58080/api/health' -TokenFile ''
    $passed = @($runtime, $bridgeHealth, $bridgeReady, $application) | Where-Object { $_.status -ne 'PASS' }
    if ($passed.Count -eq 0 -or [DateTime]::UtcNow -ge $deadline) { break }
    Start-Sleep -Seconds 5
  } while ($true)

  $record = [ordered]@{
    schemaVersion = 1
    event = 'inventory_ai_observability'
    timestampUtc = [DateTime]::UtcNow.ToString('o')
    runtime = $runtime
    bridgeHealth = $bridgeHealth
    bridgeReady = $bridgeReady
    application = $application
    pids = [ordered]@{ runtime = Get-ListenerPid 18767; bridge = Get-ListenerPid 18766 }
  }
  if (-not (Test-Path -LiteralPath $logDirectory -PathType Container)) { throw 'Observability log directory is missing.' }
  $logPath = Join-Path $logDirectory ("observability-{0}.jsonl" -f [DateTime]::UtcNow.ToString('yyyyMMdd'))
  [IO.File]::AppendAllText($logPath, (($record | ConvertTo-Json -Compress -Depth 6) + [Environment]::NewLine), [Text.UTF8Encoding]::new($false))
  if ($passed.Count -gt 0) { exit 1 }
  exit 0
} finally {
  $mutex.ReleaseMutex()
  $mutex.Dispose()
}
