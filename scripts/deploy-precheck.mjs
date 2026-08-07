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
rejectPlaceholder("SEED_ADMIN_PASSWORD", 12);
rejectPlaceholder("SEED_MANAGER_PASSWORD", 12);
rejectPlaceholder("SEED_USER_PASSWORD", 12);

if (value("SEED_ADMIN_PASSWORD") === value("SEED_MANAGER_PASSWORD")) {
  failures.push("관리자와 담당자 초기 비밀번호는 서로 달라야 합니다.");
}

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
if (target !== "local" && value("COOKIE_SECURE").toLowerCase() !== "true") {
  failures.push("외부 배포에서는 COOKIE_SECURE=true여야 합니다.");
}

if (failures.length) {
  console.error("배포 사전검사 실패:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`배포 사전검사 통과 (대상=${target}, 포트=${port}, 릴리스=${value("RELEASE_TAG")})`);
