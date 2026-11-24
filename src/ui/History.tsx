import { useState } from 'react';
import { slateName } from '../domain/logging';
import type { LogTake, Project } from '../domain/model';
import { Field, Select } from './Fields';

export function History({ project, busy, edit, remove, editingId }: {
  project: Project; busy: boolean; editingId?: string; edit: (take: LogTake) => void; remove: (takes: readonly LogTake[]) => Promise<boolean>;
}) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [query, search] = useState('');
  const [camera, filterCamera] = useState('');
  const [scene, filterScene] = useState('');
  const [status, filterStatus] = useState('');
  const [day, filterDay] = useState('');
  const slates = new Map(project.slates.map(row => [row.id, row]));
  const cameras = new Map(project.cameras.map(row => [row.id, row.label]));
  const takes = project.takes.filter(row => {
    const text = [slateName(project, row.slateId), row.takeNumber, row.comments, row.rollCard, row.fileName, row.keywords?.join(' ')].join(' ').toLowerCase();
    return (!camera || row.cameraId === camera) && (!scene || slates.get(row.slateId)?.sceneId === scene)
      && (!status || (row.status ?? 'unknown') === status) && (!day || row.dayId === day) && text.includes(query.trim().toLowerCase());
  }).slice().reverse();
  const selection = takes.filter(take => selected.has(take.id));
  function updateFilter(set: (value: string) => void, value: string) {
    set(value);
    setSelected(new Set());
  }
  function toggle(id: string, checked: boolean) {
    setSelected(previous => {
      const next = new Set(previous);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }
  async function deleteSelected() {
    if (await remove(selection)) setSelected(new Set());
  }
  return <section className="panel history">
    <h2>Takes <small>{takes.length}</small></h2>
    <div className="filters">
      <Field label="Search takes" type="search" value={query} onChange={event => updateFilter(search, event.target.value)} />
      <Select label="Scene" blank="All scenes" value={scene} onChange={value => updateFilter(filterScene, value)} options={project.scenes} />
      <Select label="Camera" blank="All cameras" value={camera} onChange={value => updateFilter(filterCamera, value)} options={project.cameras} />
      <Select label="Shooting day" blank="All days" value={day} onChange={value => updateFilter(filterDay, value)} options={project.shootingDays.map(row => ({ id: row.id, label: row.name }))} />
      <Select label="Status" blank="All statuses" value={status} onChange={value => updateFilter(filterStatus, value)}
        options={['preferred', 'rejected', 'unrated', 'unknown'].map(id => ({ id, label: id }))} />
    </div>
    {takes.length > 0 && <div className="actions">
      <button type="button" disabled={busy || selection.length === takes.length}
        onClick={() => setSelected(new Set(takes.map(row => row.id)))}>Select all shown</button>
      {selection.length > 0 && <>
        <button type="button" disabled={busy} onClick={() => setSelected(new Set())}>Clear selection</button>
        <button type="button" className="rejected" disabled={busy} onClick={() => void deleteSelected()}>
          Delete selected ({selection.length})
        </button>
      </>}
    </div>}
    {takes.length ? <div className="table-scroll" tabIndex={0} role="region" aria-label="Take table"><table>
      <thead><tr><th scope="col">Select</th>{['Scene / Shot', 'Take', 'Cam', 'Roll / Card', 'Lens', 'FPS', 'ISO', 'WB', 'Status', 'Notes', 'Actions'].map(title => <th key={title} className={title === 'Actions' ? 'take-actions-cell' : undefined}>{title}</th>)}</tr></thead>
      <tbody>{takes.map(row => <tr key={row.id} className={editingId === row.id ? 'take-being-edited' : undefined}>
        <td className="take-selection">
          <input type="checkbox" disabled={busy} checked={selected.has(row.id)}
            aria-label={`Select ${slateName(project, row.slateId)} take ${row.takeNumber}${row.cameraId ? ' camera ' + (cameras.get(row.cameraId) ?? '') : ''}`}
            onChange={event => toggle(row.id, event.target.checked)} />
        </td>
        <td>{slateName(project, row.slateId)}</td>
        <td>{String(row.takeNumber).padStart(2, '0')}</td><td>{row.cameraId ? cameras.get(row.cameraId) : '—'}</td><td>{row.rollCard}</td>
        <td>{row.cameraSettings?.focalMm}</td><td>{row.cameraSettings?.cameraFps}</td><td>{row.cameraSettings?.iso}</td><td>{row.cameraSettings?.whitePointKelvin}</td>
        <td><span className={`badge ${row.status ?? ''}`}>{row.status ?? 'Unknown'}</span></td><td>{row.comments}</td>
        <td className="take-actions-cell">
          <div className="take-actions">
            <button type="button" disabled={busy} title="Edit take" aria-expanded={editingId === row.id} onClick={() => edit(row)}
              aria-label={`Edit ${slateName(project, row.slateId)} take ${row.takeNumber}`}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 5 5 5M4 20l5-1L20 8a2 2 0 0 0 0-3l-1-1a2 2 0 0 0-3 0L5 15z" /></svg>
            </button>
            <button type="button" disabled={busy} className="rejected" title="Delete take" onClick={() => void remove([row])}
              aria-label={`Delete ${slateName(project, row.slateId)} take ${row.takeNumber}`}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7" /></svg>
            </button>
          </div>
        </td>
      </tr>)}</tbody>
    </table></div> : <p className="hint">No takes match.</p>}
  </section>;
}
