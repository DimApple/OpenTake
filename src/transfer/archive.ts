import { zipSync, strToU8 } from 'fflate';
import { z } from 'zod';
import { validateProject, type Project } from '../domain/model';

const names = ['manifest.json', 'project.json', 'checksums.json'] as const;
export const ARCHIVE_LIMIT = 16 * 1024 * 1024;
const INFLATED_LIMIT = 64 * 1024 * 1024;
const decoder = new TextDecoder('utf-8', { fatal: true });
const manifestSchema = z.strictObject({
  format: z.literal('opentake.project'), archiveVersion: z.literal(1), schemaVersion: z.literal(1),
  projectId: z.string(), exportedAt: z.iso.datetime(), appVersion: z.string(),
});
const hash = z.string().regex(/^[0-9a-f]{64}$/);
const checksumSchema = z.strictObject({
  algorithm: z.literal('SHA-256'),
  entries: z.strictObject({ 'manifest.json': hash, 'project.json': hash }),
});

async function digest(bytes: Uint8Array): Promise<string> {
  const sum = await crypto.subtle.digest('SHA-256', Uint8Array.from(bytes));
  return Array.from(new Uint8Array(sum), byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function exportArchive(input: Project) {
  const project = validateProject(input);
  const projectBytes = strToU8(JSON.stringify(project));
  const manifest = strToU8(JSON.stringify({
    format: 'opentake.project', archiveVersion: 1, schemaVersion: 1,
    projectId: project.projectId, exportedAt: new Date().toISOString(), appVersion: '0.1.0-phase1',
  }));
  const checksums = strToU8(JSON.stringify({
    algorithm: 'SHA-256', entries: { 'manifest.json': await digest(manifest), 'project.json': await digest(projectBytes) },
  }));
  if (projectBytes.length + manifest.length + checksums.length > INFLATED_LIMIT) throw new Error('The project exceeds the archive size limit.');
  const result = zipSync({ 'manifest.json': manifest, 'project.json': projectBytes, 'checksums.json': checksums }, { level: 0 });
  if (result.length > ARCHIVE_LIMIT) throw new Error('The compressed project exceeds the archive size limit.');
  return result;
}

/** Read the restricted three-entry ZIP profile before giving bytes to fflate. */
function inspectZip(bytes: Uint8Array) {
  const end = bytes.length - 22;
  if (end < 0 || bytes.length > ARCHIVE_LIMIT) throw new Error('Invalid archive size.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u16 = (at: number) => view.getUint16(at, true);
  const u32 = (at: number) => view.getUint32(at, true);
  if (u32(end) !== 0x06054b50 || u16(end + 4) || u16(end + 6) || u16(end + 8) !== 3
    || u16(end + 10) !== 3 || u16(end + 20)) throw new Error('Expected a single ZIP with three entries.');
  const central = u32(end + 16);
  if (central + u32(end + 12) !== end) throw new Error('Invalid ZIP directory.');
  const sizes = new Map<string, number>();
  const spans: Array<[number, number]> = [];
  let total = 0;
  let cursor = central;
  while (cursor < end) {
    if (cursor + 46 > end || u32(cursor) !== 0x02014b50) throw new Error('Invalid ZIP entry.');
    const flags = u16(cursor + 8);
    const method = u16(cursor + 10);
    const compressed = u32(cursor + 20);
    const size = u32(cursor + 24);
    const length = u16(cursor + 28);
    const local = u32(cursor + 42);
    const next = cursor + 46 + length + u16(cursor + 30) + u16(cursor + 32);
    if (next > end || (flags & ~0x0806) || (method !== 0 && method !== 8) || u16(cursor + 34)
      || size === 0 || (method === 0 && compressed !== size)) throw new Error('Unsupported ZIP entry.');
    const name = decoder.decode(bytes.subarray(cursor + 46, cursor + 46 + length));
    if (!(names as readonly string[]).includes(name) || sizes.has(name)) throw new Error('Unexpected or duplicate ZIP entry.');
    if (local + 30 + length > central || u32(local) !== 0x04034b50 || u16(local + 6) !== flags
      || u16(local + 8) !== method || u32(local + 14) !== u32(cursor + 16)
      || u32(local + 18) !== compressed || u32(local + 22) !== size || u16(local + 26) !== length
      || decoder.decode(bytes.subarray(local + 30, local + 30 + length)) !== name) throw new Error('ZIP headers disagree.');
    const stop = local + 30 + length + u16(local + 28) + compressed;
    if (stop > central) throw new Error('A ZIP entry extends beyond its data region.');
    spans.push([local, stop]);
    total += size;
    if (total > INFLATED_LIMIT) throw new Error('Archive exceeds the expanded size limit.');
    sizes.set(name, size);
    cursor = next;
  }
  const ordered = spans.sort((a, b) => a[0] - b[0]);
  if (sizes.size !== 3 || ordered.some(([start], index) => start !== (ordered[index - 1]?.[1] ?? 0))
    || ordered.at(-1)?.[1] !== central) throw new Error('Missing entries or invalid ZIP layout.');
  return { sizes, spans: ordered };
}

/** Validate decoded object keys, including escape-equivalent spellings. */
function parseJson(bytes: Uint8Array): unknown {
  const text = decoder.decode(bytes);
  const value: unknown = JSON.parse(text);
  const containers: Array<Set<string> | null> = [];
  const separator = /\s*:/y;
  for (const token of text.matchAll(/"(?:[^"\\]|\\[\s\S])*"|[{}\[\]]/g)) {
    const char = token[0];
    if (char === '{') containers.push(new Set());
    else if (char === '[') containers.push(null);
    else if (char === '}' || char === ']') containers.pop();
    else if (containers.at(-1)) {
      separator.lastIndex = token.index! + char.length;
      if (!separator.test(text)) continue;
      const keys = containers.at(-1)!;
      const key = JSON.parse(char) as string;
      if (keys.has(key)) throw new Error('JSON contains duplicate object keys.');
      keys.add(key);
    }
    if (containers.length > 128) throw new Error('JSON is nested too deeply.');
  }
  return value;
}

const crcTable = Uint32Array.from({ length: 256 }, (_, initial) => {
  let value = initial;
  for (let i = 0; i < 8; i++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
  return value;
});

function verifyCrc(bytes: Uint8Array, expected: number) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 255];
  if (((~crc) >>> 0) !== expected) throw new Error('A ZIP entry failed its CRC check.');
}

async function inflateArchive(bytes: Uint8Array) {
  const { sizes, spans } = inspectZip(bytes);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const result: Record<string, Uint8Array> = {};
  for (const [start, stop] of spans) {
    const nameLength = view.getUint16(start + 26, true);
    const name = decoder.decode(bytes.subarray(start + 30, start + 30 + nameLength));
    const payload = bytes.slice(start + 30 + nameLength + view.getUint16(start + 28, true), stop);
    if (view.getUint16(start + 8, true) === 0) {
      verifyCrc(payload, view.getUint32(start + 14, true));
      result[name] = payload;
      continue;
    }
    // A supplied output buffer can truncate data in some ZIP libraries. Read
    // the actual stream and reject extra output before assembling the result.
    const reader = new Blob([payload]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
    const output = new Uint8Array(sizes.get(name)!);
    let offset = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (offset + value.length > output.length) throw new Error('ZIP entry exceeds its declared size.');
        output.set(value, offset);
        offset += value.length;
      }
      if (offset !== output.length) throw new Error('ZIP entry is shorter than declared.');
    } finally {
      await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
    verifyCrc(output, view.getUint32(start + 14, true));
    result[name] = output;
  }
  return result;
}

export async function importArchive(bytes: Uint8Array): Promise<Project> {
  const entries = await inflateArchive(bytes);
  const checks = checksumSchema.parse(parseJson(entries['checksums.json']));
  for (const name of ['manifest.json', 'project.json'] as const) {
    if (await digest(entries[name]) !== checks.entries[name]) throw new Error(`Checksum mismatch in ${name}.`);
  }
  const manifest = manifestSchema.parse(parseJson(entries['manifest.json']));
  const project = validateProject(parseJson(entries['project.json']));
  if (manifest.projectId !== project.projectId) throw new Error('Project ID does not match the manifest.');
  return project;
}
