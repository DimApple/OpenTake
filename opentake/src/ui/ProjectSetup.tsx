import { useState } from 'react';
import { createProject, newId, type Project } from '../domain/model';
import { Field } from './Fields';
import { errorText } from './useLibrary';

export function ProjectSetup({ busy, collapsible, save }: {
  busy: boolean;
  collapsible: boolean;
  save: (project: Project) => Promise<boolean>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    const form = event.currentTarget;
    const data = new FormData(form, (event.nativeEvent as SubmitEvent).submitter);
    const get = (key: string) => String(data.get(key) ?? '').trim();
    try {
      const project = createProject(get('title'));
      if (data.get('mode') !== 'blank') {
        const sceneId = newId();
        project.shootingDays.push({ id: newId(), name: get('day'), date: get('date') || undefined });
        project.scenes.push({ id: sceneId, label: get('scene') });
        project.slates.push({ id: newId(), sceneId, label: get('shot') || undefined });
        project.cameras.push({ id: newId(), label: get('camera') });
      }
      if (await save(project)) {
        form.reset();
        setExpanded(false);
      }
    } catch (error) {
      setError(errorText(error));
    }
  }

  if (collapsible && !expanded) {
    return <section className="panel"><button disabled={busy} onClick={() => setExpanded(true)}>New project</button></section>;
  }

  return <form className="panel editor" onSubmit={event => void submit(event)}>
    <h2>New project</h2>
    <p className="hint">Start with one shooting day, scene, and camera. Add more in Project as you go.</p>
    {error && <p role="alert">{error}</p>}
    <fieldset disabled={busy}>
      <Field label="Project title" name="title" required />
      <div className="grid">
        <Field label="Shooting day" name="day" defaultValue="Day 1" required />
        <Field label="Date (optional)" name="date" type="date" />
        <Field label="Scene" name="scene" defaultValue="1" required />
        <Field label="Shot (optional)" name="shot" />
        <Field label="Camera designation" name="camera" defaultValue="A" required />
      </div>
      <div className="actions">
        <button className="primary" name="mode" value="log">Create &amp; Log Take</button>
        <button name="mode" value="blank" formNoValidate>Create blank project</button>
        {collapsible && <button type="button" disabled={busy} onClick={() => setExpanded(false)}>Cancel</button>}
      </div>
    </fieldset>
  </form>;
}
