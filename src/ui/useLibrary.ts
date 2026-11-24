import { useEffect, useRef, useState } from 'react';
import { commitProject, listProjects, openLibrary, type StoredProject } from '../persistence/library';
import type { Project } from '../domain/model';

export const errorText = (error: unknown) => error instanceof Error ? error.message : String(error);

export function useLibrary() {
  const db = useRef<IDBDatabase | null>(null);
  const lock = useRef(false);
  const [records, setRecords] = useState<StoredProject[]>([]);
  const [activeId, select] = useState('');
  const [state, setState] = useState<'Opening' | 'Saved' | 'Saving' | 'Save failed' | 'Storage unavailable'>('Opening');
  const [error, setError] = useState('');
  const [attempt, retry] = useState(0);
  useEffect(() => {
    let closed = false;
    openLibrary().then(async connection => {
      if (closed) { connection.close(); return; }
      db.current = connection;
      const projects = await listProjects(connection);
      if (closed) return;
      setRecords(projects);
      select(current => projects.some(item => item.project.projectId === current) ? current : (projects[0]?.project.projectId ?? ''));
      setState('Saved');
      setError('');
    }).catch(error => {
      if (!closed) { setState('Storage unavailable'); setError(errorText(error)); }
    });
    return () => { closed = true; db.current?.close(); db.current = null; };
  }, [attempt]);

  const active = records.find(record => record.project.projectId === activeId);
  async function save(input: Project, revision: number | null, backup = false) {
    if (lock.current) return false;
    lock.current = true;
    setState('Saving');
    setError('');
    try {
      if (!db.current) throw new Error('Local storage is unavailable. Retry storage or export your draft for recovery.');
      const record = await commitProject(db.current, input, revision, backup);
      setRecords(previous => [...previous.filter(item => item.project.projectId !== input.projectId), record]);
      select(input.projectId);
      setState('Saved');
      return true;
    } catch (error) {
      setState('Save failed');
      setError(errorText(error));
      return false;
    } finally { lock.current = false; }
  }

  const persist = (project: Project) => save({ ...project, updatedAt: new Date().toISOString() }, active?.revision ?? null);
  async function backups() {
    if (!db.current) throw new Error('Local storage is unavailable.');
    return listProjects(db.current, 'recovery');
  }
  return { active, records, select, save, persist, state, error, retry: () => retry(attempt + 1), backups };
}
