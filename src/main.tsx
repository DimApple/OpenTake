import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { deleteTakes, slateName } from './domain/logging';
import { draftPrefix, ownDraftKey } from './persistence/drafts';
import { type LogTake, type Project } from './domain/model';
import { useOffline } from './pwa';
import { Select } from './ui/Fields';
import { NavigationIcon } from './ui/NavigationIcon';
import { History } from './ui/History';
import { ProjectPanel, type ProjectSection } from './ui/ProjectPanel';
import { ProjectSetup } from './ui/ProjectSetup';
import { TakeEditor } from './ui/TakeEditor';
import { downloadProject, TransferPanel } from './ui/TransferPanel';
import { errorText, useLibrary } from './ui/useLibrary';
import './style.css';

const pages = ['Takes', 'Log', 'Scenes', 'Camera', 'Export', 'Project'] as const;
type Page = typeof pages[number];
function App() {
  const library = useLibrary();
  const offline = useOffline();
  const [chosenPage, setPage] = useState<Page>();
  const [section, setSection] = useState<ProjectSection>();
  const [day, setDay] = useState('');
  const [editing, edit] = useState<LogTake>();
  const [dirty, setDirty] = useState(false);
  const [unprotected, protect] = useState(false);
  const [error, setError] = useState('');
  const project = library.active?.project;
  const page = chosenPage ?? (!project || matchMedia('(max-width: 720px)').matches ? 'Log' : 'Takes');
  useEffect(() => { window.scrollTo(0, 0); }, [page]);
  const busy = library.state === 'Opening' || library.state === 'Saving';
  const activeDay = project?.shootingDays.find(row => row.id === day)?.id ?? project?.shootingDays.find(row => !row.archived)?.id ?? '';
  const canLeave = () => !unprotected || window.confirm('This draft could not be backed up. Leave and discard your current input?');
  const button = (target: Page, label: string) =>
    <button key={target} disabled={busy} aria-current={page === target ? 'page' : undefined} onClick={() => { if (canLeave()) { edit(undefined); setSection(undefined); setPage(target); } }}>
      <NavigationIcon name={target} />{label}
    </button>;
  function switchProject(id: string) { library.select(id); setSection(undefined); setDay(''); edit(undefined); }
  function recover(input: Project) {
    setError('');
    void downloadProject(input, '-draft').catch(error => setError(errorText(error)));
  }
  async function removeTakes(takes: readonly LogTake[]) {
    if (!project || busy || !takes.length) return false;
    const ids = new Set(takes.map(take => take.id));
    const [first] = takes;
    const camera = project.cameras.find(item => item.id === first.cameraId)?.label;
    const label = takes.length === 1
      ? [slateName(project, first.slateId), `Take ${first.takeNumber}`, camera && `Camera ${camera}`].filter(Boolean).join(' · ')
      : `${takes.length} selected takes`;
    const linked = project.continuityNotes.some(note => note.takeId && ids.has(note.takeId));
    if (!window.confirm(`Delete ${label}? This cannot be undone.${linked ? ' Linked continuity notes will be kept and unlinked.' : ''}`)) return false;
    setError('');
    try {
      if (!await library.persist(deleteTakes(project, ids))) return false;
      try {
        for (const id of ids) localStorage.removeItem(ownDraftKey(draftPrefix(project.projectId, id)));
      } catch { /* Deleted takes cannot be opened or restored through the editor. */ }
      if (editing && ids.has(editing.id)) edit(undefined);
      return true;
    } catch (error) { setError(errorText(error)); return false; }
  }

  async function create(project: Project) {
    if (!await library.save(project, null)) return false;
    setDay('');
    setSection(undefined);
    edit(undefined);
    setPage(project.slates.length ? 'Log' : 'Project');
    return true;
  }
  return <div className="app">
    <header>
      <a className="brand" href="./" onClick={event => { event.preventDefault(); if (!busy && canLeave()) { edit(undefined); setPage('Log'); } }}>
        <img src={new URL('./icon-192.png', document.baseURI).href} alt="" />OpenTake
      </a>
      <div className="header-select">
        <Select label="Active project" options={library.records.map(record => ({ id: record.project.projectId, label: record.project.title }))}
          value={project?.projectId ?? ''} onChange={id => { if (!busy && id && canLeave()) switchProject(id); }} blank="Choose project" />
      </div>
      <div className="top-state">
        <span role="status" className={`badge ${library.state === 'Saved' && !dirty ? 'preferred' : ''}`}>
          {library.state === 'Saved' && dirty ? 'Unsaved take draft' : library.state}
        </span>
        <span className="network">{offline.online ? offline.ready ? 'Offline ready' : 'Online' : 'Offline'}</span>
      </div>
    </header>
    <aside className="sidebar" aria-label="Desktop navigation">
      {pages.map(target => button(target, target === 'Log' ? 'Log take' : target))}
      <small>OpenTake · Phase 1</small>
    </aside>
    <nav className="bottom" aria-label="Mobile navigation">
      {button('Log', 'Log')}{button('Takes', 'Takes')}{button('Project', 'Project')}{button('Export', 'Export')}
    </nav>
    <main>
      {(library.error || error || offline.error) && <section className="banner" role="alert">
        <p>{error || library.error || offline.error}</p>
        {library.error && <button disabled={busy} onClick={library.retry}>Reload local projects</button>}
      </section>}
      {offline.update && <section className="banner">An update is ready. <button disabled={busy || dirty}
        onClick={offline.reloadForUpdate}>Reload to update</button></section>}
      {(page === 'Project' && !section || !project && page === 'Log') &&
        <ProjectSetup busy={busy} collapsible={Boolean(project)} save={create} />}
      {page === 'Export' && <TransferPanel key={project?.projectId ?? 'empty'} library={library} />}
      {!project && (page === 'Takes' || page === 'Scenes' || page === 'Camera') &&
        <section className="panel">
          <h2>{page === 'Camera' ? 'Cameras' : page}</h2>
          <p>Create or import a project to use this workspace.</p>
          <div className="actions">
            <button className="primary" disabled={busy} onClick={() => setPage('Project')}>Create project</button>
            <button disabled={busy} onClick={() => setPage('Export')}>Import project</button>
          </div>
        </section>}
      {project && <>
        {page === 'Log' && (
          project.scenes.length && project.cameras.length && project.shootingDays.length
            ? <TakeEditor key={project.projectId} project={project} revision={library.active!.revision} day={activeDay} persist={library.persist}
              dirty={setDirty} protect={protect} recover={recover} busy={busy} />
            : <section className="panel"><h2>Set up your log</h2><p>Add a shooting day, scene and camera first.</p>
              <button disabled={busy} onClick={() => { setSection(undefined); setPage('Project'); }}>Open project setup</button></section>
        )}
        {page === 'Takes' && <div key={project.projectId}>
          <History project={project} busy={busy} editingId={editing?.id} remove={removeTakes} edit={row => { if (!busy && canLeave()) edit(row); }} />
          {editing && <TakeEditor key={editing.id} project={project} revision={library.active!.revision} day={activeDay} editing={editing}
            persist={library.persist} done={() => edit(undefined)} dirty={setDirty} protect={protect} recover={recover} busy={busy} />}
        </div>}
        {page === 'Project' && (section
          ? <>
            <div><button disabled={busy} onClick={() => setSection(undefined)}>Back to project</button></div>
            <ProjectPanel key={project.projectId + section} project={project} section={section} persist={library.persist} busy={busy} />
          </>
          : <section className="panel">
            <h2>{project.title}</h2>
            <div className="project-sections">
              {([
                ['Shooting days', project.shootingDays.length, 'days'],
                ['Scenes', project.slates.length, 'shots'],
                ['Camera', project.cameras.length, 'cameras'],
                ['Details', undefined, ''],
                ['Continuity notes', project.continuityNotes.length, 'notes'],
              ] as const).map(([target, count, unit]) => <button key={target} disabled={busy} onClick={() => setSection(target)}>
                <strong>{target === 'Scenes' ? 'Scenes & shots' : target === 'Camera' ? 'Cameras' : target === 'Details' ? 'Project details' : target}</strong>
                {count !== undefined && <small>{count} {count === 1 ? unit.slice(0, -1) : unit}</small>}
              </button>)}
            </div>
            <div><button className="primary" disabled={busy} onClick={() => setPage('Log')}>Open take log</button></div>
          </section>)}
        {(page === 'Scenes' || page === 'Camera') &&
          <ProjectPanel key={project.projectId + page} project={project} section={page} persist={library.persist} busy={busy} />}
      </>}
    </main>
  </div>;
}
createRoot(document.getElementById('root')!).render(<App />);
