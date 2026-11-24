import { cp, readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

for (const path of ['LICENSE', 'THIRD_PARTY_NOTICES.md', 'licenses']) {
  await cp(path, 'dist/' + path, { recursive: true });
}

const assets = (await readdir('dist', { recursive: true, withFileTypes: true }))
  .filter(entry => entry.isFile() && entry.name !== 'sw.js')
  .map(entry => './' + (entry.parentPath + '/' + entry.name).replace(/^dist\//, '')).sort();
const build = createHash('sha256');
for (const file of assets) build.update(file).update(await readFile('dist/' + file.slice(2)));
const worker = await readFile('src/sw.js', 'utf8');
build.update(worker);
await writeFile('dist/sw.js', worker.replace('__BUILD__', JSON.stringify(build.digest('hex')))
  .replace('__ASSETS__', JSON.stringify(['./', ...assets])));
