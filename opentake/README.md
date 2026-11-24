# OpenTake · Phase 1

OpenTake is a standalone, local-first camera log. Fill in the project title and
check the starter shooting day, scene, and camera. The shot label is optional. Use **Create & Log
Take** to open a ready-to-use log. Add more records in **Project**. **Save &
Next Take** commits to this browser's IndexedDB. **Takes** opens search and edit.
Use **Export** to copy a project between devices or to review camera and sound
reports and reconcile filenames.

## Launch locally

Use Node.js 24 (verified with 24.22.3) and npm. From this directory:

```sh
npm ci
npm run dev -- --host 127.0.0.1
```

Open the URL Vite prints, normally http://127.0.0.1:5173. Development mode
supports the workflow with local storage; the service worker runs in production
preview. The first dependency installation needs access to your npm registry.

```sh
npm test
npm run build
npm run preview -- --host 127.0.0.1
```

Use the printed preview URL, normally http://127.0.0.1:4173. Wait for **Offline
ready** before testing a reload with the network disabled. The browser profiles,
ports and hostnames are different storage origins. Transfer with .otake if you
switch origins. To run Playwright against the production build:

```sh
CHROMIUM_PATH=/path/to/chromium npm run test:browser
```

The harness defaults to /usr/bin/chromium and starts Vite Preview on loopback
port 4367. It uses fresh test browser profiles and synthetic records.

## Deploy the PWA

Serve the PWA archive's contents or `dist/` from one stable HTTPS origin or
subdirectory, with a trailing-slash URL. Include all assets and serve `sw.js`
as JavaScript. Provide the matching Phase 1 source archive or source tag
alongside the deployment. The build works with localhost for testing secure
browser APIs. Opening index.html directly from a file manager does not run the
application correctly.

## Storage and file transfer

The committed project lives in IndexedDB. Small in-progress take drafts are
checkpointed in browser localStorage, separately from the committed project and
by browser tab. Reopen the same screen after reload or use **Drafts from other
sessions** when a prior tab's draft exists. A new take or edited take is committed
using the form's Save button. If saving fails, keep the form open to retry or
export a copy with the draft. Storage clearing by the browser or user can remove
both stores. Export an .otake to back up work independently of the browser.

The .otake ZIP includes exactly manifest.json, project.json and checksums.json.
Current exports use stored ZIP entries for broad compatibility. Deflated imports
need a browser with DecompressionStream('deflate-raw'). Imports validate the
container, version, record shape, links and integrity before preview. Matching
project IDs default to a separate copy. To recover a replaced project, export its
backup from **Recovery copies** and import it as a separate copy.

CSV is UTF-8 with the Phase 0 native field names. For a third-party CSV use comma
separation and at least scene_label and take_number. Other supported
native columns may be added. Preview names unsupported fields and omissions before
commit. CSV represents take rows and their labels. Camera defaults, continuity
notes, project-level credits and records without takes require .otake. Import
native ID/label columns as Text in spreadsheet software to avoid coercion.
Native text fields use the apostrophe-v1 encoding from the Phase 0 schema: a
single prefixed apostrophe marks a formula-sensitive value or original leading
apostrophe. An exact lone apostrophe represents an explicitly empty text value.
Resolve CSV and Avid ALE are separate editorial exports.

See IMPLEMENTATION-REPORT.md and THIRD_PARTY_NOTICES.md for scope and licensing.

## GitHub Pages

This package includes the prebuilt PWA in `docs/`. Commit the contents of this
repository to `main`. In **Settings → Pages**, select **Deploy from a branch**,
then **main** and **/docs**, and click **Save**. The project site is typically
served at `https://YOUR-USERNAME.github.io/opentake/`.

For future updates, run `npm ci` and `npm run build`. Replace the published build
files in `docs/` with the new `dist/` files, keep `docs/.nojekyll`, then commit.
The compiled app and source should be published from the same revision.

On iPhone, open the published URL in Safari, choose **Share → Add to Home
Screen**, and enable **Open as Web App** if shown. On the first launch from the
Home Screen, wait for **Offline ready** before testing with Airplane Mode.
Projects stay in local storage for that website. Transfer an existing project
by exporting and importing an .otake file.
