import process from "node:process";

const baseUrl = (process.env.DEPLOY_BASE_URL || "http://localhost:3000").replace(/\/$/, "");

async function expectResponse(path, expectedStatus, checkBody) {
  const response = await fetch(`${baseUrl}${path}`, { redirect: "manual" });
  if (response.status !== expectedStatus) {
    throw new Error(`${path}: expected ${expectedStatus}, received ${response.status}`);
  }
  if (checkBody) await checkBody(response);
  console.log(`PASS ${path} -> ${response.status}`);
}

await expectResponse("/health", 200, async (response) => {
  const body = await response.json();
  if (body.status !== "ok" || body.service !== "frontend") {
    throw new Error("frontend health body mismatch");
  }
});
await expectResponse("/api/health", 200, async (response) => {
  const body = await response.json();
  if (body.status !== "ok") throw new Error("backend health body mismatch");
});

await expectResponse("/api/readiness", 200, async (response) => {
  const body = await response.json();
  if (body.status !== "ok" || body.dependencies?.storage?.status !== "ok" || body.dependencies?.malware?.status !== "ok") {
    throw new Error("backend readiness contract mismatch");
  }
});
await expectResponse("/api/items", 401);
await expectResponse("/assets/seowon-official-logo-reversed.png", 200, async (response) => {
  if (!response.headers.get("content-type")?.startsWith("image/")) {
    throw new Error("official logo content type mismatch");
  }
});

console.log(`배포 스모크 테스트 통과: ${baseUrl}`);
