export const P6_TO_P7_PROMOTION_CONFIRMATION = 'ACK-P6-ACTUAL-CUTOVER-COMPLETE-OPEN-P7';
export const STATUS_BLOCK_START = '<!-- HARNESS_STATUS_START -->';
export const STATUS_BLOCK_END = '<!-- HARNESS_STATUS_END -->';

const SHA256 = /^[a-f0-9]{64}$/;

export function renderHarnessStatusBlock({ completedPhases, totalPhases, currentPhase, productionGo, readyWork }) {
  return [
    STATUS_BLOCK_START,
    `Harness 진행: **${completedPhases} / ${totalPhases} Phase 완료**`,
    `현재 Phase: **${currentPhase}**`,
    `현재 READY: \`${readyWork}\``,
    `Production GO: **${productionGo ? 'true' : 'false'}**`,
    STATUS_BLOCK_END
  ].join('\n');
}

export function replaceHarnessStatusBlock(document, block) {
  const start = document.indexOf(STATUS_BLOCK_START);
  const end = document.indexOf(STATUS_BLOCK_END);
  if (start < 0 || end < start || document.indexOf(STATUS_BLOCK_START, start + 1) >= 0
    || document.indexOf(STATUS_BLOCK_END, end + 1) >= 0) throw new Error('HARNESS_STATUS_BLOCK_INVALID');
  return `${document.slice(0, start)}${block}${document.slice(end + STATUS_BLOCK_END.length)}`;
}

function replaceOnce(document, before, after) {
  const first = document.indexOf(before);
  if (first < 0 || document.indexOf(before, first + before.length) >= 0) throw new Error(`PHASE_PROMOTION_DOCUMENT_CONTRACT_MISMATCH:${before.slice(0, 40)}`);
  return document.replace(before, after);
}

export function promoteRoadmapDocument(document, block) {
  let next = replaceHarnessStatusBlock(document, block);
  next = replaceOnce(next, 'P6["P6 Production 전환<br/>🔄 G2 Git·CI·이미지 PASS"]', 'P6["P6 Production 전환<br/>✅ actual cutover 완료"]');
  next = replaceOnce(next, 'P7["P7 운영·유지보수 활성화<br/>⏳ 대기"]', 'P7["P7 운영·유지보수 활성화<br/>🔄 G0 인수 preflight"]');
  next = replaceOnce(next, '    class P6 active;', '    class P6 done;');
  next = replaceOnce(next, '    class P7 pending;', '    class P7 active;');
  next = replaceOnce(next, '진척도: **6 / 8 Phase 완료**', '진척도: **7 / 8 Phase 완료**');
  next = replaceOnce(next, '현재 위치: **P6 Production 전환**', '현재 위치: **P7 운영·유지보수 활성화**');
  next = replaceOnce(next, '다음 Phase: **P7 운영·유지보수 활성화** — P6 전환 증거 완료 전에는 시작하지 않는다.', '다음 Gate: **P7-G0-OPERATIONS-HANDOVER-PREFLIGHT**');
  next = replaceOnce(next, '| P6 Production 전환 | 최종 승인, cutover, 관측·복구 확인 | 🔄 진행 중 |', '| P6 Production 전환 | 최종 승인, cutover, 관측·복구 확인 | ✅ 증거 있는 완료 |');
  next = replaceOnce(next, '| P7 운영·유지보수 활성화 | 백업, 경보, 온콜, 정기 점검, 개선 큐 | ⏳ 미착수 |', '| P7 운영·유지보수 활성화 | 백업, 경보, 온콜, 정기 점검, 개선 큐 | 🔄 진행 중 |');
  return next;
}

export function promoteCurrentStateDocument(document, block) {
  let next = replaceHarnessStatusBlock(document, block);
  next = replaceOnce(next,
    '상태: **P5 staging UAT 19/19·서명 3/3 완료 / P6-G3 AI PC loopback Production 배포·복구 PASS / P6-G4 공개 전환 대기 / Production NO-GO**',
    '상태: **P6 actual Production cutover 증거 완료 / P7-G0 운영 인수 preflight 진행 / Production GO**');
  next = replaceOnce(next,
    '- 공개 DNS/TLS, 실제 Production 사용자 로그인·MFA, 최종 서명은 아직 없으므로 `productionGo=false`다. 다음 READY는 `P6-G4-PRODUCTION-DNS-TLS-CUTOVER-AND-SIGNOFF`다.',
    '- P6 actual cutover 증거가 검증되어 `productionGo=true`다. 다음 READY는 `P7-G0-OPERATIONS-HANDOVER-PREFLIGHT`다.');
  next = replaceOnce(next,
    '현재 유일한 READY는 **P6-G4-PRODUCTION-DNS-TLS-CUTOVER-AND-SIGNOFF**다. 사전점검은 `READY_WAIT_CHANGE_WINDOW`이며 승인된 변경창 `2026-09-11 20:00~23:00 KST`에서 전용 Production tunnel·공개 DNS/TLS, 실제 사용자 로그인·MFA, 관측·최종 서명을 검증한다. 그 전까지 서비스는 `127.0.0.1:3300` 격리를 유지하며 Production은 `NO-GO`다.',
    '현재 유일한 READY는 **P7-G0-OPERATIONS-HANDOVER-PREFLIGHT**다. P6 actual cutover 증거의 SHA와 운영 8영역·운영 책임자 인수 입력을 검증한다.');
  return next;
}

export function evaluateP6ToP7Promotion({ roadmap, queue, actualEvidence, actualEvidenceSha256, execute = false, confirmation = null } = {}) {
  const failures = [];
  const p6 = roadmap?.phases?.find((phase) => phase.id === 'P6');
  const p7 = roadmap?.phases?.find((phase) => phase.id === 'P7');
  if (roadmap?.currentPhase !== 'P6' || roadmap?.completedPhases !== 6 || p6?.status !== 'in-progress' || !p6?.readyWork) failures.push('P6_CURRENT_STATE_INVALID');
  if (p7?.status !== 'not-started' || p7?.readyWork !== null) failures.push('P7_PREMATURE_STATE_INVALID');
  if (roadmap?.invariants?.productionGo !== false) failures.push('PRE_PROMOTION_PRODUCTION_GO_INVALID');
  if (queue?.currentPhase !== 'P6' || queue?.readyPacket !== 'ACC-P7-02-OPERATIONS-ACTIVATION-AND-SIGNOFF') failures.push('ACCELERATION_QUEUE_STATE_INVALID');
  if (actualEvidence?.status !== 'PASS' || actualEvidence?.evidenceType !== 'P6_CUTOVER_ACTUAL'
    || actualEvidence?.environment !== 'production' || actualEvidence?.activationState !== 'actual'
    || actualEvidence?.productionGo !== true) failures.push('ACTUAL_CUTOVER_EVIDENCE_INVALID');
  if (!SHA256.test(actualEvidenceSha256 || '')) failures.push('ACTUAL_CUTOVER_EVIDENCE_SHA_INVALID');
  if (failures.length) return { status: 'FAIL_P6_TO_P7_PROMOTION_CONTRACT', failures: [...new Set(failures)], changesMade: false, productionGo: false };
  if (!execute) return { status: 'PASS_P6_TO_P7_PROMOTION_DRY_RUN', failures: [], changesMade: false, productionGo: false };
  if (confirmation !== P6_TO_P7_PROMOTION_CONFIRMATION) return { status: 'READY_WAIT_P6_TO_P7_PROMOTION_CONFIRMATION', failures: [], changesMade: false, productionGo: false };

  const nextRoadmap = structuredClone(roadmap);
  const nextQueue = structuredClone(queue);
  const nextP6 = nextRoadmap.phases.find((phase) => phase.id === 'P6');
  const nextP7 = nextRoadmap.phases.find((phase) => phase.id === 'P7');
  nextRoadmap.currentPhase = 'P7';
  nextRoadmap.completedPhases = 7;
  nextRoadmap.invariants.productionGo = true;
  nextP6.status = 'evidence-complete';
  nextP6.readyWork = null;
  nextP6.completionEvidence = {
    date: actualEvidence.checkedAt.slice(0, 10), result: 'PASS_ACTUAL_PRODUCTION_CUTOVER',
    runId: actualEvidence.runId, releaseSha: actualEvidence.releaseSha,
    sha256: actualEvidenceSha256, targetUrl: actualEvidence.targetUrl
  };
  nextP7.status = 'in-progress';
  nextP7.readyWork = {
    id: 'P7-G0-OPERATIONS-HANDOVER-PREFLIGHT',
    description: 'P6 actual cutover 증거를 기준으로 운영 8영역과 운영 책임자 인수 입력을 검증한다.',
    authority: 'local-autonomous',
    nextGate: 'P7-G1-OPERATIONS-ACTIVATION-AND-SIGNOFF'
  };
  nextQueue.currentPhase = 'P7';
  nextQueue.rules.productionGo = true;
  return { status: 'READY_APPLY_P6_TO_P7_PROMOTION', failures: [], nextRoadmap, nextQueue, changesMade: false, productionGo: true };
}
