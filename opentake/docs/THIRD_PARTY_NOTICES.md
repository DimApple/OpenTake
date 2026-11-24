# OpenTake third-party notices

OpenTake includes code from **Open Shot Designer**, copyright (C) 2026 koosoli,
under GPL-3.0-or-later. The source snapshot is package version 1.15.2,
SHA-256 bf9699a770ac6c909e656ad8fc7f9abc17ff70c6347472b6ff3dcdc7ee45bd37.
Upstream repository: https://github.com/koosoli/OpenShotDesigner

See LICENSE for the upstream grant. The complete preferred source for the Phase 1
build is distributed as OpenTake-GitHub-Pages.zip beside the PWA archive.

- Copied from upstream `src/domain/continuity/` on 2026-11-23: `fileNames.ts`,
  `slate.ts`, `sticky.ts`, `types.ts`, `ale.ts`, and `setReports.ts`.
- Adapted from that directory on 2026-11-23: `resolveCsv.ts` (explicit project
  credit fields in place of upstream crew resolution).
- `logging.ts`, `reporting.ts` and `transfer/csv.ts` adapt upstream continuity,
  reporting and CSV parsing behavior on 2026-11-23.
- OpenTake icons use original artwork. The upstream PDF, screenplay, fonts,
  collaboration, CAD and third-party Resolve template are excluded.

Bundled runtime licenses (installed package LICENSE files in `licenses/`):

| Package | Version | License |
|---|---|---|
| fflate | 0.8.3 | MIT |
| React | 19.3.1 | MIT |
| React DOM | 19.3.1 | MIT |
| scheduler | 0.28.0 | MIT |
| Zod | 4.6.7 | MIT |

Development-only direct dependencies checked against installed package metadata:

| Package | Version | License |
|---|---|---|
| @types/react, @types/react-dom | 19.3.0 each | MIT |
| fake-indexeddb | 6.2.8 | Apache-2.0 |
| playwright-core | 1.65.1 | Apache-2.0 |
| TypeScript | 7.0.2 | Apache-2.0 |
| Vite | 8.3.8 | MIT |
| Vitest | 5.1.1 | MIT |

The lockfile covers the exact toolchain graph. Development dependencies are
installed separately by contributors. The browser used for testing is separate
from the app, build and source archive. The deployment archive includes the
bundled runtime notices. The source needs no upstream checkout or assets.
