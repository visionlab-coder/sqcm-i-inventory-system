const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..', '..');

test('goal harness는 roadmap과 acceleration queue의 atomic bounded snapshot만 사용한다', () => {
  const source = fs.readFileSync(path.join(projectRoot, 'scripts', 'goal-harness.mjs'), 'utf8');

  assert.match(source, /readOperationsPhaseCompletionControlSnapshot/);
  assert.doesNotMatch(source, /JSON\.parse\(readFileSync\(roadmapPath/);
  assert.doesNotMatch(source, /JSON\.parse\(readFileSync\(accelerationQueuePath/);
  assert.doesNotMatch(source, /existsSync\(accelerationQueuePath\)/);
});

test('goal harness는 현재 P7 G1 READY에 비파괴 운영 검증 봉투를 등록한다', () => {
  const source = fs.readFileSync(path.join(projectRoot, 'scripts', 'goal-harness.mjs'), 'utf8');

  assert.match(
    source,
    /commandSets\['P7\/P7-G1-OPERATIONS-ACTIVATION-AND-SIGNOFF'\]\s*=\s*\r?\n\s*commandSets\['P7\/P7-G0-OPERATIONS-HANDOVER-PREFLIGHT'\]/
  );
});
