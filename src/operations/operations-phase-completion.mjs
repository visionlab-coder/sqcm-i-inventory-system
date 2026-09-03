import { renderHarnessStatusBlock, replaceHarnessStatusBlock } from './production-phase-promotion.mjs';

export const P7_COMPLETION_CONFIRMATION = 'ACK-P7-ACTUAL-HANDOVER-COMPLETE-CLOSE-8-OF-8';
const SHA256 = /^[a-f0-9]{64}$/;

function replaceOnce(document, before, after) {
  const first = document.indexOf(before);
  if (first < 0 || document.indexOf(before, first + before.length) >= 0) throw new Error(`P7_COMPLETION_DOCUMENT_CONTRACT_MISMATCH:${before.slice(0, 40)}`);
  return document.replace(before, after);
}

export function completeRoadmapDocument(document) {
  const block = renderHarnessStatusBlock({ completedPhases: 8, totalPhases: 8, currentPhase: 'P7', productionGo: true, readyWork: 'NONE' });
  let next = replaceHarnessStatusBlock(document, block);
  next = replaceOnce(next, 'P7["P7 운영·유지보수 활성화<br/>🔄 G0 인수 preflight"]', 'P7["P7 운영·유지보수 활성화<br/>✅ actual 인수 완료"]');
  next = replaceOnce(next, '    class P7 active;', '    class P7 done;');
  next = replaceOnce(next, '진척도: **7 / 8 Phase 완료**', '진척도: **8 / 8 Phase 완료**');
  next = replaceOnce(next, '현재 위치: **P7 운영·유지보수 활성화**', '현재 위치: **P0~P7 전체 완료**');
  next = replaceOnce(next, '다음 Gate: **P7-G0-OPERATIONS-HANDOVER-PREFLIGHT**', '다음 Gate: **NONE — 장기 Goal 완료**');
  next = replaceOnce(next, '| P7 운영·유지보수 활성화 | 백업, 경보, 온콜, 정기 점검, 개선 큐 | 🔄 진행 중 |', '| P7 운영·유지보수 활성화 | 백업, 경보, 온콜, 정기 점검, 개선 큐 | ✅ 증거 있는 완료 |');
  return next;
}

export function completeCurrentStateDocument(document) {
  const block = renderHarnessStatusBlock({ completedPhases: 8, totalPhases: 8, currentPhase: 'P7', productionGo: true, readyWork: 'NONE' });
  let next = replaceHarnessStatusBlock(document, block);
  next = replaceOnce(next,
    '상태: **P6 actual Production cutover 증거 완료 / P7-G0 운영 인수 preflight 진행 / Production GO**',
    '상태: **P0~P7 실제 증거 완료 / Harness 8/8 COMPLETE / Production GO**');
  next = replaceOnce(next,
    '- P6 actual cutover 증거가 검증되어 `productionGo=true`다. 다음 READY는 `P7-G0-OPERATIONS-HANDOVER-PREFLIGHT`다.',
    '- P7 actual 운영 인수 10문서와 책임자 서명이 검증되어 `productionGo=true`이며 다음 READY는 없다.');
  next = replaceOnce(next,
    '현재 유일한 READY는 **P7-G0-OPERATIONS-HANDOVER-PREFLIGHT**다. P6 actual cutover 증거의 SHA와 운영 8영역·운영 책임자 인수 입력을 검증한다.',
    '현재 READY는 **NONE**이다. P0~P7이 실제 증거로 완료되어 장기 Goal 종료 조건을 충족했다.');
  return next;
}

export function evaluateP7Completion({ roadmap, queue, actualEvidence, actualEvidenceSha256, validation, execute = false, confirmation = null } = {}) {
  const failures = [];
  const p7 = roadmap?.phases?.find((phase) => phase.id === 'P7');
  if (roadmap?.currentPhase !== 'P7' || roadmap?.completedPhases !== 7 || p7?.status !== 'in-progress' || !p7?.readyWork) failures.push('P7_CURRENT_STATE_INVALID');
  if (roadmap?.invariants?.productionGo !== true) failures.push('PRODUCTION_GO_REQUIRED');
  if (queue?.currentPhase !== 'P7' || queue?.readyPacket !== 'ACC-P7-02-OPERATIONS-ACTIVATION-AND-SIGNOFF') failures.push('ACCELERATION_QUEUE_STATE_INVALID');
  if (validation?.p7CompletionReady !== true || validation?.status !== 'PASS_ACTUAL_OPERATIONS_HANDOVER_EVIDENCE') failures.push('ACTUAL_HANDOVER_VALIDATION_REQUIRED');
  if (actualEvidence?.environment !== 'production' || actualEvidence?.activationState !== 'actual' || actualEvidence?.template === true) failures.push('ACTUAL_HANDOVER_EVIDENCE_INVALID');
  if (!SHA256.test(actualEvidenceSha256 || '')) failures.push('ACTUAL_HANDOVER_EVIDENCE_SHA_INVALID');
  if (failures.length) return { status: 'FAIL_P7_COMPLETION_CONTRACT', failures: [...new Set(failures)], changesMade: false };
  if (!execute) return { status: 'PASS_P7_COMPLETION_DRY_RUN', failures: [], changesMade: false };
  if (confirmation !== P7_COMPLETION_CONFIRMATION) return { status: 'READY_WAIT_P7_COMPLETION_CONFIRMATION', failures: [], changesMade: false };

  const nextRoadmap = structuredClone(roadmap);
  const nextQueue = structuredClone(queue);
  const nextP7 = nextRoadmap.phases.find((phase) => phase.id === 'P7');
  nextRoadmap.completedPhases = 8;
  nextP7.status = 'evidence-complete';
  nextP7.readyWork = null;
  nextP7.completionEvidence = { date: new Date().toISOString().slice(0, 10), result: 'PASS_ACTUAL_OPERATIONS_HANDOVER', sha256: actualEvidenceSha256, verifiedDocumentCount: validation.verifiedDocumentCount };
  nextQueue.readyPacket = null;
  const packet = nextQueue.packets.find((item) => item.id === 'ACC-P7-02-OPERATIONS-ACTIVATION-AND-SIGNOFF');
  if (packet) { packet.status = 'EVIDENCE_COMPLETE'; packet.evidence = `actual operations handover manifest sha256:${actualEvidenceSha256}; ${validation.verifiedDocumentCount} documents verified`; }
  return { status: 'READY_APPLY_P7_COMPLETION', failures: [], nextRoadmap, nextQueue, changesMade: false };
}
