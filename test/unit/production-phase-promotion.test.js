const test = require('node:test');
const assert = require('node:assert/strict');
const modulePromise = import('../../src/operations/production-phase-promotion.mjs');

function inputs() {
  return {
    roadmap: {
      currentPhase: 'P6', completedPhases: 6, totalPhases: 8, invariants: { productionGo: false },
      phases: [
        { id: 'P6', status: 'in-progress', readyWork: { id: 'P6-G4' } },
        { id: 'P7', status: 'not-started', readyWork: null }
      ]
    },
    queue: { currentPhase: 'P6', readyPacket: 'ACC-P7-02-OPERATIONS-ACTIVATION-AND-SIGNOFF', rules: { productionGo: false } },
    actualEvidence: { status: 'PASS', evidenceType: 'P6_CUTOVER_ACTUAL', environment: 'production', activationState: 'actual', productionGo: true, checkedAt: '2026-09-11T12:30:00.000Z', runId: '11111111-1111-4111-8111-111111111111', releaseSha: 'a'.repeat(40), targetUrl: 'https://inventory.safe-link.co.kr' },
    actualEvidenceSha256: 'b'.repeat(64)
  };
}

test('dry-run은 P6/P7 상태를 변경하지 않는다', async () => {
  const { evaluateP6ToP7Promotion } = await modulePromise;
  const input = inputs();
  const before = JSON.stringify(input);
  const result = evaluateP6ToP7Promotion(input);
  assert.equal(result.status, 'PASS_P6_TO_P7_PROMOTION_DRY_RUN');
  assert.equal(result.changesMade, false);
  assert.equal(JSON.stringify(input), before);
});

test('actual evidence와 exact 확인 뒤에만 P6 완료·P7 진행 상태를 만든다', async () => {
  const { evaluateP6ToP7Promotion, P6_TO_P7_PROMOTION_CONFIRMATION } = await modulePromise;
  const result = evaluateP6ToP7Promotion({ ...inputs(), execute: true, confirmation: P6_TO_P7_PROMOTION_CONFIRMATION });
  assert.equal(result.status, 'READY_APPLY_P6_TO_P7_PROMOTION');
  assert.equal(result.nextRoadmap.currentPhase, 'P7');
  assert.equal(result.nextRoadmap.completedPhases, 7);
  assert.equal(result.nextRoadmap.invariants.productionGo, true);
  assert.equal(result.nextRoadmap.phases.find((phase) => phase.id === 'P6').status, 'evidence-complete');
  assert.equal(result.nextRoadmap.phases.find((phase) => phase.id === 'P7').readyWork.id, 'P7-G0-OPERATIONS-HANDOVER-PREFLIGHT');
  assert.equal(result.nextQueue.currentPhase, 'P7');
});

test('잘못된 현재 상태와 synthetic evidence를 fail-closed 한다', async () => {
  const { evaluateP6ToP7Promotion } = await modulePromise;
  const input = inputs();
  input.roadmap.completedPhases = 5;
  input.actualEvidence.activationState = 'synthetic';
  const result = evaluateP6ToP7Promotion({ ...input, execute: true });
  assert.equal(result.status, 'FAIL_P6_TO_P7_PROMOTION_CONTRACT');
  assert.match(result.failures.join(','), /P6_CURRENT_STATE_INVALID|ACTUAL_CUTOVER_EVIDENCE_INVALID/);
});

test('사람용 문서의 단일 상태 블록만 교체한다', async () => {
  const { renderHarnessStatusBlock, replaceHarnessStatusBlock } = await modulePromise;
  const initial = '# title\n<!-- HARNESS_STATUS_START -->\nold\n<!-- HARNESS_STATUS_END -->\nbody\n';
  const block = renderHarnessStatusBlock({ completedPhases: 7, totalPhases: 8, currentPhase: 'P7', productionGo: true, readyWork: 'P7-G0' });
  const result = replaceHarnessStatusBlock(initial, block);
  assert.match(result, /7 \/ 8 Phase 완료/);
  assert.match(result, /현재 Phase: \*\*P7\*\*/);
  assert.match(result, /body/);
  assert.throws(() => replaceHarnessStatusBlock('# no marker', block), /HARNESS_STATUS_BLOCK_INVALID/);
});

test('로드맵과 현재 상태의 모든 현재 판정 문구를 같은 사실로 승격한다', async () => {
  const { renderHarnessStatusBlock, promoteRoadmapDocument, promoteCurrentStateDocument } = await modulePromise;
  const block = renderHarnessStatusBlock({ completedPhases: 7, totalPhases: 8, currentPhase: 'P7', productionGo: true, readyWork: 'P7-G0-OPERATIONS-HANDOVER-PREFLIGHT' });
  const marker = '<!-- HARNESS_STATUS_START -->\nold\n<!-- HARNESS_STATUS_END -->';
  const roadmap = `${marker}\nP6["P6 Production 전환<br/>🔄 G2 Git·CI·이미지 PASS"]\nP7["P7 운영·유지보수 활성화<br/>⏳ 대기"]\n    class P6 active;\n    class P7 pending;\n진척도: **6 / 8 Phase 완료**\n현재 위치: **P6 Production 전환**\n다음 Phase: **P7 운영·유지보수 활성화** — P6 전환 증거 완료 전에는 시작하지 않는다.\n| P6 Production 전환 | 최종 승인, cutover, 관측·복구 확인 | 🔄 진행 중 |x\n| P7 운영·유지보수 활성화 | 백업, 경보, 온콜, 정기 점검, 개선 큐 | ⏳ 미착수 |x`;
  const current = `${marker}\n상태: **P5 staging UAT 19/19·서명 3/3 완료 / P6-G3 AI PC loopback Production 배포·복구 PASS / P6-G4 공개 전환 대기 / Production NO-GO**\n- 공개 DNS/TLS, 실제 Production 사용자 로그인·MFA, 최종 서명은 아직 없으므로 \`productionGo=false\`다. 다음 READY는 \`P6-G4-PRODUCTION-DNS-TLS-CUTOVER-AND-SIGNOFF\`다.\n현재 유일한 READY는 **P6-G4-PRODUCTION-DNS-TLS-CUTOVER-AND-SIGNOFF**다. 사전점검은 \`READY_WAIT_CHANGE_WINDOW\`이며 승인된 변경창 \`2026-09-11 20:00~23:00 KST\`에서 전용 Production tunnel·공개 DNS/TLS, 실제 사용자 로그인·MFA, 관측·최종 서명을 검증한다. 그 전까지 서비스는 \`127.0.0.1:3300\` 격리를 유지하며 Production은 \`NO-GO\`다.`;
  const promotedRoadmap = promoteRoadmapDocument(roadmap, block);
  const promotedCurrent = promoteCurrentStateDocument(current, block);
  assert.doesNotMatch(promotedRoadmap, /6 \/ 8|P6 active|P7 pending/);
  assert.match(promotedRoadmap, /7 \/ 8|P6 done|P7 active/);
  assert.doesNotMatch(promotedCurrent, /Production NO-GO|productionGo=false|P6-G4-PRODUCTION/);
  assert.match(promotedCurrent, /Production GO|productionGo=true|P7-G0-OPERATIONS/);
});
