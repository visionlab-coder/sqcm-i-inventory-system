import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { evaluateHarnessBranchProvenance, resolveActiveBranch } from '../src/operations/harness-branch-provenance.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(scriptDir, '..');
const roadmapPath = path.join(projectDir, 'agent docs', 'harness', 'MASTER_ROADMAP.json');
const candidatePath = path.join(projectDir, 'agent docs', 'harness', 'P2_RELEASE_CANDIDATE.json');
const remoteEvidencePath = path.join(projectDir, 'agent docs', 'harness', 'P2_REMOTE_EVIDENCE.json');
const accelerationQueuePath = path.join(projectDir, 'agent docs', 'harness', 'P6_P7_ACCELERATION_QUEUE.json');
const state = JSON.parse(readFileSync(roadmapPath, 'utf8'));
const command = process.argv[2] ?? 'status';

function currentPhase() {
  return state.phases.find((phase) => phase.id === state.currentPhase);
}

function status() {
  const phase = currentPhase();
  console.log(JSON.stringify({
    status: 'ACTIVE',
    progress: `${state.completedPhases} / ${state.totalPhases}`,
    currentPhase: phase?.id ?? null,
    phaseName: phase?.name ?? null,
    readyWork: phase?.readyWork ?? null,
    productionGo: state.invariants.productionGo,
    changesMade: false
  }, null, 2));
}

function check() {
  const errors = [];
  const active = state.phases.filter((phase) => phase.status === 'in-progress');
  const completed = state.phases.filter((phase) => phase.status === 'evidence-complete');
  const phase = currentPhase();
  const symbolicRef = spawnSync('git', ['symbolic-ref', '--quiet', '--short', 'HEAD'], {
    cwd: projectDir,
    encoding: 'utf8',
    shell: false
  });
  const activeBranch = resolveActiveBranch({
    githubHeadRef: process.env.GITHUB_HEAD_REF,
    githubRefName: process.env.GITHUB_REF_NAME,
    symbolicRef: symbolicRef.status === 0 ? symbolicRef.stdout : ''
  });
  const branchProvenance = evaluateHarnessBranchProvenance({
    roadmapBranch: state.branch,
    activeBranch
  });

  if (!branchProvenance.ok) errors.push(branchProvenance.error);
  if (active.length !== 1) errors.push(`IN_PROGRESS_COUNT_${active.length}`);
  if (!phase) errors.push('CURRENT_PHASE_MISSING');
  if (phase && phase.status !== 'in-progress') errors.push('CURRENT_PHASE_NOT_IN_PROGRESS');
  if (phase && !phase.readyWork) errors.push('READY_WORK_MISSING');
  if (completed.length !== state.completedPhases) errors.push('COMPLETED_COUNT_MISMATCH');
  if (state.totalPhases !== state.phases.length) errors.push('TOTAL_COUNT_MISMATCH');
  if (state.invariants.dockerServices.join(',') !== 'frontend,backend,database') {
    errors.push('DOCKER_SERVICE_INVARIANT_CHANGED');
  }
  if (state.invariants.protectedPorts.join(',') !== '1234,11434,18765') {
    errors.push('PROTECTED_PORT_INVARIANT_CHANGED');
  }
  if (state.authority.commitPushMergeRelease !== 'explicit-approval') {
    errors.push('EXTERNAL_GIT_APPROVAL_BOUNDARY_CHANGED');
  }
  if (!existsSync(accelerationQueuePath)) {
    errors.push('ACCELERATION_QUEUE_MISSING');
  } else {
    const queue = JSON.parse(readFileSync(accelerationQueuePath, 'utf8'));
    const readyPackets = queue.packets?.filter((packet) => packet.status === 'READY') ?? [];
    if (readyPackets.length !== 1) errors.push(`ACCELERATION_READY_COUNT_${readyPackets.length}`);
    if (readyPackets[0]?.id !== queue.readyPacket) errors.push('ACCELERATION_READY_POINTER_MISMATCH');
    if (queue.rules?.waitingIsFailure !== false) errors.push('WAITING_MUST_NOT_COUNT_AS_FAILURE');
    if (queue.rules?.alternateAfterFailureCount !== 2 || queue.rules?.stopAfterSameFailureCount !== 3) {
      errors.push('ALTERNATE_RETRY_LADDER_CHANGED');
    }
    if (queue.rules?.p7ActivationBeforeP6Complete !== false || queue.rules?.productionGo !== false) {
      errors.push('ACCELERATION_QUEUE_FAIL_CLOSED_CHANGED');
    }
    const p7 = state.phases.find((item) => item.id === 'P7');
    if (state.currentPhase === 'P6' && p7?.status !== 'not-started') {
      errors.push('P7_ACTIVATED_BEFORE_P6_COMPLETE');
    }
  }
  if (existsSync(candidatePath)) {
    const candidate = JSON.parse(readFileSync(candidatePath, 'utf8'));
    const remoteEvidence = existsSync(remoteEvidencePath)
      ? JSON.parse(readFileSync(remoteEvidencePath, 'utf8'))
      : null;
    const contentFiles = candidate.files.filter((file) => file.sha256);
    if (candidate.candidateFileCount !== candidate.files.length) {
      errors.push('CANDIDATE_FILE_COUNT_MISMATCH');
    }
    if (candidate.hashedContentFileCount !== contentFiles.length) {
      errors.push('CANDIDATE_HASHED_COUNT_MISMATCH');
    }
    if (remoteEvidence?.commit) {
      const changed = spawnSync('git', [
        '-c', 'core.quotepath=false',
        'diff-tree', '--no-commit-id', '--name-only', '-r', remoteEvidence.commit
      ], { cwd: projectDir, encoding: 'utf8', shell: false });
      const parent = spawnSync('git', ['rev-parse', `${remoteEvidence.commit}^`], {
        cwd: projectDir, encoding: 'utf8', shell: false
      });
      const expectedPaths = candidate.files.map((file) => file.path).sort();
      const actualPaths = changed.stdout.trim().split(/\r?\n/).filter(Boolean).sort();
      if (changed.status !== 0 || JSON.stringify(actualPaths) !== JSON.stringify(expectedPaths)) {
        errors.push('REMOTE_COMMIT_ALLOWLIST_MISMATCH');
      }
      if (parent.status !== 0 || parent.stdout.trim() !== candidate.baseSha) {
        errors.push('REMOTE_COMMIT_PARENT_MISMATCH');
      }
    } else {
      for (const file of contentFiles) {
        const absolutePath = path.join(projectDir, file.path);
        if (!existsSync(absolutePath)) {
          errors.push(`CANDIDATE_FILE_MISSING:${file.path}`);
          continue;
        }
        const actual = createHash('sha256').update(readFileSync(absolutePath)).digest('hex');
        if (actual !== file.sha256) errors.push(`CANDIDATE_HASH_MISMATCH:${file.path}`);
      }
    }
    const canonical = contentFiles.map((file) => `${file.path}|${file.sha256}`).join('\n');
    const aggregate = createHash('sha256').update(canonical, 'utf8').digest('hex');
    if (aggregate !== candidate.candidateDigest) errors.push('CANDIDATE_DIGEST_MISMATCH');
    if (remoteEvidence) {
      if (remoteEvidence.candidateCommit && remoteEvidence.candidateCommit !== remoteEvidence.commit) {
        errors.push('REMOTE_CANDIDATE_COMMIT_MISMATCH');
      }
      if (remoteEvidence.pullRequest?.state === 'open' && remoteEvidence.pullRequest?.draft !== true) {
        errors.push('REMOTE_OPEN_PR_NOT_DRAFT');
      }
      if (remoteEvidence.pullRequest?.merged === true && !remoteEvidence.pullRequest?.mergeSha) {
        errors.push('REMOTE_MERGE_SHA_MISSING');
      }
      if (!remoteEvidence.workflow?.jobs?.every((job) => job.conclusion === 'success')) {
        errors.push('REMOTE_CI_NOT_GREEN');
      }
      if (remoteEvidence.mainRelease) {
        const release = remoteEvidence.mainRelease;
        const digestPattern = /^sha256:[a-f0-9]{64}$/;
        if (release.mainSha !== remoteEvidence.pullRequest?.mergeSha) errors.push('MAIN_RELEASE_SHA_MISMATCH');
        if (!release.workflows?.every((workflow) => workflow.conclusion === 'success')) {
          errors.push('MAIN_WORKFLOW_NOT_GREEN');
        }
        if (!digestPattern.test(release.images?.backend?.digest ?? '')
          || !digestPattern.test(release.images?.frontend?.digest ?? '')
          || release.images.backend.digest === release.images.frontend.digest) {
          errors.push('MAIN_IMAGE_DIGEST_INVALID');
        }
      }
    }
  }

  console.log(JSON.stringify({
    status: errors.length === 0 ? 'PASS' : 'FAIL',
    errors,
    currentPhase: state.currentPhase,
    completedPhases: completed.length,
    readyWork: phase?.readyWork?.id ?? null
  }, null, 2));
  process.exitCode = errors.length === 0 ? 0 : 1;
}

function run(label, executable, args, validateOutput = null) {
  console.log(`\n[${label}] ${executable} ${args.join(' ')}`);
  const windowsCommand = process.platform === 'win32' && executable.endsWith('.cmd');
  const actualExecutable = windowsCommand ? 'cmd.exe' : executable;
  const actualArgs = windowsCommand ? ['/d', '/s', '/c', executable, ...args] : args;
  const result = spawnSync(actualExecutable, actualArgs, {
    cwd: projectDir,
    encoding: 'utf8',
    shell: false
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  let exitCode = result.status ?? 1;
  if (exitCode === 0 && validateOutput) {
    const validation = validateOutput(result.stdout ?? '');
    if (!validation.pass) {
      console.error(validation.error);
      exitCode = 1;
    }
  }
  return { label, exitCode };
}

function validateInventoryContainers(output) {
  const containers = output.trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
  const expected = ['backend', 'database', 'frontend'];
  const actual = containers.map((container) => container.Labels
    .split(',')
    .find((label) => label.startsWith('com.docker.compose.service='))
    ?.split('=')[1])
    .filter(Boolean)
    .sort();
  const healthy = containers.every((container) => container.State === 'running'
    && container.HealthStatus === 'healthy');
  const pass = JSON.stringify(actual) === JSON.stringify(expected) && healthy;
  return {
    pass,
    error: pass ? null : `Docker health mismatch: expected ${expected.join(',')} healthy; actual ${actual.join(',') || 'none'}`
  };
}

function verify() {
  check();
  if (process.exitCode) return;
  const phase = currentPhase();
  const verifierKey = `${phase.id}/${phase.readyWork.id}`;
  const commandSets = {
    'P2/P2-LOCAL-VERIFY': [
      ['git-diff-check', 'git', ['diff', '--check']],
      ['quality', 'npm.cmd', ['run', 'check']],
      ['ui-contract', 'npm.cmd', ['run', 'ui:contract']],
      ['compose-contract', 'npm.cmd', ['run', 'compose:contract']],
      ['docker-health', 'docker', [
        'ps',
        '--filter', 'label=com.docker.compose.project=seowon-inventory-local',
        '--format', '{{json .}}'
      ], validateInventoryContainers]
    ],
    'P5/P5-G0-STAGING-UAT-PREFLIGHT': [
      ['git-diff-check', 'git', ['diff', '--check']],
      ['operations-contracts', 'npm.cmd', ['run', 'operations:contracts']],
      ['staging-provider-preflight', 'npm.cmd', [
        'run', 'operations:preflight', '--',
        'config/operations.manifest.staging.candidate.json', '--probe'
      ]],
      ['repository-hygiene', 'npm.cmd', ['run', 'repository:hygiene']],
      ['docker-health-staging', 'docker', [
        'ps',
        '--filter', 'label=com.docker.compose.project=seowon-inventory-staging',
        '--format', '{{json .}}'
      ], validateInventoryContainers]
    ],
    'P6/P6-G1-PRODUCTION-TARGET-CHANGE-WINDOW-AND-PROVIDER-INPUT': [
      ['git-diff-check', 'git', ['diff', '--check']],
      ['quality', 'npm.cmd', ['run', 'check']],
      ['postgres-production-contract', 'npm.cmd', ['run', 'postgres:contract']],
      ['compose-contract', 'npm.cmd', ['run', 'compose:contract']],
      ['ui-contract', 'npm.cmd', ['run', 'ui:contract']],
      ['docker-health-staging', 'docker', [
        'ps',
        '--filter', 'label=com.docker.compose.project=seowon-inventory-staging',
        '--format', '{{json .}}'
      ], validateInventoryContainers]
    ],
    'P6/P6-G1-OCI-ACCOUNT-SEOUL-HOME-REGION-AND-BILLING-GUARD': [
      ['git-diff-check', 'git', ['diff', '--check']],
      ['quality', 'npm.cmd', ['run', 'check']],
      ['postgres-production-contract', 'npm.cmd', ['run', 'postgres:contract']],
      ['compose-contract', 'npm.cmd', ['run', 'compose:contract']],
      ['ui-contract', 'npm.cmd', ['run', 'ui:contract']],
      ['docker-health-staging', 'docker', [
        'ps',
        '--filter', 'label=com.docker.compose.project=seowon-inventory-staging',
        '--format', '{{json .}}'
      ], validateInventoryContainers]
    ],
    'P6/P6-G1-AI-PC-LOCAL-PRODUCTION-TOPOLOGY-AND-CAPACITY-PREFLIGHT': [
      ['git-diff-check', 'git', ['diff', '--check']],
      ['quality', 'npm.cmd', ['run', 'check']],
      ['postgres-production-contract', 'npm.cmd', ['run', 'postgres:contract']],
      ['ai-pc-production-contract', 'npm.cmd', ['run', 'ai-pc:production-contract']],
      ['compose-contract', 'npm.cmd', ['run', 'compose:contract']],
      ['ui-contract', 'npm.cmd', ['run', 'ui:contract']],
      ['docker-health-staging', 'docker', [
        'ps',
        '--filter', 'label=com.docker.compose.project=seowon-inventory-staging',
        '--format', '{{json .}}'
      ], validateInventoryContainers]
    ],
    'P6/P6-G2-RELEASE-CANDIDATE-GIT-CI-AND-IMMUTABLE-IMAGES': [
      ['git-diff-check', 'git', ['diff', '--check']],
      ['quality', 'npm.cmd', ['run', 'check']],
      ['postgres-production-contract', 'npm.cmd', ['run', 'postgres:contract']],
      ['ai-pc-production-contract', 'npm.cmd', ['run', 'ai-pc:production-contract']],
      ['compose-contract', 'npm.cmd', ['run', 'compose:contract']],
      ['ui-contract', 'npm.cmd', ['run', 'ui:contract']],
      ['docker-health-staging', 'docker', [
        'ps',
        '--filter', 'label=com.docker.compose.project=seowon-inventory-staging',
        '--format', '{{json .}}'
      ], validateInventoryContainers]
    ],
    'P6/P6-G3-AI-PC-PRODUCTION-SECRETS-MIGRATION-DEPLOY-AND-ROLLBACK': [
      ['git-diff-check', 'git', ['diff', '--check']],
      ['quality', 'npm.cmd', ['run', 'check']],
      ['postgres-production-contract', 'npm.cmd', ['run', 'postgres:contract']],
      ['ai-pc-production-contract', 'npm.cmd', ['run', 'ai-pc:production-contract']],
      ['compose-contract', 'npm.cmd', ['run', 'compose:contract']],
      ['ui-contract', 'npm.cmd', ['run', 'ui:contract']],
      ['docker-health-staging', 'docker', [
        'ps',
        '--filter', 'label=com.docker.compose.project=seowon-inventory-staging',
        '--format', '{{json .}}'
      ], validateInventoryContainers]
    ],
    'P6/P6-G4-PRODUCTION-DNS-TLS-CUTOVER-AND-SIGNOFF': [
      ['git-diff-check', 'git', ['diff', '--check']],
      ['quality', 'npm.cmd', ['run', 'check']],
      ['postgres-production-contract', 'npm.cmd', ['run', 'postgres:contract']],
      ['ai-pc-production-contract', 'npm.cmd', ['run', 'ai-pc:production-contract']],
      ['compose-contract', 'npm.cmd', ['run', 'compose:contract']],
      ['ui-contract', 'npm.cmd', ['run', 'ui:contract']],
      ['docker-health-staging', 'docker', [
        'ps',
        '--filter', 'label=com.docker.compose.project=seowon-inventory-staging',
        '--format', '{{json .}}'
      ], validateInventoryContainers],
      ['docker-health-production', 'docker', [
        'ps',
        '--filter', 'label=com.docker.compose.project=seowon-inventory-production',
        '--format', '{{json .}}'
      ], validateInventoryContainers],
      ['production-cutover-preflight', 'npm.cmd', ['run', 'production:cutover-preflight']],
      ['production-cutover-orchestrator', 'npm.cmd', ['run', 'production:cutover-orchestrator']],
      ['production-ingress-publication', 'npm.cmd', ['run', 'production:ingress-publication']],
      ['production-provider-preflight', 'npm.cmd', ['run', 'production:provider-preflight']],
      ['production-public-probe', 'npm.cmd', ['run', 'production:public-probe']],
      ['production-log-gate', 'npm.cmd', ['run', 'production:log-gate']],
      ['production-role-preflight', 'npm.cmd', ['run', 'production:role-preflight']],
      ['production-uat-actor-provision', 'npm.cmd', ['run', 'production:uat-actor-provision']],
      ['production-role-core-smoke', 'npm.cmd', ['run', 'production:role-core-smoke']],
      ['production-nonfunctional-baseline', 'npm.cmd', ['run', 'production:nonfunctional-baseline']],
      ['production-operational-health-baseline', 'npm.cmd', ['run', 'production:operational-health-baseline']],
      ['production-csrf-idempotency-baseline', 'npm.cmd', ['run', 'production:csrf-idempotency-baseline']],
      ['production-authenticated-idempotency', 'npm.cmd', ['run', 'production:authenticated-idempotency']],
      ['production-rollback-readiness', 'npm.cmd', ['run', 'production:rollback-readiness']],
      ['production-route-disable', 'npm.cmd', ['run', 'production:route-disable']],
      ['production-signoff-preflight', 'npm.cmd', ['run', 'production:signoff-preflight']],
      ['production-cutover-evidence', 'npm.cmd', ['run', 'production:cutover-evidence']],
      ['production-cutover-finalizer', 'npm.cmd', ['run', 'production:cutover-finalizer']],
      ['operations-handover-preflight', 'npm.cmd', ['run', 'operations:handover-preflight']],
      ['operations-slo-evidence', 'npm.cmd', ['run', 'operations:slo-evidence']],
      ['operations-alerting-evidence', 'npm.cmd', ['run', 'operations:alerting-evidence']],
      ['operations-backup-restore-evidence', 'npm.cmd', ['run', 'operations:backup-restore-evidence']],
      ['operations-certificate-evidence', 'npm.cmd', ['run', 'operations:certificate-evidence']],
      ['operations-oncall-evidence', 'npm.cmd', ['run', 'operations:oncall-evidence']],
      ['operations-maintenance-evidence', 'npm.cmd', ['run', 'operations:maintenance-evidence']],
      ['operations-improvement-queue-evidence', 'npm.cmd', ['run', 'operations:improvement-queue-evidence']],
      ['operations-signoff-evidence', 'npm.cmd', ['run', 'operations:signoff-evidence']],
      ['operations-handover-assembler', 'npm.cmd', ['run', 'operations:handover-assembler']],
      ['operations-handover-finalizer', 'npm.cmd', ['run', 'operations:handover-finalizer']]
    ]
  };
  const commands = commandSets[verifierKey];
  if (!commands) {
    console.error(`No autonomous verifier is registered for ${phase.id}/${phase.readyWork.id}.`);
    process.exitCode = 2;
    return;
  }
  const results = commands.map(([label, executable, args, validator]) => run(label, executable, args, validator));
  const failed = results.filter((result) => result.exitCode !== 0);
  console.log(`\n${JSON.stringify({
    status: failed.length === 0 ? 'PASS' : 'FAIL',
    phase: phase.id,
    readyWork: phase.readyWork.id,
    results,
    changesMade: false,
    nextGate: failed.length === 0 ? phase.readyWork.nextGate : 'FIX_LOCAL_VERIFICATION_FAILURE'
  }, null, 2)}`);
  process.exitCode = failed.length === 0 ? 0 : 1;
}

if (command === 'status') status();
else if (command === 'check') check();
else if (command === 'verify') verify();
else {
  console.error('Usage: node scripts/goal-harness.mjs [status|check|verify]');
  process.exitCode = 64;
}
