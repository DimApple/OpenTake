import { useMemo, useState } from 'react';
import { newId, validateProject, type Project } from '../domain/model';
import { assignClips, previewClips } from '../domain/logging';
import { dailyReports, editorialAle, editorialCsv } from '../domain/reporting';
import { ARCHIVE_LIMIT, exportArchive, importArchive } from '../transfer/archive';
import { exportCsv, importCsv } from '../transfer/csv';
import { Field, Select } from './Fields';
import { type useLibrary, errorText } from './useLibrary';

export async function download(data: BlobPart, filename: string, type: string) {
  const blob = new Blob([data], { type });
  const bridge = window.OpenTakeAndroid;
  if (bridge) {
    const url = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
    bridge.saveFile(filename, url.slice(url.indexOf(',') + 1));
    return;
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export async function downloadProject(project: Project, suffix = '') {
  await download(Uint8Array.from(await exportArchive(project)), `${project.title}${suffix}.otake`, 'application/zip');
}

export function TransferPanel({ library }: { library: ReturnType<typeof useLibrary> }) {
  const project = library.active?.project;
  const [preview, setPreview] = useState<{ filename: string; project: Project; csv?: ReturnType<typeof importCsv>; revision: number | null }>();
  const [confirmation, confirm] = useState(false);
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);
  const busy = working || library.state === 'Saving';
  const collision = library.records.find(record => record.project.projectId === preview?.project.projectId);
  async function run(action: () => Promise<void> | void) {
    setError('');
    setWorking(true);
    try { await action(); } catch (error) { setError(errorText(error)); }
    finally { setWorking(false); }
  }
  async function read(file: File) {
    setPreview(undefined);
    confirm(false);
    if (file.size > ARCHIVE_LIMIT) throw new Error('File exceeds 16 MiB.');
    const bytes = new Uint8Array(await file.arrayBuffer());
    const csv = /\.csv$/i.test(file.name) ? importCsv(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) : undefined;
    if (!csv && !/\.otake$/i.test(file.name)) throw new Error('Choose an .otake or .csv file.');
    const project = csv?.project ?? await importArchive(bytes);
    const current = library.records.find(record => record.project.projectId === project.projectId);
    setPreview({ filename: file.name, project, csv, revision: current?.revision ?? null });
  }
  async function accept(replace: boolean) {
    if (!preview || (replace && (!collision || !confirmation))) return;
    const input = collision && !replace
      ? { ...preview.project, projectId: newId(), title: preview.project.title + ' (copy)' }
      : preview.project;
    if (await library.save(validateProject(input), replace ? preview.revision : null, replace)) {
      setPreview(undefined); confirm(false);
    }
  }
  return <>
    <section className="panel transfer-panel">
      <h2>Import &amp; export</h2>
      {error && <p role="alert">{error}</p>}
      <div className="transfer-options">
        {project && <section className="transfer-card" aria-labelledby="download-heading">
          <h3 id="download-heading">Export project</h3>
          <div className="transfer-choice">
            <div><strong>OpenTake project</strong><small>Full backup with takes, camera settings, and continuity notes.</small></div>
            <button className="primary" disabled={busy} onClick={() => void run(() => downloadProject(project))}>Export .otake</button>
          </div>
          <div className="transfer-choice">
            <div><strong>Take spreadsheet</strong><small>Take records and their day, scene, shot, and camera labels.</small></div>
            <button disabled={busy || !project.takes.length} onClick={() => void run(() => download(exportCsv(project), project.title + '.csv', 'text/csv;charset=utf-8'))}>Export CSV</button>
          </div>
          <details className="transfer-editorial">
            <summary>Editorial formats</summary>
            <div className="actions">
              <button disabled={busy} onClick={() => void run(() => download(editorialCsv(project), project.title + '-Resolve.csv', 'text/csv;charset=utf-8'))}>Resolve metadata</button>
              <button disabled={busy} onClick={() => void run(() => download(editorialAle(project), project.title + '.ale', 'text/plain;charset=utf-8'))}>Avid ALE</button>
            </div>
          </details>
        </section>}
        <section className="transfer-card" aria-labelledby="import-heading">
          <h3 id="import-heading">Import a file</h3>
          <p className="hint">Choose an OpenTake project (.otake) or take spreadsheet (.csv) to preview it.</p>
          <label className="transfer-file">Import project file
            <input type="file" accept=".otake,.csv,text/csv,application/zip" disabled={busy}
              onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void run(() => read(file)); }} />
          </label>
        </section>
      </div>
      {preview && <section className="preview" aria-label="Import preview">
        <h3>Import preview</h3><small className="transfer-filename">{preview.filename}</small><p><strong>{preview.project.title}</strong> · {preview.project.takes.length} takes · {preview.project.shootingDays.length} days · {preview.project.cameras.length} cameras</p>
        {preview.csv && <>
          <p>CSV reconstruction. Camera defaults, project metadata beyond title and ID, continuity notes and records without takes are outside this format.</p>
          <p>Supported fields: {preview.csv.supported.map(field => field.replace('slate', 'shot').replaceAll('_', ' ')).join(', ')}.</p>
          {!!preview.csv.unsupported.length && <p role="alert">These fields will be omitted if you continue: {preview.csv.unsupported.join(', ')}.</p>}
          {!!preview.csv.ambiguous && <p>Repeated take numbers with unknown cameras were kept as distinct rows for review.</p>}
          {!!preview.csv.duplicates && <p>{preview.csv.duplicates} identical duplicate rows will be skipped.</p>}
        </>}
        <ul>{preview.project.takes.slice(0, 5).map(take => <li key={take.id}>
          Take {take.takeNumber} · {take.status ?? 'Unknown status'}{take.comments ? ` · ${take.comments}` : ''}</li>)}</ul>
        {collision && <label className="check"><input type="checkbox" checked={confirmation} onChange={event => confirm(event.target.checked)} />
          Replace “{collision.project.title}” ({collision.project.takes.length} current takes) and keep the prior version as a backup.</label>}
        <div className="actions">
          <button className="primary" disabled={busy} onClick={() => void run(() => accept(false))}>{collision ? 'Import as separate copy' : 'Import new project'}</button>
          {collision && <button disabled={!confirmation || busy} onClick={() => void run(() => accept(true))}>Replace project</button>}
          <button disabled={busy} onClick={() => setPreview(undefined)}>Cancel import</button>
        </div>
      </section>}
    </section>
    <BackupPanel library={library} />
    {project && <ReportPanel key={project.projectId} project={project} library={library} />}
  </>;
}

function BackupPanel({ library }: { library: ReturnType<typeof useLibrary> }) {
  const [backups, setBackups] = useState<Awaited<ReturnType<typeof library.backups>>>();
  const [error, setError] = useState('');
  async function run(action: () => Promise<void>) {
    try { setError(''); await action(); } catch (error) { setError(errorText(error)); }
  }
  return <section className="panel recovery-panel">
    <div className="recovery-heading">
      <div><h2>Recovery copies</h2><p className="hint">Find the previous version of a project you replaced during import.</p></div>
      <button onClick={() => void run(async () => setBackups(await library.backups()))}>Load replacement backups</button>
    </div>
    {error && <p role="alert">{error}</p>}
    {backups?.length === 0 && <p>No replacement backups.</p>}
    {backups?.map(record => <p key={record.project.projectId}>{record.project.title} · {record.project.takes.length} takes
      {' '}<button onClick={() => void run(() => downloadProject(record.project, '-backup'))}>Export backup</button></p>)}
  </section>;
}

function ReportPanel({ project, library }: { project: Project; library: ReturnType<typeof useLibrary> }) {
  const [day, setDay] = useState('');
  const [camera, setCamera] = useState('');
  const [roll, setRoll] = useState('');
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<{ revision?: number; data: ReturnType<typeof previewClips> }>();
  const [confirmed, setConfirmed] = useState(false);
  const reports = useMemo(() => dailyReports(project, day, camera), [project, day, camera]);
  const clear = () => { setPreview(undefined); setConfirmed(false); setError(''); };
  function buildPreview() {
    try { clear(); setPreview({ revision: library.active?.revision, data: previewClips(project, day, camera, roll, text) }); }
    catch (error) { setError(errorText(error)); }
  }
  async function apply() {
    if (!preview || preview.revision !== library.active?.revision || !confirmed) return;
    try { if (await library.persist(assignClips(project, preview.data))) clear(); }
    catch (error) { setError(errorText(error)); }
  }
  return <section className="panel">
    <h2>Camera & sound reports</h2>
    <div className="filters">
      <Select label="Report day" options={project.shootingDays.map(item => ({ id: item.id, label: item.name }))} value={day} onChange={value => { clear(); setDay(value); }} blank="All days" />
      <Select label="Report camera" options={project.cameras} value={camera} onChange={value => { clear(); setCamera(value); }} blank="All cameras" />
    </div>
    <dl className="report-counts">
      <div><dt>Camera takes</dt><dd>{reports.camera.totalRows}</dd></div>
      <div><dt>Preferred</dt><dd>{reports.camera.totalGood}</dd></div>
      <div><dt>Sound takes</dt><dd>{reports.sound.totalRows}</dd></div>
    </dl>
    {reports.camera.rolls.map(group => <details key={group.roll}><summary>{group.roll} · {group.rows.length} {group.rows.length === 1 ? 'take' : 'takes'}</summary><ul>
      {group.rows.map(row => <li key={row.takeId}>{row.scene} {row.shot} · Take {row.take} · {row.camera} {row.fileName} {row.mos && '· MOS'}</li>)}</ul></details>)}
    <details><summary>Sound rolls</summary>{reports.sound.rolls.map(group => <p key={group.roll}>{group.roll} · {group.rows.length} takes</p>)}</details>
    <details><summary>Reconcile clip filenames</summary>
      <p className="hint">Choose one shooting day and camera above, enter the exact roll, then paste one filename per line in recording order.</p>
      <Field label="Exact roll / card" value={roll} onChange={event => { clear(); setRoll(event.target.value); }} />
      <label>Clip listing<textarea value={text} onChange={event => { clear(); setText(event.target.value); }} /></label>
      {error && <p role="alert">{error}</p>}
      <button onClick={buildPreview}>Preview assignments</button>
      {preview && <>
        {preview.data.hasDrift && <p role="alert">The counts differ. Correct the list or edit filenames individually before applying.</p>}
        <ul>{preview.data.entries.map((entry, index) => <li key={index}>
          {entry.takeId ? `Take ${project.takes.find(take => take.id === entry.takeId)?.takeNumber}` : 'Unmatched'}
          {' → '}{entry.fileName ?? 'No clip'}{entry.replaces && ` (replaces ${entry.replaces})`}
        </li>)}</ul>
        <label className="check"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} /> I verified the order and replacements.</label>
        <button disabled={preview.data.hasDrift || !preview.data.matchedCount || !confirmed || preview.revision !== library.active?.revision || library.state === 'Saving'}
          onClick={() => void apply()}>Apply assignments</button>
      </>}
    </details>
  </section>;
}
