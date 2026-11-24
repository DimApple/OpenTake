import 'fake-indexeddb/auto';
import { describe, expect, it, vi } from 'vitest';
import { zipSync, unzipSync, strToU8 } from 'fflate';
import { createProject, validateProject } from '../src/domain/model';
import { assignClips, deleteTakes, draftTake, previewClips, saveTake } from '../src/domain/logging';
import { dailyReports, editorialAle, editorialCsv } from '../src/domain/reporting';
import { commitProject, listProjects, openLibrary } from '../src/persistence/library';
import { exportArchive, importArchive } from '../src/transfer/archive';
import { csvRows, exportCsv, importCsv } from '../src/transfer/csv';

function fixture() {
  return validateProject({
    ...createProject('Synthetic production'),
    shootingDays: [{ id: 'd1', name: 'Day 1', date: '2026-01-23' }, { id: 'd2', name: 'Day 2' }],
    scenes: [{ id: 'scene', label: '012' }],
    slates: [{ id: 'base', sceneId: 'scene', label: '12A' }, { id: 'pu', sceneId: 'scene', label: '12A', tag: 'PU' }],
    cameras: [{ id: 'a', label: 'A', defaults: { iso: 800 } }, { id: 'b', label: 'B', defaults: { iso: 400 } }],
    continuityNotes: [{ id: 'note', description: 'Coat opens in shot', sceneId: 'scene' }],
  });
}

function recorded() {
  const project = fixture();
  return saveTake(project, {
    ...draftTake(project, 'd1', 'base', 'a'), status: 'preferred', rollCard: 'A001', comments: '=first, “café”\nsecond "line"',
    keywords: ['red, coat', "'night"], mos: false, soundRoll: 'S12', soundNotes: 'Clear', fileName: 'A001C001.mov',
    slateOverrides: { dateRecorded: '2026-01-24', location: 'Set', environment: 'INT' },
    cameraSettings: { iso: 1250, focalMm: 35 }, settingSources: { iso: 'entered', focalMm: 'entered', filter: 'cleared' },
  }, false);
}

describe('adapted Open Shot Designer behavior', () => {
  it('increments within a series, resumes on a new day, and resets pickups independently', () => {
    const project = recorded();
    expect(draftTake(project, 'd1', 'base', 'a').takeNumber).toBe(2);
    expect(draftTake(project, 'd2', 'base', 'a').takeNumber).toBe(2);
    expect(draftTake(project, 'd1', 'pu', 'a').takeNumber).toBe(1);
    expect(draftTake(project, 'd1', 'base', 'b').takeNumber).toBe(1);
  });
  it('carries day/camera settings and roll, copies values, and resets judgment and clip notes', () => {
    const project = recorded();
    const draft = draftTake(project, 'd1', 'base', 'a');
    expect(draft).toMatchObject({ cameraSettings: { iso: 1250, focalMm: 35 }, status: 'unrated', rollCard: 'A001', soundRoll: 'S12' });
    expect(draft.settingSources?.filter).toBe('cleared');
    expect(draft.cameraSettings).not.toBe(project.takes[0].cameraSettings);
    expect(draft.fileName).toBeUndefined();
    expect(draft.comments).toBeUndefined();
    expect(draftTake(project, 'd1', 'base', 'b').cameraSettings?.iso).toBe(400);
    expect(draftTake(project, 'd2', 'base', 'a').cameraSettings?.iso).toBe(800);
  });
  it('rejects duplicate keys and allows status editing', () => {
    const project = recorded();
    const row = project.takes[0];
    expect(() => validateProject(saveTake(project, { ...row, id: crypto.randomUUID() }, false))).toThrow(/already exists/);
    expect(saveTake(project, { ...row, status: 'rejected' }, true).takes[0].status).toBe('rejected');
  });
  it('deletes only the selected take and preserves its linked continuity note', () => {
    const project = recorded();
    project.continuityNotes[0].takeId = project.takes[0].id;
    const other = draftTake(project, 'd1', 'base', 'a');
    const updated = saveTake(project, other, false);
    const result = validateProject(deleteTakes(updated, new Set([project.takes[0].id])));
    expect(result.takes.map(item => item.id)).toEqual([other.id]);
    expect(result.continuityNotes[0]).toMatchObject({ description: 'Coat opens in shot', sceneId: 'scene' });
    expect(result.continuityNotes[0].takeId).toBeUndefined();
    expect(updated.takes).toHaveLength(2);
  });
  it('previews ordered filename reconciliation with drift and replacement flags', () => {
    const project = recorded();
    const mismatch = previewClips(project, 'd1', 'a', 'A001', 'A002.mov\nA003.mov');
    expect(mismatch.hasDrift).toBe(true);
    expect(() => assignClips(project, mismatch)).toThrow();
    const matches = previewClips(project, 'd1', 'a', 'A001', '/card/A002.mov');
    expect(matches.entries[0].replaces).toBe('A001C001.mov');
    expect(assignClips(project, matches).takes[0].fileName).toBe('A002.mov');
  });
  it('retains Resolve judgment, 29 columns, ALE and separate camera/sound rolls', () => {
    const project = recorded();
    const [header, row] = csvRows(editorialCsv(project));
    expect(header).toHaveLength(29);
    expect(row[header.indexOf('Good Take')]).toBe('1');
    expect(row[header.indexOf('Date Recorded')]).toBe('2026_01_24');
    expect(editorialAle(project)).toContain('A001C001');
    const reports = dailyReports(project, 'd1', 'a');
    expect(reports.camera.rolls[0].roll).toBe('A001');
    expect(reports.sound.rolls[0].roll).toBe('S12');
  });
});

describe('portable files', () => {
  it('round trips every archive field, including notes and records without takes', async () => {
    const project = recorded();
    expect(await importArchive(await exportArchive(project))).toEqual(JSON.parse(JSON.stringify(project)));
    const empty = fixture();
    expect(await importArchive(await exportArchive(empty))).toEqual(empty);
  });
  it('reads valid deflated ZIP and rejects flipped checksum, unexpected entries and bad JSON schemas', async () => {
    const files = unzipSync(await exportArchive(recorded()));
    expect((await importArchive(zipSync(files))).takes).toHaveLength(1);
    await expect(importArchive(zipSync({ ...files, extra: strToU8('x') }))).rejects.toThrow();
    await expect(importArchive(zipSync({ ...files, 'project.json': strToU8('{}') }))).rejects.toThrow(/Checksum/);
    await expect(importArchive(zipSync({ ...files, 'checksums.json': strToU8('{}') }))).rejects.toThrow();
    const checks = JSON.parse(new TextDecoder().decode(files['checksums.json']));
    const duplicate = JSON.stringify(checks).replace('{', '{"algorithm":"SHA-256",');
    await expect(importArchive(zipSync({ ...files, 'checksums.json': strToU8(duplicate) }))).rejects.toThrow(/duplicate object keys/);
    const damaged = await exportArchive(recorded());
    damaged[50] ^= 1;
    await expect(importArchive(damaged)).rejects.toThrow(/CRC/);
  });
  it('round trips takes with no slate label in both formats', async () => {
    const project = recorded();
    delete project.slates[0].label;
    expect((await importArchive(await exportArchive(project))).slates[0].label).toBeUndefined();
    const csvProject = importCsv(exportCsv(project)).project;
    expect(csvProject.slates[0]).toMatchObject({ id: 'base', sceneId: 'scene' });
    expect(csvProject.slates[0].label).toBeUndefined();
    const simple = importCsv('scene_label,take_number\n1,1\n1,2').project;
    expect(simple.slates).toHaveLength(1);
    expect(simple.takes.map(take => take.slateId)).toEqual([simple.slates[0].id, simple.slates[0].id]);
  });
  it('round trips native CSV take data, guards formulas and keeps absent fields unknown', () => {
    const project = recorded();
    const csv = exportCsv(project);
    expect(csv).toContain("'=first");
    const result = importCsv(csv);
    expect(result.project.takes).toEqual(project.takes);
    expect(result.project.continuityNotes).toEqual([]);
    expect(result.unsupported).toEqual([]);
    const thirdParty = importCsv('scene_label,slate_label,take_number,unknown\n001,X,1,hi');
    expect(thirdParty.unsupported).toEqual(['unknown']);
    expect(thirdParty.project.takes[0].status).toBeUndefined();
    expect(thirdParty.project.takes[0].cameraId).toBeUndefined();
  });
  it('rejects malformed quoting, row widths and duplicate conflicting IDs', () => {
    expect(() => importCsv('scene_label,slate_label,take_number\n001,X,"1')).toThrow(/Unterminated/);
    expect(() => importCsv('scene_label,slate_label,take_number\n001,X')).toThrow(/Column count/);
    const head = 'scene_label,slate_label,take_number,take_id\n';
    expect(() => importCsv(head + '001,X,1,t\n001,X,2,t')).toThrow(/Conflicting duplicate/);
    expect(importCsv(head + '001,X,1,t\n001,X,1,t').duplicates).toBe(1);
  });
});

describe('IndexedDB recovery and revision integrity', () => {
  it('aborts a replacement if the write fails and does not publish a new backup', async () => {
    const project = recorded();
    const db = await openLibrary();
    const committed = await commitProject(db, project, null);
    const original = IDBObjectStore.prototype.put;
    const failed = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, value, key) {
      if (this.name === 'projects') throw new DOMException('Test quota failure', 'QuotaExceededError');
      return original.call(this, value, key);
    });
    try {
      await expect(commitProject(db, { ...project, title: 'Uncommitted' }, committed.revision, true)).rejects.toThrow();
    } finally { failed.mockRestore(); }
    expect((await listProjects(db)).find(record => record.project.projectId === project.projectId)).toEqual(committed);
    expect((await listProjects(db, 'recovery')).some(record => record.project.projectId === project.projectId)).toBe(false);
    db.close();
  });
  it('commits, reopens, rejects stale writes and preserves the replaced snapshot', async () => {
    const original = recorded();
    const first = await openLibrary();
    const saved = await commitProject(first, original, null);
    first.close();
    const reopened = await openLibrary();
    expect((await listProjects(reopened)).find(record => record.project.projectId === original.projectId)).toEqual(saved);
    const replaced = await commitProject(reopened, { ...original, title: 'Replacement' }, saved.revision, true);
    expect(replaced.revision).toBe(2);
    await expect(commitProject(reopened, { ...original, title: 'Stale' }, 1)).rejects.toThrow(/Another tab/);
    const backup = (await listProjects(reopened, 'recovery')).find(record => record.project.projectId === original.projectId);
    expect(backup).toEqual(saved);
    expect((await listProjects(reopened)).find(record => record.project.projectId === original.projectId)?.project.title).toBe('Replacement');
    reopened.close();
  });
});
