param(
  [string]$OutputPath = ".env",
  [switch]$Force
)

$ErrorActionPreference = 'Stop'

function New-HexSecret([int]$ByteCount) {
  $bytes = [byte[]]::new($ByteCount)
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
  return ([BitConverter]::ToString($bytes) -replace '-', '').ToLowerInvariant()
}

function New-Base64Secret([int]$ByteCount) {
  $bytes = [byte[]]::new($ByteCount)
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
  return [Convert]::ToBase64String($bytes)
}

$workspace = [IO.Path]::GetFullPath((Get-Location).Path)
$target = [IO.Path]::GetFullPath((Join-Path $workspace $OutputPath))
$workspacePrefix = $workspace.TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
if (-not $target.StartsWith($workspacePrefix, [StringComparison]::OrdinalIgnoreCase)) {
  throw 'OutputPath must stay inside the current workspace.'
}
if ((Test-Path -LiteralPath $target) -and -not $Force) {
  throw "Refusing to overwrite existing file: $target. Use -Force only after reviewing the target."
}

$postgresPassword = New-HexSecret 24
$sessionSecret = New-HexSecret 32
$mfaKey = New-Base64Secret 32
$adminPassword = "$(New-HexSecret 16)Aa1!"
$managerPassword = "$(New-HexSecret 16)Aa1!"
$userPassword = "$(New-HexSecret 16)Aa1!"

$content = @"
NODE_ENV=development
PORT=3000
POSTGRES_PASSWORD=$postgresPassword
DATABASE_URL=postgres://seowon:$postgresPassword@localhost:5432/seowon_inventory
SESSION_SECRET=$sessionSecret
MFA_ENCRYPTION_KEY=$mfaKey
DB_AUTO_MIGRATE=true
DB_RUN_SEEDS=true
SEED_ADMIN_PASSWORD=$adminPassword
SEED_MANAGER_PASSWORD=$managerPassword
SEED_USER_PASSWORD=$userPassword
LOGIN_RATE_LIMIT_MAX=10
LOGIN_RATE_LIMIT_WINDOW_MS=900000
FILE_STORAGE_DRIVER=local
FILE_STORAGE_ROOT=artifacts/uploads
FILE_MAX_BYTES=5242880
AUTH_PROVIDER=local
MALWARE_SCAN_DRIVER=mock
OPERATIONAL_ADAPTER_MODULE=
OIDC_REDIRECT_URI=
OIDC_ALLOW_EMAIL_LINKING=false
"@

[IO.File]::WriteAllText($target, $content, [Text.UTF8Encoding]::new($false))
Write-Output "Created local runtime environment file: $target"
Write-Output 'Credential values were not printed. Keep this ignored file out of Git.'
