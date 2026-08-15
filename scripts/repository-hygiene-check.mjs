import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const ignoredDirectories = new Set(['.git', 'node_modules', 'artifacts', 'coverage', 'dist', 'postgres-data']);
const ignoredFiles = new Set(['.env', '.env.production']);
const textExtensions = new Set(['.cjs', '.css', '.ejs', '.example', '.html', '.js', '.json', '.md', '.mjs', '.ps1', '.sql', '.txt', '.yaml', '.yml']);
const fixedCredentials = [
  ['Admin', '1234!'].join(''),
  ['Manager', '1234!'].join(''),
  ['Employee', '1234!'].join(''),
  ['postgres://seowon:', 'change-me', '@'].join(''),
  ['development-only-', 'change-this-secret-now'].join(''),
  ['secret-', 'not-logged'].join('')
];
const mockMetadata = [
  /생성 메타프롬프트/i,
  /공통 생성 프롬프트/i,
  /페이지별 프롬프트 변수/i,
  /built-in\s+imagegen/i,
  /generated\s+by/i,
  /prompt\s+metadata/i
];
const pngMetadataChunks = new Set(['tEXt', 'zTXt', 'iTXt', 'eXIf', 'caBX']);

function filesUnder(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...filesUnder(fullPath));
    else if (!ignoredFiles.has(entry.name)) files.push(fullPath);
  }
  return files;
}

function pngChunks(buffer) {
  const chunks = [];
  for (let offset = 8; offset + 12 <= buffer.length;) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    chunks.push(type);
    offset += 12 + length;
    if (type === 'IEND') break;
  }
  return chunks;
}

const failures = [];
let pngCount = 0;
for (const file of filesUnder(root)) {
  const relative = path.relative(root, file).replaceAll('\\', '/');
  const extension = path.extname(file).toLowerCase();
  if (extension === '.png' && relative.startsWith('mock/')) {
    pngCount += 1;
    const forbidden = pngChunks(fs.readFileSync(file)).filter(type => pngMetadataChunks.has(type));
    if (forbidden.length) failures.push(`${relative}: forbidden PNG metadata chunks ${forbidden.join(', ')}`);
    continue;
  }
  if (!textExtensions.has(extension) && !file.endsWith('.env.example')) continue;
  const text = fs.readFileSync(file, 'utf8');
  for (const credential of fixedCredentials) {
    if (text.includes(credential)) failures.push(`${relative}: fixed credential pattern`);
  }
  if (relative.startsWith('mock/')) {
    for (const pattern of mockMetadata) {
      if (pattern.test(text)) failures.push(`${relative}: exposed creation metadata (${pattern.source})`);
    }
  }
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log(JSON.stringify({ status: 'passed', fixedCredentialMatches: 0, mockMetadataMatches: 0, pngMetadataMatches: 0, mockPngCount: pngCount }));
