param(
  [string]$EnvFile = ".env.production",
  [string]$ProjectName = "seowon-inventory"
)

$ErrorActionPreference = "Stop"
$resolvedEnvFile = Resolve-Path -LiteralPath $EnvFile -ErrorAction Stop

node scripts/deploy-precheck.mjs $resolvedEnvFile.Path
if ($LASTEXITCODE -ne 0) { throw "배포 사전검사에 실패했습니다." }

docker compose --env-file $resolvedEnvFile.Path -p $ProjectName -f compose.yaml -f compose.production.yaml config --quiet
if ($LASTEXITCODE -ne 0) { throw "Compose 구성 검사에 실패했습니다." }

$deployValues = Get-Content -LiteralPath $resolvedEnvFile.Path | Where-Object { $_ -match "^[A-Za-z_][A-Za-z0-9_]*=" }
$deployTargetLine = $deployValues | Where-Object { $_ -match "^DEPLOY_TARGET=" } | Select-Object -Last 1
$deployTarget = if ($deployTargetLine) { ($deployTargetLine -split "=", 2)[1].Trim() } else { "production" }

if ($deployTarget -eq "local") {
  docker compose --env-file $resolvedEnvFile.Path -p $ProjectName -f compose.yaml -f compose.production.yaml up -d --build --wait
} else {
  docker compose --env-file $resolvedEnvFile.Path -p $ProjectName -f compose.yaml -f compose.production.yaml pull backend frontend
  if ($LASTEXITCODE -ne 0) { throw "검증된 불변 이미지를 가져오지 못했습니다." }
  docker compose --env-file $resolvedEnvFile.Path -p $ProjectName -f compose.yaml -f compose.production.yaml up -d --no-build --wait
}
if ($LASTEXITCODE -ne 0) { throw "컨테이너 배포에 실패했습니다." }

$frontendPortLine = $deployValues | Where-Object { $_ -match "^FRONTEND_PORT=" } | Select-Object -Last 1
$frontendPort = if ($frontendPortLine) { ($frontendPortLine -split "=", 2)[1].Trim() } else { "3000" }
$env:DEPLOY_BASE_URL = "http://localhost:$frontendPort"
node scripts/deploy-smoke.mjs
if ($LASTEXITCODE -ne 0) {
  docker compose --env-file $resolvedEnvFile.Path -p $ProjectName -f compose.yaml -f compose.production.yaml logs --tail 100
  throw "배포 후 스모크 테스트에 실패했습니다. 로그를 확인하고 롤백하십시오."
}

docker compose --env-file $resolvedEnvFile.Path -p $ProjectName -f compose.yaml -f compose.production.yaml ps
Write-Host "배포 완료: $($env:DEPLOY_BASE_URL)"
