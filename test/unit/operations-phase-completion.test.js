const test = require('node:test');
const assert = require('node:assert/strict');
const mod = import('../../src/operations/operations-phase-completion.mjs');

function inputs() {
  return {
    roadmap: { currentPhase: 'P7', completedPhases: 7, totalPhases: 8, invariants: { productionGo: true }, phases: [{ id: 'P7', status: 'in-progress', readyWork: { id: 'P7-G0' } }] },
    queue: { currentPhase: 'P7', readyPacket: 'ACC-P7-02-OPERATIONS-ACTIVATION-AND-SIGNOFF', packets: [{ id: 'ACC-P7-02-OPERATIONS-ACTIVATION-AND-SIGNOFF', status: 'READY' }] },
    actualEvidence: { schemaVersion: 2, template: false, environment: 'production', activationState: 'actual' },
    actualEvidenceSha256: 'a'.repeat(64), validation: { status: 'PASS_ACTUAL_OPERATIONS_HANDOVER_EVIDENCE', p7CompletionReady: true, verifiedDocumentCount: 10 }
  };
}

test('dry-run은 7/8 상태를 변경하지 않는다', async () => { const { evaluateP7Completion } = await mod; const i = inputs(); const before = JSON.stringify(i); const r = evaluateP7Completion(i); assert.equal(r.status, 'PASS_P7_COMPLETION_DRY_RUN'); assert.equal(JSON.stringify(i), before); });
test('실제 증거와 exact 확인으로만 8/8 terminal 상태를 만든다', async () => { const { evaluateP7Completion, P7_COMPLETION_CONFIRMATION } = await mod; const r = evaluateP7Completion({ ...inputs(), execute: true, confirmation: P7_COMPLETION_CONFIRMATION }); assert.equal(r.nextRoadmap.completedPhases, 8); assert.equal(r.nextRoadmap.phases[0].status, 'evidence-complete'); assert.equal(r.nextRoadmap.phases[0].readyWork, null); assert.equal(r.nextQueue.readyPacket, null); assert.equal(r.nextQueue.packets[0].status, 'EVIDENCE_COMPLETE'); });
test('synthetic 또는 검증되지 않은 증거는 거부한다', async () => { const { evaluateP7Completion } = await mod; const i = inputs(); i.actualEvidence.activationState = 'synthetic'; i.validation.p7CompletionReady = false; const r = evaluateP7Completion(i); assert.equal(r.status, 'FAIL_P7_COMPLETION_CONTRACT'); });
test('사람용 문서를 8/8 완료로 동기화한다', async () => { const { completeRoadmapDocument, completeCurrentStateDocument } = await mod; const marker='<!-- HARNESS_STATUS_START -->\nold\n<!-- HARNESS_STATUS_END -->'; const roadmap=`${marker}\nP7["P7 운영·유지보수 활성화<br/>🔄 G0 인수 preflight"]\n    class P7 active;\n진척도: **7 / 8 Phase 완료**\n현재 위치: **P7 운영·유지보수 활성화**\n다음 Gate: **P7-G0-OPERATIONS-HANDOVER-PREFLIGHT**\n| P7 운영·유지보수 활성화 | 백업, 경보, 온콜, 정기 점검, 개선 큐 | 🔄 진행 중 |x`; const current=`${marker}\n상태: **P6 actual Production cutover 증거 완료 / P7-G0 운영 인수 preflight 진행 / Production GO**\n- P6 actual cutover 증거가 검증되어 \`productionGo=true\`다. 다음 READY는 \`P7-G0-OPERATIONS-HANDOVER-PREFLIGHT\`다.\n현재 유일한 READY는 **P7-G0-OPERATIONS-HANDOVER-PREFLIGHT**다. P6 actual cutover 증거의 SHA와 운영 8영역·운영 책임자 인수 입력을 검증한다.`; assert.match(completeRoadmapDocument(roadmap), /8 \/ 8|P7 done|장기 Goal 완료/); assert.match(completeCurrentStateDocument(current), /8\/8 COMPLETE|READY는 \*\*NONE/); });
