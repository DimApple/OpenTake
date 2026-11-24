import { useState } from 'react';
import { newId, type Project, type Settings } from '../domain/model';
import { slateName } from '../domain/logging';
import { taggedShotNumber } from '../domain/slate';
import { Field, Select, SettingsFields } from './Fields';

export type ProjectSection = 'Details' | 'Shooting days' | 'Scenes' | 'Camera' | 'Continuity notes';

export function ProjectPanel({ project, section, persist, busy }: {
  project: Project; section: ProjectSection;
  persist: (project: Project) => Promise<boolean>; busy: boolean;
}) {
  const [sceneId, setScene] = useState('');
  const [cameraId, setCameraId] = useState('');
  const [defaults, setDefaults] = useState<Settings>({});
  const [selectedDay, setDay] = useState('');
  const currentCamera = project.cameras.find(item => item.id === cameraId);
  const currentDay = project.shootingDays.find(item => item.id === selectedDay);
  const [continuityId, setContinuity] = useState('');
  const currentNote = project.continuityNotes.find(item => item.id === continuityId);
  const submit = (convert: (get: (key: string) => string | undefined) => Project, done?: (form: HTMLFormElement) => void) =>
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const form = event.currentTarget;
      const data = new FormData(form);
      if (await persist(convert(key => data.get(key)?.toString().trim() || undefined))) done?.(form);
    };
  return <>
    {section === 'Details' &&
      <form className="panel" onSubmit={submit(get => ({
        ...project, title: get('title') ?? '', notes: get('notes'), productionCompany: get('productionCompany'),
        director: get('director'), cinematographer: get('cinematographer'), soundMixer: get('soundMixer'),
        scriptSupervisor: get('scriptSupervisor'),
      }))}>
        <h2>Project details</h2><fieldset disabled={busy}><div className="grid">
          {([['title', 'Project title'], ['productionCompany', 'Production company'], ['director', 'Director'],
            ['cinematographer', 'Cinematographer'], ['soundMixer', 'Sound mixer'], ['scriptSupervisor', 'Script supervisor']] as const).map(([key, label]) =>
            <Field name={key} key={key} label={label} defaultValue={project[key]} required={key === 'title'} />)}
        </div><label>Project notes<textarea name="notes" defaultValue={project.notes} /></label><button>Save project details</button></fieldset>
      </form>}
    {section === 'Shooting days' && <section className="panel">
        <h2>Shooting days</h2>
        <Select label="Manage day" value={selectedDay} onChange={setDay}
          blank="New shooting day" options={project.shootingDays.map(day => ({ id: day.id, label: day.name }))} />
        <form key={selectedDay} onSubmit={submit(get => {
          const day = { ...currentDay, id: currentDay?.id ?? newId(), name: get('name') ?? '', date: get('date'), notes: get('notes') };
          return { ...project, shootingDays: currentDay
            ? project.shootingDays.map(item => item.id === day.id ? day : item) : [...project.shootingDays, day] };
        }, form => { if (!currentDay) form.reset(); })}><fieldset disabled={busy}>
          <div className="grid"><Field name="name" label="Day name" defaultValue={currentDay?.name} required />
            <Field name="date" label="Date" type="date" defaultValue={currentDay?.date} /></div>
          <Field name="notes" label="Day notes" defaultValue={currentDay?.notes} />
          <button>{currentDay ? 'Save day' : 'Add day'}</button>
        </fieldset></form>
      </section>}
    {section === 'Scenes' && <section className="panel" id="scenes">
      <h2>Scenes & shots</h2>
      <form onSubmit={submit(get => ({ ...project, scenes: [...project.scenes, { id: newId(), label: get('label') ?? '',
        title: get('title'), storyDay: get('storyDay') }] }), form => form.reset())}><fieldset disabled={busy}>
        <div className="grid"><Field label="Scene number" name="label" required /><Field label="Scene title" name="title" />
          <Field label="Story day" name="storyDay" /></div><button>Add scene</button>
      </fieldset></form>
      <form onSubmit={submit(get => ({ ...project, slates: [...project.slates, {
        id: newId(), sceneId, label: get('label'), tag: get('tag') as 'PU' | 'RTK' | undefined, description: get('description'),
      }] }), form => form.reset())}><fieldset disabled={busy || !project.scenes.length} className="stack">
        <Select label="Scene for shot" options={project.scenes} value={sceneId} onChange={setScene} />
        <div className="grid"><Field label="Shot label (optional)" name="label" />
          <label>Series<select name="tag"><option value="">Base</option><option value="PU">Pickup (PU)</option><option value="RTK">Retake (RTK)</option></select></label>
          <Field label="Shot description" name="description" /></div><button disabled={!sceneId}>Add shot</button>
      </fieldset></form>
      {!!project.scenes.length && <ul>{project.scenes.map(scene => <li key={scene.id}>{scene.label}{scene.title ? ` · ${scene.title}` : ''}
        {project.slates.filter(slate => slate.sceneId === scene.id).map(slate => ` · ${taggedShotNumber(slate.label, slate.tag) || 'Scene-wide takes'}`)}</li>)}</ul>}
    </section>}
    {section === 'Camera' && <section className="panel" id="cameras">
      <h2>Cameras</h2>
      <Select label="Manage camera" value={cameraId} blank="New camera" options={project.cameras} onChange={id => {
        setCameraId(id); setDefaults(project.cameras.find(item => item.id === id)?.defaults ?? {});
      }} />
      <form key={cameraId} onSubmit={submit(get => {
        const camera = { ...currentCamera, id: currentCamera?.id ?? newId(), label: get('label') ?? '',
          cameraType: get('cameraType'), defaults };
        return { ...project, cameras: currentCamera
          ? project.cameras.map(item => item.id === camera.id ? camera : item) : [...project.cameras, camera] };
      }, form => { if (!currentCamera) { form.reset(); setDefaults({}); } })}><fieldset disabled={busy}>
        <div className="grid"><Field label="Camera designation" name="label" required defaultValue={currentCamera?.label} />
          <Field label="Camera type" name="cameraType" defaultValue={currentCamera?.cameraType} /></div>
        <SettingsFields values={defaults} onChange={(key, value) => setDefaults(previous => ({ ...previous, [key]: value }))} />
        <button>{currentCamera ? 'Save camera' : 'Add camera'}</button>
      </fieldset></form>
    </section>}
    {section === 'Continuity notes' && <section className="panel">
      <h2>Continuity notes</h2>
      <Select label="Manage continuity note" value={continuityId} onChange={setContinuity} blank="New note"
        options={project.continuityNotes.map(note => ({ id: note.id, label: note.description }))} />
      <form key={continuityId} onSubmit={submit(get => {
        const note = { id: currentNote?.id ?? newId(), description: get('description') ?? '',
          department: get('department'), subjectName: get('subjectName'), storyDay: get('storyDay'),
          sceneId: get('sceneId'), takeId: get('takeId'), notes: get('notes'), changeNote: get('changeNote') };
        return { ...project, continuityNotes: currentNote
          ? project.continuityNotes.map(item => item.id === note.id ? note : item) : [...project.continuityNotes, note] };
      }, form => { if (!currentNote) form.reset(); })}><fieldset disabled={busy}>
        <div className="grid">{([['department', 'Department'], ['subjectName', 'Subject'], ['storyDay', 'Story day'],
          ['description', 'Continuity description'], ['changeNote', 'Change during scene']] as const).map(([key, label]) =>
          <Field key={key} name={key} label={label} required={key === 'description'} defaultValue={currentNote?.[key]} />)}
          <label>Scene<select name="sceneId" defaultValue={currentNote?.sceneId ?? ''}><option value="">Unassigned</option>
            {project.scenes.map(scene => <option key={scene.id} value={scene.id}>{scene.label}</option>)}</select></label>
          <label>Take<select name="takeId" defaultValue={currentNote?.takeId ?? ''}><option value="">Unassigned</option>
            {project.takes.map(take => <option key={take.id} value={take.id}>{slateName(project, take.slateId)} · Take {take.takeNumber}</option>)}</select></label>
        </div><label>Additional notes<textarea name="notes" defaultValue={currentNote?.notes} /></label>
        <button>{currentNote ? 'Save continuity note' : 'Add continuity note'}</button>
      </fieldset></form>
    </section>}
  </>;
}
