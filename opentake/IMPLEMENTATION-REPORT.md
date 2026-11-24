# OpenTake Phase 1 implementation report

OpenTake launches as a standalone React/TypeScript/Vite application. The
production package is a static PWA bundle. Its corresponding source package
contains the lockfile, tests, build scripts, licenses and launch instructions.

Phase 1 delivers a functional foundation for evaluation. The desktop and touch
layout workflows were exercised in Linux Chromium. Real phone installation,
Safari, Windows and macOS still need verification before a general release.

## Source extraction and feature preservation

The Phase 0 audit matched the attached copy and the archived source. The original
ZIP retains SHA-256
`bf9699a770ac6c909e656ad8fc7f9abc17ff70c6347472b6ff3dcdc7ee45bd37`.
No upstream source file was edited. The application compiles without the upstream
checkout. Source attribution and version details are in THIRD_PARTY_NOTICES.md.

| Feature | Upstream | Phase 1 |
|---|---|---|
| Take log and slate series | `src/domain/continuity/{types,sticky,slate}.ts`, `src/domain/commands/{continuity,logTake}.ts` | Upstream pure rules are kept in `src/domain/{types,sticky,slate}.ts`. `logging.ts` maps a standalone slate and camera to those inputs. Base, PU and RTK count independently. Numbering continues across days per camera and slate. |
| Camera settings and take judgment | `sticky.ts` and `resolveCsv.ts` carry fields and resolve missing overrides from planned cameras. | Last same-day/same-camera effective settings and camera defaults seed each take. A committed take stores effective settings and provenance. Preferred, rejected, unrated and absent imported status remain distinct in native files. The default judgment resets after logging. |
| Project, scene, slate, day and camera | `src/types/index.ts`, `src/domain/script/types.ts`, `src/domain/scheduling/types.ts`, `src/context/FloorPlanContext.tsx` | `domain/model.ts` validates independent records and references. Creates days, scenes, slates and cameras. Project details, days and camera defaults can be edited. History and review require no floor plan, script or shot list. |
| Continuity and history | `ContinuityPanel.tsx`, `ContinuityBinder.tsx`, `binder.ts` | `ui/History.tsx` provides searchable/filterable take records with editing. `ui/ProjectPanel.tsx` provides editable text continuity with optional scene and take assignment. Binder photos, screenplay character links, cross-note conflict warnings and department plans are deferred. |
| Clip reconciliation | `src/domain/continuity/fileNames.ts` and `ContinuityPanel.tsx` | Original positional matching and overwrite flags feed a new day/camera/card preview. Count drift blocks bulk apply. Explicit agreement is required and manual filenames remain editable. The sequential filename helper remains in the preserved module. Automatic filename guesses are excluded from the UI. |
| Editorial and camera/sound reports | `resolveCsv.ts`, `ale.ts`, `setReports.ts` plus upstream print studio | Adapted Resolve projection keeps the header and tri-state semantics. Project credit fields replace crew lookup. ALE and camera/sound grouping remain available. Exports were tested as files, with no claim of live Resolve or Avid ingestion. Separate PDF/print studio, schedule coverage and upstream report layout are deferred. |
| Local persistence | `src/domain/storage/idb.ts`, `src/utils/projectLibrary.ts`, `src/context/useAutosave.ts` | `persistence/library.ts` opens a separate versioned database and uses a revision check and commit acknowledgment in a transaction. Import replacement records one recovery snapshot. `persistence/drafts.ts` automatically checkpoints take input in browser localStorage per tab. Committed writes use explicit Save. |
| Native files and local transfer | Upstream package and Resolve export | `transfer/archive.ts` and `transfer/csv.ts` validate before preview. Builds native .otake and round-trip take CSV. Post-preview commits default to copies for collisions and require confirmation for replacement. CSV previews missing data, unsupported columns, and duplicate/ambiguous rows. |
| Responsive and offline interface | Upstream panel, on-set overlay, partial shell caching | Shared React UI with charcoal/purple layouts. Desktop sidebar and take table, mobile bottom navigation and touch form. Build-specific service worker caches the full produced asset set. Updates wait for the user to reload or all clients to close. |

The first release uses one take row per camera. Related records can share a
capture ID. Upstream Good/NG actions that inferred which existing take to rate
were replaced with explicit status in the open form. Dedicated scheduled
coverage and print studio depend on modules outside the standalone log.
No floor-plan context, screenplay state, package asset storage, cloud,
collaboration or OpenRoll dependencies are present.

## Data integrity decisions and remaining limits

- IndexedDB receives a whole validated project snapshot per successful edit.
  Duplicate known-camera slate/take keys and invalid references are rejected.
  A revision comparison happens in the write transaction. A stale tab retains
  its form and can reload or export a recovery copy. Take recovery drafts are
  localStorage checkpoints, with a warning and navigation protection if draft
  storage is denied. They do not become logged takes until the user saves.
- Day, project and camera edits currently use explicit Save. Metadata forms
  have no crash-recovery journal. Project deletion/archival and scene/slate
  renaming are outside this increment. Recovery copies are exportable and can
  be imported independently. The latest replacement backup per project is
  retained. Draft and project storage can both be cleared by browser eviction.
- Native ZIP writes stored entries and has a 16 MiB file limit and 64 MiB expanded
  import limit. Only the three required entries in the supported ZIP profile
  may be present. CRC, SHA-256, UTF-8, duplicate JSON keys, versions, shape and
  references are checked. Deflate requires browser support for
  DecompressionStream('deflate-raw'). Limits can restrict very large libraries.
- Native CSV uses the Phase 0 fields and reversible formula-sensitive text
  encoding. A lone encoded apostrophe preserves an explicit empty scalar.
  External CSV uses canonical headers. A visual column mapping wizard and
  alternate delimiters are deferred. When no camera was supplied, repeated
  numbers are kept as distinct records and flagged in preview.
- Old worker caches are retained so active clients can still load their assets.
  Long-running deployments need a cache retirement policy and an update test
  with multiple clients. Offline Ready describes local app availability.
- The report UI groups by card or independent sound roll. Continuity marker
  notes are covered by .otake, while take notes and metadata are covered by CSV.
  The Resolve/ALE output should be verified against production media in each NLE.
- No critical data-loss defect surfaced in the tested flows. Quota failure
  injection, restricted storage and cross-tab conflicts passed. This does not
  establish browser eviction, OS-level crash recovery, or physical device
  behavior across all targets.

## Test and build report

| Command | Result |
|---|---|
| Upstream `npm ci --ignore-scripts` plus `npm test -- src/domain/__tests__/{continuity,onSetTake,setReports,ale,continuityBinder,printModels.continuity,idbLifecycle}.test.ts src/domain/commands/__tests__/continuity.test.ts src/components/__tests__/ContinuityPanel.test.tsx` | **167 passed across 9 suites.** Vite emitted a nonblocking upstream warning about `__dirname` with its future native config loader. No targeted upstream failure was observed. |
| OpenTake `npm test` | **11 passed.** Covers adapted behavior, data validation, file formats and tampering, transaction failure, revision conflicts, restart/reopen and protected replacement. |
| OpenTake `npm run build` | **Passed.** TypeScript check, Vite production bundle and build-specific precaching. |
| `CHROMIUM_PATH=/tmp/chromium npm run test:browser` | **Passed on Linux, Chromium Headless Shell 153.0.8010.0.** Desktop keyboard workflow, mobile emulated touch, stale-tab draft persistence, restricted IDB failure, editing, invalid import, replacement/backup and both file formats. Mobile opened with network disabled, verified an uncached request failed, logged and edited takes, reloaded, then exported and imported. Desktop reopening was also exercised offline. |
| Production contents | Verified index, hashed JS/CSS, manifest, 192px/512px icons, service worker, and licenses. Matching source includes package metadata and lockfile, adapted modules, tests and build scripts. |
| Clean archive rebuild and development launch | Fresh unzip plus npm ci rebuilt byte-for-byte identical dist files. The packaged source development entry loaded in Chromium. |

The environment's system Chromium could not launch because it was denied a
process-singleton socket. Playwright's browser CDN returned HTTP 403. A separate
npm-distributed Chromium Headless Shell made real browser checks possible. An
early offline browser run revealed a cache miss on Vite's CORS-varying module
response, corrected by matching exact allowlisted static URLs independently of
the request's Origin variation. The final test checked for service-worker
navigation and used a failed uncached network request as offline evidence.
Mobile checks used Chromium touch/viewport emulation. Physical Android,
iPhone/Safari, Windows, macOS and browser installation were not exercised.

## Acceptance and next phase

| Phase 1 criterion | Evidence or remaining boundary |
|---|---|
| 1. Launch independently | Standalone source build and Chromium launch passed. |
| 2–4. Create and reopen local project, log records, survive restart | Tested creation, persistence after page reload, new DB connection and offline reopening. Whole browser process/OS restart is pending. |
| 5–6. Inheritance, status and notes editing | Unit tests and browser flow passed. |
| 7. Desktop/mobile usable | Linux Chromium desktop and touch-emulated mobile passed. Real devices and accessibility with assistive technology are pending. |
| 8. Offline after initial caching | Chromium desktop and touch-emulated mobile passed. Native installation and update rollover remain unverified. |
| 9. Both formats work on both layouts | Browser round trips from desktop to the emulated phone and on both layouts. Physical file sharing is pending. |
| 10–12. Tests, critical loss review and reproducible build | Targeted upstream and standalone suites passed. Fault cases and scope above are recorded. Build and source instructions are included. |

Phase 2 should start with physical iPhone and Android tests, an installed PWA
relaunch with airplane mode enabled, and Windows/Linux/macOS browser coverage.
Then exercise controlled update rollover, extend the revision/draft recovery
model to metadata forms and test longer offline sessions under storage
pressure. Finish scene/slate management and CSV column mapping before broad
production use. Add PDF and binder features only after verifying the transport
and storage model with real crews. No platform outside the tested Chromium
environment is certified by this package.
