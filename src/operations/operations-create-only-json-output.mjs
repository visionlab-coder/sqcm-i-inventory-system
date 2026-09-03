import fs from 'node:fs';
import path from 'node:path';

function physicalDirectory(directory, io) {
  const stat = io.lstatSync(directory);
  return stat.isDirectory()
    && !stat.isSymbolicLink()
    && !(stat.isReparsePoint?.() ?? false)
    && path.resolve(io.realpathSync(directory)).toLowerCase() === path.resolve(directory).toLowerCase();
}

export function assertCreateOnlyJsonOutputReady(outputPath, {
  io = fs,
  alreadyExistsCode = 'OUTPUT_ALREADY_EXISTS'
} = {}) {
  const output = typeof outputPath === 'string' && outputPath ? path.resolve(outputPath) : null;
  const directory = output ? path.dirname(output) : null;
  if (!directory || !io.existsSync(directory) || !physicalDirectory(directory, io)) {
    throw new Error('OUTPUT_DIRECTORY_MISSING_OR_NOT_PHYSICAL');
  }
  if (io.existsSync(output)) throw new Error(alreadyExistsCode);
  return output;
}

export function writeCreateOnlyJsonOutput(outputPath, value, {
  processId = process.pid,
  io = fs,
  alreadyExistsCode = 'OUTPUT_ALREADY_EXISTS'
} = {}) {
  const output = assertCreateOnlyJsonOutputReady(outputPath, { io, alreadyExistsCode });

  const temporary = path.join(path.dirname(output), `.${path.basename(output)}.${processId}.tmp`);
  let handle;
  try {
    handle = io.openSync(temporary, 'wx', 0o600);
    io.writeFileSync(handle, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    io.fsyncSync(handle);
    io.closeSync(handle);
    handle = undefined;
    io.linkSync(temporary, output);
  } catch (error) {
    if (error?.code === 'EEXIST') throw new Error(alreadyExistsCode);
    throw error;
  } finally {
    if (handle !== undefined) {
      try { io.closeSync(handle); } catch { /* best effort */ }
    }
    try { if (io.existsSync(temporary)) io.unlinkSync(temporary); } catch { /* best effort */ }
  }
  return output;
}
