import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";

const backupRoot = path.resolve("artifacts", "backups");
fs.mkdirSync(backupRoot, { recursive: true });

const timestamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "Z");
const backupPath = path.join(backupRoot, `seowon-inventory-${timestamp}.dump`);

function runBackup() {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(backupPath, { flags: "wx" });
    const child = spawn("docker", [
      "compose", "exec", "-T", "database",
      "pg_dump", "-U", "seowon", "-d", "seowon_inventory", "-Fc"
    ], { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stdout.pipe(output);
    child.stderr.on("data", chunk => { stderr += chunk.toString(); });
    child.on("error", reject);
    child.on("close", code => {
      output.end(() => code === 0 ? resolve() : reject(new Error(stderr || `pg_dump exited ${code}`)));
    });
  });
}

try {
  await runBackup();
  const data = fs.readFileSync(backupPath);
  if (data.length < 1024) throw new Error(`backup is unexpectedly small: ${data.length} bytes`);
  const digest = crypto.createHash("sha256").update(data).digest("hex");
  const manifest = { schemaVersion:1,createdAt:new Date().toISOString(),backupPath,bytes:data.length,sha256:digest,restoreVerified:false,restoreDrillAt:null };
  fs.writeFileSync(`${backupPath}.json`, `${JSON.stringify(manifest,null,2)}\n`, { flag:"wx" });
  console.log(JSON.stringify(manifest, null, 2));
  console.log("PostgreSQL 백업 생성 통과");
} catch (error) {
  if (fs.existsSync(backupPath)) fs.rmSync(backupPath);
  throw error;
}
