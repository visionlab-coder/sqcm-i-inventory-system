import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";

const backupPath = process.argv[2] ? path.resolve(process.argv[2]) : "";
const backupRoot = path.resolve("artifacts", "backups") + path.sep;
if (!backupPath || !fs.existsSync(backupPath) || !backupPath.startsWith(backupRoot)) {
  console.error("artifacts/backups 아래의 백업 파일 경로가 필요합니다.");
  process.exit(1);
}

const drillDatabase = `seowon_inventory_restore_drill_${crypto.randomBytes(6).toString("hex")}`;
if (!/^seowon_inventory_restore_drill_[a-f0-9]{12}$/.test(drillDatabase)) {
  throw new Error("unsafe restore drill database name");
}

function runDocker(args, inputFile) {
  return new Promise((resolve, reject) => {
    const child = spawn("docker", ["compose", "exec", "-T", "database", ...args], {
      stdio: [inputFile ? "pipe" : "ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", chunk => { stdout += chunk.toString(); });
    child.stderr.on("data", chunk => { stderr += chunk.toString(); });
    child.on("error", reject);
    child.on("close", code => code === 0
      ? resolve(stdout.trim())
      : reject(new Error(stderr || `docker command exited ${code}`)));
    if (inputFile) fs.createReadStream(inputFile).pipe(child.stdin);
  });
}

async function counts(database) {
  const sql = `SELECT json_build_object(
    'users',(SELECT count(*) FROM users),
    'items',(SELECT count(*) FROM items),
    'loans',(SELECT count(*) FROM loans),
    'audit_logs',(SELECT count(*) FROM audit_logs),
    'required_tables',(SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('users','items','loans','audit_logs','user_sessions'))
  );`;
  return JSON.parse(await runDocker(["psql", "-U", "seowon", "-d", database, "-At", "-c", sql]));
}

let created = false;
try {
  const sourceCounts = await counts("seowon_inventory");
  await runDocker(["createdb", "-U", "seowon", drillDatabase]);
  created = true;
  await runDocker(["pg_restore", "-U", "seowon", "-d", drillDatabase, "--no-owner", "--no-privileges"], backupPath);
  const restoredCounts = await counts(drillDatabase);
  if (restoredCounts.required_tables !== 5 || JSON.stringify(sourceCounts) !== JSON.stringify(restoredCounts)) {
    throw new Error(`restore validation mismatch: source=${JSON.stringify(sourceCounts)} restored=${JSON.stringify(restoredCounts)}`);
  }
  console.log(JSON.stringify({ backupPath, drillDatabase, sourceCounts, restoredCounts }, null, 2));
  console.log("PostgreSQL 격리 복구 훈련 통과");
} finally {
  if (created) {
    await runDocker(["dropdb", "-U", "seowon", "--if-exists", drillDatabase]);
    console.log(`복구 훈련 임시 DB 제거 완료: ${drillDatabase}`);
  }
}
