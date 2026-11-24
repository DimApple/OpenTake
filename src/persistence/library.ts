import { validateProject, type Project } from '../domain/model';

export interface StoredProject { project: Project; revision: number }
export const DATABASE = 'opentake';
const DATABASE_VERSION = 1;

export function openLibrary(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, DATABASE_VERSION);
    const timer = setTimeout(() => fail(new Error('Opening local storage timed out.')), 5000);
    let settled = false;
    function fail(error: unknown) {
      settled = true;
      clearTimeout(timer);
      reject(error);
    }
    request.onupgradeneeded = () => {
      if (settled) { request.transaction?.abort(); return; }
      request.result.createObjectStore('projects', { keyPath: 'project.projectId' });
      request.result.createObjectStore('recovery', { keyPath: 'project.projectId' });
    };
    request.onblocked = () => fail(new Error('Close other OpenTake tabs and retry.'));
    request.onerror = () => fail(request.error);
    request.onsuccess = () => {
      clearTimeout(timer);
      const db = request.result;
      if (settled) { db.close(); return; }
      db.onversionchange = () => db.close();
      resolve(db);
    };
  });
}

export function listProjects(db: IDBDatabase, store = 'projects'): Promise<StoredProject[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store);
    const request = tx.objectStore(store).getAll();
    tx.oncomplete = () => resolve(request.result);
    tx.onabort = () => reject(tx.error);
  });
}

/** Store the previous committed snapshot and advance the revision atomically. */
export function commitProject(db: IDBDatabase, input: Project, expectedRevision: number | null, protectBackup = false): Promise<StoredProject> {
  const project = validateProject(input);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['projects', 'recovery'], 'readwrite');
    const store = tx.objectStore('projects');
    const backups = tx.objectStore('recovery');
    const read = store.get(project.projectId);
    const result = { project, revision: (expectedRevision ?? 0) + 1 };
    let failure: Error | undefined;
    read.onsuccess = () => {
      const current = read.result as StoredProject | undefined;
      if ((current?.revision ?? null) !== expectedRevision) {
        failure = new Error('Another tab changed this project. Your input is still here. Export a recovery copy or reopen the app before retrying.');
        tx.abort();
        return;
      }
      if (current && protectBackup) backups.put(current);
      store.put(result);
    };
    tx.oncomplete = () => resolve(result);
    tx.onabort = () => reject(failure ?? tx.error ?? new Error('Project save was canceled.'));
  });
}
