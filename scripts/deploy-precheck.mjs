import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import dotenv from "dotenv";

const envFile = process.argv[2];
if (envFile) {
  const resolved = path.resolve(envFile);
  if (!fs.existsSync(resolved)) {
    console.error(`배포 환경 파일을 찾을 수 없습니다: ${resolved}`);
    process.exit(1);
  }
  dotenv.config({ path: resolved, override: true, quiet: true });
}

const failures = [];
const value = (name) => (process.env[name] || "").trim();
const rejectPlaceholder = (name, minimum) => {
  const current = value(name);
  if (current.length < minimum) failures.push(`${name}: ${minimum}자 이상이어야 합니다.`);
  if (/change-me|replace-with|admin1234|manager1234|development-only/i.test(current)) {
    failures.push(`${name}: 예시값 또는 기본값을 사용할 수 없습니다.`);
  }
};

rejectPlaceholder("POSTGRES_PASSWORD", 16);
rejectPlaceholder("SESSION_SECRET", 32);
rejectPlaceholder("MFA_ENCRYPTION_KEY", 40);
if (Buffer.from(value("MFA_ENCRYPTION_KEY"), "base64").length !== 32) {
  failures.push("MFA_ENCRYPTION_KEY: base64 32-byte 값이어야 합니다.");
}
if (value("DB_AUTO_MIGRATE").toLowerCase() !== "false") failures.push("Production requires DB_AUTO_MIGRATE=false.");
if (value("DB_RUN_SEEDS").toLowerCase() !== "false") failures.push("Production requires DB_RUN_SEEDS=false.");

const port = Number(value("FRONTEND_PORT") || "3000");
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  failures.push("FRONTEND_PORT: 1~65535 범위의 정수여야 합니다.");
}

const rateLimitMax = Number(value("LOGIN_RATE_LIMIT_MAX") || "10");
if (!Number.isInteger(rateLimitMax) || rateLimitMax < 1 || rateLimitMax > 1000) {
  failures.push("LOGIN_RATE_LIMIT_MAX: 1~1000 범위의 정수여야 합니다.");
}

const rateLimitWindow = Number(value("LOGIN_RATE_LIMIT_WINDOW_MS") || "900000");
if (!Number.isInteger(rateLimitWindow) || rateLimitWindow < 1000 || rateLimitWindow > 86400000) {
  failures.push("LOGIN_RATE_LIMIT_WINDOW_MS: 1000~86400000 범위의 정수여야 합니다.");
}

if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{2,127}$/.test(value("RELEASE_TAG"))) {
  failures.push("RELEASE_TAG: Git SHA 또는 안전한 릴리스 태그를 지정해야 합니다.");
}

const target = value("DEPLOY_TARGET") || "production";
if (target !== "local" && (value("FILE_STORAGE_DRIVER") || "local").toLowerCase() === "local") {
  failures.push("External deployments require FILE_STORAGE_DRIVER=external.");
}
if (target !== "local" && value("MALWARE_SCAN_DRIVER").toLowerCase() !== "external") {
  failures.push("External deployments require MALWARE_SCAN_DRIVER=external.");
}
if (target !== "local" && value("AUTH_PROVIDER").toLowerCase() !== "oidc") {
  failures.push("External deployments require AUTH_PROVIDER=oidc.");
}
if (target !== "local" && !value("OPERATIONAL_ADAPTER_MODULE")) {
  failures.push("External deployments require OPERATIONAL_ADAPTER_MODULE.");
}
if (target !== "local" && !/^https:\/\//i.test(value("OIDC_REDIRECT_URI"))) {
  failures.push("External deployments require an HTTPS OIDC_REDIRECT_URI.");
}
if (target !== "local" && !/^https:\/\//i.test(value("PUBLIC_BASE_URL"))) {
  failures.push("External deployments require an HTTPS PUBLIC_BASE_URL.");
}
if (target !== "local" && /^https:\/\//i.test(value("PUBLIC_BASE_URL")) && !value("OIDC_REDIRECT_URI").startsWith(`${value("PUBLIC_BASE_URL").replace(/\/$/, "")}/`)) {
  failures.push("OIDC_REDIRECT_URI must belong to PUBLIC_BASE_URL.");
}
const trustedProxyCount = Number(value("TRUSTED_PROXY_COUNT") || "1");
if (!Number.isInteger(trustedProxyCount) || trustedProxyCount < 1 || trustedProxyCount > 10) {
  failures.push("TRUSTED_PROXY_COUNT must be an integer from 1 to 10.");
}
if (target !== "local" && value("COOKIE_SECURE").toLowerCase() !== "true") {
  failures.push("외부 배포에서는 COOKIE_SECURE=true여야 합니다.");
}

if (failures.length) {
  console.error("배포 사전검사 실패:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`배포 사전검사 통과 (대상=${target}, 포트=${port}, 릴리스=${value("RELEASE_TAG")})`);
