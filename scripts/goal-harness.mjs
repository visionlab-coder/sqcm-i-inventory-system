import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(scriptDir, '..');
const roadmapPath = path.join(projectDir, 'agent docs', 'harness', 'MASTER_ROADMAP.json');
const candidatePath = path.join(projectDir, 'agent docs', 'harness', 'P2_RELEASE_CANDIDATE.json');
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
  if (existsSync(candidatePath)) {
    const candidate = JSON.parse(readFileSync(candidatePath, 'utf8'));
    const contentFiles = candidate.files.filter((file) => file.sha256);
    if (candidate.candidateFileCount !== candidate.files.length) {
      errors.push('CANDIDATE_FILE_COUNT_MISMATCH');
    }
    if (candidate.hashedContentFileCount !== contentFiles.length) {
      errors.push('CANDIDATE_HASHED_COUNT_MISMATCH');
    }
    for (const file of contentFiles) {
      const absolutePath = path.join(projectDir, file.path);
      if (!existsSync(absolutePath)) {
        errors.push(`CANDIDATE_FILE_MISSING:${file.path}`);
        continue;
      }
      const actual = createHash('sha256').update(readFileSync(absolutePath)).digest('hex');
      if (actual !== file.sha256) errors.push(`CANDIDATE_HASH_MISMATCH:${file.path}`);
    }
    const canonical = contentFiles.map((file) => `${file.path}|${file.sha256}`).join('\n');
    const aggregate = createHash('sha256').update(canonical, 'utf8').digest('hex');
    if (aggregate !== candidate.candidateDigest) errors.push('CANDIDATE_DIGEST_MISMATCH');
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
  if (phase.id !== 'P2' || phase.readyWork.id !== 'P2-LOCAL-VERIFY') {
    console.error(`No autonomous verifier is registered for ${phase.id}/${phase.readyWork.id}.`);
    process.exitCode = 2;
    return;
  }

  const commands = [
    ['git-diff-check', 'git', ['diff', '--check']],
    ['quality', 'npm.cmd', ['run', 'check']],
    ['ui-contract', 'npm.cmd', ['run', 'ui:contract']],
    ['compose-contract', 'npm.cmd', ['run', 'compose:contract']],
    ['docker-health', 'docker', [
      'ps',
      '--filter', 'label=com.docker.compose.project=seowon-inventory-local',
      '--format', '{{json .}}'
    ], validateInventoryContainers]
  ];
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
