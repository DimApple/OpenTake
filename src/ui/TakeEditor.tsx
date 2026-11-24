import { useEffect, useId, useRef, useState } from 'react';
import { draftTake, findScene, findShot, saveTake, stepScene, stepShot, type PendingShot, type TakeDraft } from '../domain/logging';
import { type LogTake, type Project, type Settings } from '../domain/model';
import { taggedShotNumber } from '../domain/slate';
import { availableDrafts, draftPrefix, ownDraftKey, readDraft } from '../persistence/drafts';
import { NavigationIcon } from './NavigationIcon';
import { Field, Select, SettingsFields } from './Fields';
import { errorText } from './useLibrary';

const statuses = ['unrated', 'preferred', 'rejected'] as const;
export function TakeEditor({ project, revision, day, editing, persist, busy, done, dirty, recover, protect }: {
  project: Project; revision: number; day: string; editing?: LogTake;
  persist: (project: Project) => Promise<boolean>; busy: boolean; done?: () => void;
  dirty: (value: boolean) => void; protect: (value: boolean) => void; recover: (project: Project) => void;
}) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const editingId = editing?.id;
  useEffect(() => {
    if (editingId) titleRef.current?.focus();
  }, [editingId]);
  const shotOptionsId = useId();
  const sceneOptionsId = useId();
  function initial(): TakeDraft {
    if (editing) return editing;
    const firstScene = project.scenes.find(item => !item.archived);
    const firstShot = project.slates.find(item => item.sceneId === firstScene?.id && !item.archived);
    const input = draftTake(project, day, firstShot?.id ?? '', project.cameras.find(item => !item.archived)?.id ?? '');
    return firstShot || !firstScene ? input : { ...input, pendingShot: { sceneId: firstScene.id, label: '' } };
  }
  const prefix = draftPrefix(project.projectId, editing?.id);
  const key = ownDraftKey(prefix);
  const [restored] = useState(() => {
    const draft = readDraft(key);
    if (draft && draft.editing === Boolean(editing)
      && (editing ? draft.input.id === editing.id : !project.takes.some(item => item.id === draft.input.id))) return draft;
    return undefined;
  });
  const [otherDrafts, setOtherDrafts] = useState(() => availableDrafts(prefix)
    .filter(({ draft }) => editing ? draft.input.id === editing.id : !project.takes.some(item => item.id === draft.input.id)));
  const [originalRevision, setOriginalRevision] = useState(restored?.revision);
  const [input, setInput] = useState(() => restored?.input ?? initial());
  const [changed, setChanged] = useState(Boolean(restored));
  const [stale, setStale] = useState(Boolean(restored && restored.revision !== revision));
  const [error, setError] = useState('');
  const [savedMessage, setSavedMessage] = useState('');
  const [draftError, setDraftError] = useState('');
  useEffect(() => { dirty(changed); return () => dirty(false); }, [changed, dirty]);
  useEffect(() => {
    if (!draftError || !changed) return;
    protect(true);
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => {
      protect(false);
      window.removeEventListener('beforeunload', warn);
    };
  }, [draftError, changed, protect]);

  function update(next: TakeDraft) {
    setInput(next);
    setChanged(true);
    try {
      // Small recovery drafts are written before the next event can switch tabs.
      localStorage.setItem(key, JSON.stringify({ input: next, revision: stale ? originalRevision : revision, editing: Boolean(editing) }));
      setDraftError('');
    } catch { setDraftError('Draft recovery storage is unavailable. Keep this form open until the take is saved.'); }
  }
  function clearDraft() {
    try { localStorage.removeItem(key); } catch { /* The committed ID prevents replay. */ }
    setChanged(false);
    setStale(false);
  }
  function switchContext(dayId: string, slateId: string, cameraId: string, pendingShot: PendingShot | null = input.pendingShot ?? null) {
    const selection = { slateId, pendingShot: pendingShot ?? undefined };
    if (editing) { update({ ...input, dayId: dayId || undefined, ...selection, cameraId: cameraId || undefined }); return; }
    const sameCameraDay = input.dayId === dayId && input.cameraId === cameraId;
    if (!sameCameraDay && Object.values(input.settingSources ?? {}).some(source => source === 'entered' || source === 'cleared')
      && !window.confirm('Use the new camera/day settings in place of the settings edited in this draft?')) return;
    const seeded = draftTake(project, dayId, slateId, cameraId);
    if (sameCameraDay) {
      seeded.cameraSettings = input.cameraSettings;
      seeded.settingSources = input.settingSources;
      seeded.rollCard = input.rollCard;
      seeded.soundRoll = input.soundRoll;
    }
    update({ ...input, ...seeded, ...selection, id: input.id, fileName: input.fileName, comments: input.comments,
      status: input.status, soundNotes: input.soundNotes, mos: input.mos, wildTrack: input.wildTrack });
  }
  function changeSetting(key: keyof Settings, value: string | number | undefined) {
    const cameraSettings = { ...input.cameraSettings };
    if (value === undefined) delete cameraSettings[key];
    else Object.assign(cameraSettings, { [key]: value });
    update({ ...input, cameraSettings, settingSources: { ...input.settingSources, [key]: value === undefined ? 'cleared' : 'entered' } });
  }
  async function submit() {
    setError('');
    try {
      const next = saveTake(project, input, Boolean(editing));
      if (await persist(next)) {
        clearDraft();
        if (!editing) {
          const saved = next.takes.find(take => take.id === input.id)!;
          setSavedMessage(`Saved Scene ${sceneLabel.trim()}${shotLabel.trim() ? ' · Shot ' + shotLabel.trim() : ''} · Take ${saved.takeNumber}`);
          setInput(draftTake(next, saved.dayId ?? '', saved.slateId, saved.cameraId ?? ''));
        }
        done?.();
      }
    } catch (error) { setError(errorText(error)); }
  }
  const days = project.shootingDays.map(item => ({ id: item.id, label: [item.name, item.date].filter(Boolean).join(' · ') }));
  const currentShot = project.slates.find(item => item.id === input.slateId);
  const sceneId = input.pendingShot?.sceneId ?? currentShot?.sceneId ?? '';
  const sceneLabel = input.pendingShot?.sceneLabel ?? project.scenes.find(item => item.id === sceneId)?.label ?? '';
  const shotLabel = input.pendingShot?.label ?? taggedShotNumber(currentShot?.label, currentShot?.tag);
  const shotOptions = [...new Set(project.slates
    .filter(item => item.sceneId === sceneId && !item.archived)
    .map(item => taggedShotNumber(item.label, item.tag)).filter(Boolean))];
  function selectShot(nextSceneLabel: string, label: string) {
    const sameScene = nextSceneLabel === sceneLabel;
    const nextScene = sameScene && sceneId ? sceneId : findScene(project, nextSceneLabel)?.id ?? '';
    const match = sameScene && label === shotLabel ? currentShot : findShot(project, nextScene, label);
    switchContext(input.dayId ?? '', match?.id ?? '', input.cameraId ?? '',
      match ? null : { sceneId: nextScene, sceneLabel: nextSceneLabel, label });
  }
  return <form className="panel editor" onSubmit={event => { event.preventDefault(); void submit(); }}>
    <h2 ref={titleRef} tabIndex={editing ? -1 : undefined}>{editing ? 'Edit take' : 'Log take'}</h2>
    {!changed && otherDrafts.length > 0 && <details><summary>Drafts from other sessions</summary>
      {otherDrafts.map(({ key: sourceKey, draft }, index) => <div className="actions" key={sourceKey}>
        <button type="button" onClick={() => {
          setOriginalRevision(draft.revision);
          setStale(draft.revision !== revision);
          setInput(draft.input);
          setChanged(true);
          try { localStorage.setItem(key, JSON.stringify(draft)); }
          catch { setDraftError('Draft recovery storage is unavailable. Keep this form open until saved.'); }
        }}>Open draft {index + 1}{draft.input.comments ? ` · ${draft.input.comments.slice(0, 60)}` : ''}</button>
        <button type="button" onClick={() => {
          if (!window.confirm('Discard this recovery draft?')) return;
          try {
            localStorage.removeItem(sourceKey);
            setOtherDrafts(items => items.filter(item => item.key !== sourceKey));
          } catch { setDraftError('The draft could not be removed.'); }
        }}>Discard</button>
      </div>)}
    </details>}
    {restored && changed && <p className="hint">Recovered a saved draft.</p>}
    {stale && <p role="alert">The project changed since this draft was saved. Review its values before applying it. <button type="button" onClick={() => setStale(false)}>Use this draft</button></p>}
    {draftError && <p role="alert">{draftError}</p>}
    {error && <p role="alert">{error}</p>}
    <fieldset disabled={busy}>
      <div className="take-day">
        <Select label="Shooting day" value={input.dayId ?? ''} options={days} onChange={id => switchContext(id, input.slateId, input.cameraId ?? '')} />
      </div>
      <div className="take-identity">
        <div className="take-slate-card">
          <LabelStepper label="Scene" value={sceneLabel} list={sceneOptionsId} step={stepScene}
            onChange={value => selectShot(value, '')} required />
          <datalist id={sceneOptionsId}>{project.scenes.filter(scene => !scene.archived).map(scene =>
            <option value={scene.label} key={scene.id} />)}</datalist>
          <LabelStepper label="Shot (optional)" value={shotLabel} list={shotOptionsId} step={stepShot}
            disabled={!sceneLabel.trim()} onChange={value => selectShot(sceneLabel, value)} placeholder="A, B, C…" />
          <datalist id={shotOptionsId}>{shotOptions.map(label => <option value={label} key={label} />)}</datalist>
        </div>
        <div className="take-number-card">
          <Field label="Take number" type="number" min="1" required value={Number.isFinite(input.takeNumber) ? input.takeNumber : ''}
            onChange={event => update({ ...input, takeNumber: event.target.valueAsNumber })} />
          <div className="stepper-buttons">
            <button type="button" aria-label="Decrease take number" disabled={!(input.takeNumber > 1)}
              onClick={() => update({ ...input, takeNumber: input.takeNumber - 1 })}>−</button>
            <button type="button" aria-label="Increase take number"
              onClick={() => update({ ...input, takeNumber: (input.takeNumber || 0) + 1 })}>+</button>
          </div>
        </div>
      </div>
      <div className="take-camera-row">
        <Select label="Camera" value={input.cameraId ?? ''} options={project.cameras} onChange={id => switchContext(input.dayId ?? '', input.slateId, id)} />
        <Field label="Roll / Card" value={input.rollCard ?? ''} onChange={event => update({ ...input, rollCard: event.target.value || undefined })} />
      </div>
      <details className="take-settings" open={editing ? true : undefined}>
        <summary>
          <span className="take-settings-summary">
            {([
              ['Lens', input.cameraSettings?.focalMm, ' mm'],
              ['FPS', input.cameraSettings?.cameraFps, ''],
              ['ISO', input.cameraSettings?.iso, ''],
              ['WB', input.cameraSettings?.whitePointKelvin, ' K'],
            ] as const).map(([label, value, unit]) => <span key={label}><small>{label}</small><strong>{value === undefined ? '—' : value + unit}</strong></span>)}
          </span>
          <span className="take-settings-toggle">Edit camera settings</span>
        </summary>
        <SettingsFields values={input.cameraSettings ?? {}} onChange={changeSetting} />
        {Object.values(input.settingSources ?? {}).some(source => source === 'previous' || source === 'cameraDefault')
          && <p className="hint">Includes settings inherited from this camera.</p>}
      </details>
      <div className="take-rating"><span>Take status</span><div className="status-options" role="group" aria-label="Take status">{statuses.map(status =>
        <button type="button" key={status} className={status} aria-pressed={input.status === status}
          onClick={() => update({ ...input, status })}><span aria-hidden="true">{status === 'preferred' ? '✓' : status === 'rejected' ? '×' : '○'} </span>{status}</button>)}</div></div>
      <label>Notes<textarea aria-label="Notes" placeholder="Notes about the take…" value={input.comments ?? ''} onChange={event => update({ ...input, comments: event.target.value || undefined })} /></label>
      <details><summary>Clip, sound and shot details</summary><div className="grid">
        {([['fileName', 'Clip filename'], ['soundRoll', 'Sound roll'], ['soundFileName', 'Sound filename'],
          ['soundNotes', 'Sound notes'], ['captureId', 'Capture ID']] as const).map(([key, label]) =>
          <Field key={key} label={label} value={input[key] ?? ''} onChange={event => update({ ...input, [key]: event.target.value || undefined })} />)}
        <Field label="Keywords (comma separated)" value={input.keywords?.join(',') ?? ''}
          onChange={event => update({ ...input, keywords: event.target.value ? event.target.value.split(',') : undefined })} />
        {([['sceneNumber', 'Recorded scene'], ['shotNumber', 'Recorded shot'], ['dateRecorded', 'Recorded date'],
          ['location', 'Location'], ['description', 'Description']] as const).map(([key, label]) =>
          <Field key={key} type={key === 'dateRecorded' ? 'date' : 'text'} label={label} value={input.slateOverrides?.[key] ?? ''}
            onChange={event => update({ ...input, slateOverrides: { ...input.slateOverrides, [key]: event.target.value || undefined } })} />)}
        <Select label="Environment" value={input.slateOverrides?.environment ?? ''} options={[{ id: 'INT', label: 'INT' }, { id: 'EXT', label: 'EXT' }]}
          onChange={value => update({ ...input, slateOverrides: { ...input.slateOverrides, environment: (value || undefined) as 'INT' | 'EXT' | undefined } })} />
        <Select label="Time of day" value={input.slateOverrides?.dayNight ?? ''} options={[{ id: 'DAY', label: 'Day' }, { id: 'NIGHT', label: 'Night' }]}
          onChange={value => update({ ...input, slateOverrides: { ...input.slateOverrides, dayNight: (value || undefined) as 'DAY' | 'NIGHT' | undefined } })} />
        <label className="check"><input type="checkbox" checked={input.mos === true} onChange={event => update({ ...input, mos: event.target.checked, wildTrack: event.target.checked ? false : input.wildTrack })} /> MOS</label>
        <label className="check"><input type="checkbox" checked={input.wildTrack === true} onChange={event => update({ ...input, wildTrack: event.target.checked, mos: event.target.checked ? false : input.mos })} /> Wild track</label>
      </div></details>
      <div className={editing ? 'actions' : 'take-save-bar'}>
        {!editing && <p className="take-saved-message" role="status">{savedMessage}</p>}
        <button className="primary" disabled={stale || !sceneLabel.trim() || (!editing && (!input.cameraId || !input.dayId))}>{editing ? 'Save take' : <><NavigationIcon name="Log" />Save &amp; Next Take</>}</button>
      </div>
      {changed && <div className="actions">
        <button type="button" onClick={() => { clearDraft(); setInput(initial()); }}>Discard draft</button>
        <button type="button" onClick={() => { try { recover(saveTake(project, input, Boolean(editing))); } catch (error) { setError(errorText(error)); } }}>Export with draft</button>
      </div>}
    </fieldset>
  </form>;
}


function LabelStepper({ label, value, list, step, onChange, disabled, required, placeholder }: {
  label: string; value: string; list: string; step: (value: string, direction: -1 | 1) => string | undefined;
  onChange: (value: string) => void; disabled?: boolean; required?: boolean; placeholder?: string;
}) {
  const previous = step(value, -1);
  const next = step(value, 1);
  const name = label === 'Scene' ? 'scene' : 'shot';
  return <div className="label-stepper">
    <Field label={label} value={value} list={list} placeholder={placeholder} disabled={disabled} required={required}
      onChange={event => onChange(event.target.value)} />
    <div className="stepper-buttons">
      <button type="button" aria-label={`Previous ${name}`} disabled={disabled || previous === undefined}
        onClick={() => { if (previous !== undefined) onChange(previous); }}>−</button>
      <button type="button" aria-label={`Next ${name}`} disabled={disabled || next === undefined}
        onClick={() => { if (next !== undefined) onChange(next); }}>+</button>
    </div>
  </div>;
}
