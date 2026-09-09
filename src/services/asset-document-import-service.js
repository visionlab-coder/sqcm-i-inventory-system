const crypto = require('node:crypto');
const path = require('node:path');
const { unzipSync } = require('fflate');
const { DomainError } = require('./inventory-service');
const { requirePermission } = require('./enterprise-service');
const { analyzeAssetImport, commitAssetImport, parseCsv, safeSpreadsheetCsvCell } = require('./asset-import-service');

const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
const MAX_ARCHIVE_BYTES = 20 * 1024 * 1024;
const MAX_ARCHIVE_ENTRIES = 100;
const MAX_ZIP_IMPORT_FILES = 10;
const MACRO_EXTENSIONS = new Set(['.docm', '.xlsm', '.pptm']);
const DIRECT_EXTENSIONS = new Set(['.csv', '.txt', '.md', '.xlsx', '.docx', '.pptx', '.hwpx']);
const OCR_EXTENSIONS = new Set(['.pdf', '.jpg', '.jpeg', '.png', '.doc', '.xls', '.ppt', '.hwp']);
const SUPPORTED_EXTENSIONS = new Set([...DIRECT_EXTENSIONS, ...OCR_EXTENSIONS, '.zip']);

function documentError(message, status = 400, code = 'ASSET_DOCUMENT_IMPORT_INVALID') {
  const error = new DomainError(message, status);
  error.code = code;
  return error;
}

function decodedFileName(value) {
  let decoded;
  try { decoded = decodeURIComponent(String(value || '')); } catch { decoded = String(value || ''); }
  const name = path.basename(decoded.replace(/[\u0000-\u001f\u007f]/g, '').trim()).slice(0, 255);
  if (!name) throw documentError('원본 파일명이 필요합니다.');
  return name;
}

function xmlText(value) {
  return String(value || '')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&amp;/g, '&').replace(/&#(\d+);/g, (_m, n) => String.fromCodePoint(Number(n)))
    .trim();
}

function csvFromRows(rows) {
  const normalized = rows.map(row => row.map(value => String(value ?? '').trim()));
  while (normalized.length && normalized.at(-1).every(value => !value)) normalized.pop();
  if (normalized.length < 2) throw documentError('자산 표의 헤더와 데이터 1행 이상을 찾지 못했습니다.');
  return normalized.map(row => row.map(safeSpreadsheetCsvCell).join(',')).join('\r\n');
}

function rowsFromText(content, extension) {
  const text = content.toString('utf8').replace(/^\uFEFF/, '');
  if (!text.trim() || text.includes('\0')) throw documentError('텍스트 파일이 비어 있거나 허용되지 않는 문자를 포함합니다.');
  if (extension === '.csv') return parseCsv(text);
  const lines = text.split(/\r?\n/).filter(line => line.trim());
  if (extension === '.md') {
    const table = lines.filter(line => line.includes('|')).map(line => line.trim().replace(/^\||\|$/g, '').split('|').map(cell => cell.trim()));
    const rows = table.filter((row, index) => index !== 1 || !row.every(cell => /^:?-{3,}:?$/.test(cell)));
    if (rows.length >= 2) return rows;
  }
  const delimiter = lines[0]?.includes('\t') ? '\t' : lines[0]?.includes(',') ? ',' : null;
  if (!delimiter) throw documentError('TXT/MD 파일에는 탭, 쉼표 또는 Markdown 표 형식의 자산 목록이 필요합니다.');
  return delimiter === ',' ? parseCsv(text) : lines.map(line => line.split('\t'));
}

function inspectZip(buffer) {
  let offset = 0; let entries = 0; let total = 0;
  while (offset <= buffer.length - 46) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) { offset += 1; continue; }
    const flags = buffer.readUInt16LE(offset + 8);
    const compressed = buffer.readUInt32LE(offset + 20);
    const expanded = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const name = buffer.subarray(offset + 46, offset + 46 + nameLength).toString('utf8').replaceAll('\\', '/');
    entries += 1; total += expanded;
    if (flags & 1) throw documentError('암호화된 압축 파일은 처리할 수 없습니다. 암호를 제거한 사본을 사용하세요.');
    if (name.startsWith('/') || name.split('/').includes('..')) throw documentError('압축 파일에 안전하지 않은 경로가 있습니다.');
    if (expanded > MAX_DOCUMENT_BYTES || total > MAX_ARCHIVE_BYTES) throw documentError('압축 해제 크기가 안전 한도를 초과합니다.', 413);
    if (compressed > 0 && expanded / compressed > 200) throw documentError('비정상적으로 높은 압축률의 파일은 처리하지 않습니다.');
    if (entries > MAX_ARCHIVE_ENTRIES) throw documentError('압축 파일 항목 수가 안전 한도를 초과합니다.', 413);
    offset += 46 + nameLength + extraLength + commentLength;
  }
  if (!entries) throw documentError('올바른 ZIP/OOXML 파일이 아닙니다.');
  return { entries, expandedBytes: total };
}

function unzipChecked(buffer) {
  const inspection = inspectZip(buffer);
  const files = unzipSync(new Uint8Array(buffer));
  return { inspection, files: Object.fromEntries(Object.entries(files).map(([name, value]) => [name.replaceAll('\\', '/'), Buffer.from(value)])) };
}

function tableRows(xml, rowName, cellName, textName) {
  const rows = [];
  const rowPattern = new RegExp(`<(?:\\w+:)?${rowName}\\b[^>]*>([\\s\\S]*?)<\\/(?:\\w+:)?${rowName}>`, 'gi');
  const cellPatternSource = `<(?:\\w+:)?${cellName}\\b[^>]*>([\\s\\S]*?)<\\/(?:\\w+:)?${cellName}>`;
  const textPatternSource = `<(?:\\w+:)?${textName}\\b[^>]*>([\\s\\S]*?)<\\/(?:\\w+:)?${textName}>`;
  for (const rowMatch of xml.matchAll(rowPattern)) {
    const cells = [];
    for (const cellMatch of rowMatch[1].matchAll(new RegExp(cellPatternSource, 'gi'))) {
      const parts = [...cellMatch[1].matchAll(new RegExp(textPatternSource, 'gi'))].map(match => xmlText(match[1]));
      cells.push(parts.join(' ').trim());
    }
    if (cells.some(Boolean)) rows.push(cells);
  }
  return rows;
}

function xlsxRows(files) {
  const shared = files['xl/sharedStrings.xml']
    ? [...files['xl/sharedStrings.xml'].toString('utf8').matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/gi)].map(match => xmlText(match[1]))
    : [];
  const sheetName = Object.keys(files).filter(name => /^xl\/worksheets\/sheet\d+\.xml$/i.test(name)).sort()[0];
  if (!sheetName) throw documentError('Excel 파일에서 worksheet를 찾지 못했습니다.');
  const stylesXml = files['xl/styles.xml']?.toString('utf8') || '';
  const customDateIds = new Set([...stylesXml.matchAll(/<numFmt\b[^>]*numFmtId="(\d+)"[^>]*formatCode="([^"]+)"/gi)]
    .filter(match => /[ymdhs]/i.test(match[2].replace(/\[[^\]]+\]/g, ''))).map(match => Number(match[1])));
  const dateFormatIds = new Set([14,15,16,17,18,19,20,21,22,45,46,47,...customDateIds]);
  const styleFormats = [...(stylesXml.match(/<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/i)?.[1] || '').matchAll(/<xf\b([^>]*)\/?>(?:<\/xf>)?/gi)]
    .map(match => Number(/\bnumFmtId="(\d+)"/i.exec(match[1])?.[1] || 0));
  const xml = files[sheetName].toString('utf8'); const rows = [];
  for (const rowMatch of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/gi)) {
    const row = [];
    for (const cellMatch of rowMatch[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/gi)) {
      const ref = /\br="([A-Z]+)\d+"/i.exec(cellMatch[1])?.[1] || '';
      let column = 0; for (const char of ref.toUpperCase()) column = column * 26 + char.charCodeAt(0) - 64;
      const type = /\bt="([^"]+)"/i.exec(cellMatch[1])?.[1]; const style = Number(/\bs="(\d+)"/i.exec(cellMatch[1])?.[1] || 0);
      const raw = /<v\b[^>]*>([\s\S]*?)<\/v>/i.exec(cellMatch[2])?.[1];
      const inline = /<is\b[^>]*>([\s\S]*?)<\/is>/i.exec(cellMatch[2])?.[1];
      let value = type === 's' ? shared[Number(raw)] ?? '' : type === 'inlineStr' ? xmlText(inline) : xmlText(raw);
      if (!type && raw && dateFormatIds.has(styleFormats[style]) && Number.isFinite(Number(raw))) {
        const date = new Date((Number(raw) - 25569) * 86400000);
        if (!Number.isNaN(date.getTime())) value = date.toISOString().slice(0, 10);
      }
      row[Math.max(0, column - 1)] = value;
    }
    if (row.some(Boolean)) rows.push(Array.from({ length: row.length }, (_value, index) => row[index] ?? ''));
  }
  return rows;
}

function rowsFromOoxml(content, extension) {
  const { files } = unzipChecked(content);
  if (extension === '.xlsx') return xlsxRows(files);
  if (extension === '.docx') {
    const xml = files['word/document.xml']?.toString('utf8');
    if (!xml) throw documentError('Word 본문을 찾지 못했습니다.');
    return tableRows(xml, 'tr', 'tc', 't');
  }
  if (extension === '.pptx') {
    const rows = [];
    for (const name of Object.keys(files).filter(value => /^ppt\/slides\/slide\d+\.xml$/i.test(value)).sort()) rows.push(...tableRows(files[name].toString('utf8'), 'tr', 'tc', 't'));
    return rows;
  }
  const rows = [];
  for (const name of Object.keys(files).filter(value => /^Contents\/section\d+\.xml$/i.test(value)).sort()) rows.push(...tableRows(files[name].toString('utf8'), 'tr', 'tc', 't'));
  return rows;
}

function rowsFromAi(result) {
  const source = result?.rows || result?.fields?.assets || result?.fields?.rows;
  if (!Array.isArray(source) || !source.length) throw documentError('문서 인식 결과에서 자산 행을 찾지 못했습니다.', 422, 'ASSET_DOCUMENT_OCR_NO_ASSETS');
  const headers = ['자산번호','자산명','제조번호','상태','부서코드','위치코드','분류코드','취득일','취득금액'];
  const keys = ['assetTag','name','serialNo','statusCode','departmentCode','locationCode','categoryCode','acquiredAt','acquisitionCost'];
  return [headers, ...source.map(row => keys.map(key => row?.[key] ?? ''))];
}

async function convertOne({ content, extension, originalName, contentType, aiProvider, organizationId = null, depth = 0 }) {
  if (DIRECT_EXTENSIONS.has(extension)) {
    const rows = ['.csv','.txt','.md'].includes(extension) ? rowsFromText(content, extension) : rowsFromOoxml(content, extension);
    return { rows, extraction: 'DETERMINISTIC' };
  }
  if (OCR_EXTENSIONS.has(extension)) {
    if (!aiProvider?.ocr || typeof aiProvider.ocr.extract !== 'function') throw documentError('이 형식은 OCR/문서 인식 공급자 연결이 필요합니다.', 503, 'ASSET_DOCUMENT_OCR_NOT_CONFIGURED');
    const result = await aiProvider.ocr.extract({ organizationId, contentBase64: content.toString('base64'), contentType, originalName, schema: 'asset-import-v1' });
    return { rows: rowsFromAi(result), extraction: 'OCR_STRUCTURED' };
  }
  if (extension === '.zip') {
    if (depth > 0) throw documentError('중첩 ZIP 파일은 처리하지 않습니다.');
    const { files } = unzipChecked(content);
    const candidates = Object.entries(files).filter(([name, value]) => value.length && SUPPORTED_EXTENSIONS.has(path.extname(name).toLowerCase()) && path.extname(name).toLowerCase() !== '.zip');
    if (!candidates.length || candidates.length > MAX_ZIP_IMPORT_FILES) throw documentError(`ZIP에는 지원 파일이 1~${MAX_ZIP_IMPORT_FILES}개 있어야 합니다.`);
    let header = null; const combined = [];
    for (const [name, value] of candidates) {
      const result = await convertOne({ content: value, extension: path.extname(name).toLowerCase(), originalName: name, contentType: 'application/octet-stream', aiProvider, organizationId, depth: depth + 1 });
      const [nextHeader, ...data] = result.rows;
      if (!header) header = nextHeader;
      else if (nextHeader.map(String).join('\u001f') !== header.map(String).join('\u001f')) throw documentError('ZIP 안의 자산표 헤더가 서로 다릅니다. 같은 템플릿으로 맞추세요.');
      combined.push(...data);
    }
    return { rows: [header, ...combined], extraction: 'ARCHIVE_COMBINED' };
  }
  throw documentError('지원하지 않는 파일 형식입니다.', 415);
}

function validateSource(content, originalName) {
  if (!Buffer.isBuffer(content) || !content.length) throw documentError('업로드할 파일이 비어 있습니다.');
  if (content.length > MAX_DOCUMENT_BYTES) throw documentError('파일은 10 MiB 이하여야 합니다.', 413);
  const extension = path.extname(originalName).toLowerCase();
  if (MACRO_EXTENSIONS.has(extension)) throw documentError('매크로 포함 Office 파일은 보안상 처리하지 않습니다.', 415);
  if (!SUPPORTED_EXTENSIONS.has(extension)) throw documentError('지원 형식: CSV, TXT, MD, XLS/XLSX, DOC/DOCX, HWP/HWPX, PPT/PPTX, PDF, JPG/JPEG, PNG, ZIP', 415);
  const zipLike = ['.xlsx','.docx','.pptx','.hwpx','.zip'].includes(extension);
  if (zipLike && !(content[0] === 0x50 && content[1] === 0x4b)) throw documentError('파일 확장자와 실제 ZIP/OOXML 내용이 일치하지 않습니다.');
  if (extension === '.pdf' && content.subarray(0, 5).toString('ascii') !== '%PDF-') throw documentError('PDF 확장자와 실제 내용이 일치하지 않습니다.');
  if (['.jpg','.jpeg'].includes(extension) && !(content[0] === 0xff && content[1] === 0xd8 && content[2] === 0xff)) throw documentError('JPEG 확장자와 실제 내용이 일치하지 않습니다.');
  if (extension === '.png' && !content.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) throw documentError('PNG 확장자와 실제 내용이 일치하지 않습니다.');
  if (['.doc','.xls','.ppt','.hwp'].includes(extension) && !content.subarray(0, 8).equals(Buffer.from([0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1]))) throw documentError('레거시 문서 확장자와 실제 OLE 내용이 일치하지 않습니다.');
  return extension;
}

async function analyzeAssetDocument({ db, user, content, contentType, originalName, malwareScanner, aiProvider }) {
  requirePermission(user, 'asset.create');
  const name = decodedFileName(originalName);
  const extension = validateSource(content, name);
  const scan = await malwareScanner.scan(content, { contentType, originalName: name });
  if (scan?.status !== 'clean') throw documentError('악성코드 검사에서 안전한 파일로 확인되지 않았습니다.', 422, 'ASSET_DOCUMENT_SCAN_REJECTED');
  const converted = await convertOne({ content, extension, originalName: name, contentType, aiProvider, organizationId: user.organizationId });
  const csv = csvFromRows(converted.rows);
  const preview = await analyzeAssetImport(db, user, csv);
  return {
    sourceChecksum: crypto.createHash('sha256').update(content).digest('hex'),
    canonicalCsv: csv,
    document: { originalName: name, extension: extension.slice(1), sizeBytes: content.length, extraction: converted.extraction },
    preview
  };
}

async function commitAssetDocument(options, expected = {}, trace = {}) {
  const analyzed = await analyzeAssetDocument(options);
  if (analyzed.sourceChecksum !== String(expected.sourceChecksum || '') || analyzed.preview.checksum !== String(expected.importChecksum || '')) {
    throw documentError('미리보기 이후 파일 또는 변환 결과가 변경되었습니다. 다시 미리보기를 실행하세요.');
  }
  return commitAssetImport(options.pool, options.user, analyzed.canonicalCsv, analyzed.preview.checksum, trace);
}

module.exports = {
  MAX_DOCUMENT_BYTES, SUPPORTED_EXTENSIONS, inspectZip, rowsFromText, rowsFromOoxml, validateSource,
  analyzeAssetDocument, commitAssetDocument
};
