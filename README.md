# orblode-fe

The web app for **Orblode**, GEOID's site-survey platform running on Orbit: sign in, browse sites on a globe, upload survey data, download what was uploaded, and measure, compare and inspect each survey in a 3D Cesium viewer. Next.js 16 (App Router) with the Camelot design system. It is a port of GEOID's `fyns-fe`; fyns-fe's marketing site was not ported, and `/` is Orblode's own landing page instead (signed-in visitors go straight to `/globe`).

## How it talks to the backends

The browser only ever calls this app. The session token lives in an httpOnly cookie (`orblode_session`) and is attached on the server:

- **Accounts** come from Orbit's [user-svc](../user-svc). `/api/auth/*` signs people in, confirms email addresses, resets passwords and creates organisations, always with `"type": "orblode"`. "Sign in with Google" on `/sign-in` sends Google's credential to `/api/auth/google`, which exchanges it at user-svc's `/user/oauth`; it signs in people whose email already belongs to an organisation, and never creates one. The login response's user and client are kept in a second httpOnly cookie (`orblode_profile`) for display (sidebar, topbar, settings) and handed to client components by the signed-in layouts.
- **Orblode's domain** in user-svc (projects, workspaces, people, teams, access, permissions, viewer presets and bookmarks) is reached through `/api/users/*`, which forwards `/orblode/*` and `/users/*` with the session as a bearer token.
- **Who can do what** is managed as GitHub manages an organisation's repositories. Settings has People (invite, change someone's role between owner, admin and member, remove), Teams (group people, maintainers manage a team) and Organisation (what members may create on their own). A person, a team or everyone in the organisation gets roles on a workspace, under Workspace → Access, which reach every site in it; a site's panel has its own Access drawer for roles on that site alone, beside those it inherits. `src/lib/access/roles.ts` names and describes each role. `GET /orblode/organisation` says what the signed-in person may do (`src/lib/organisation/store.ts`), to show or hide controls; user-svc decides.
- **Everything else** comes from [orblode-svc](../orblode-svc) through `/api/orblode/*`, following [`ORBLODE_API_CONTRACT.md`](../ORBLODE_API_CONTRACT.md).
- **Demo requests** from the landing page go through `/api/leads`, the one route that needs no session. It forwards `{name, email, company, message, website}` to orblode-svc's public `POST /leads` (stored in the `leads` collection) with the visitor's `X-Forwarded-For`, so the service's per-address rate limit counts people rather than this server; `website` is a hidden honeypot.
- **Stored files** (tiles, tilesets, GeoJSON, uploads) are read same-origin as `/files/<key>`. `src/proxy.ts` rewrites those requests to orblode-svc's files proxy with the bearer, forwarding only `Range` and the conditional-GET headers. Manifests carry `https://storage.googleapis.com/<bucket>/<key>`; `src/lib/files` maps them to `/files/<key>` on the way in and back to the stored URL when a value is sent to the API. `?download=1` makes orblode-svc answer with a short-lived signed link.
- **Uploads** go straight to storage with the signed PUT URL orblode-svc mints, with progress, a stall watchdog and a resumable retry.

Every backend answers with `{status, data, error, message}`; `src/lib/api` unwraps `data` and surfaces `message`. A 401 from either backend clears the session and lands on `/sign-in?next=…`.

## What it expects from the backends

- Every response in the `{status, data, error, message}` envelope; `message` is shown to people on failure.
- `POST /user/login` with `type: "orblode"` answering `data: {token, expire_at, user, client, membership}`; 400 or 401 for bad credentials, 403 for an unconfirmed address, 429 when rate-limited.
- Email links built from the URLs this app sends: `verify_url` (`<origin>/verify[?next=…]`) and `reset_url` (`<origin>/reset-password`) get `token=<token>` appended as a query parameter.
- `POST /orblode/clients/signup` taking GEOID's client sign-up fields (`name, email, password, company_name, company_role, domain, phone, address, city, state, zip, country`) plus `verify_url`, with the Orbit password rule; 409 when the email exists and the password does not match.
- orblode-svc speaking the contract in [`ORBLODE_API_CONTRACT.md`](../ORBLODE_API_CONTRACT.md):
  - Entity ids are opaque strings (24-hex ObjectIDs; `client_id` and `project_id` are user-svc UUIDs). The app never parses them.
  - Every `*_at` is an integer of epoch milliseconds; `survey_date` stays `YYYY-MM-DD`. `src/lib/time.ts` formats and sorts them.
  - `created_by` / `edited_by` are `{id, email}` set by the server; the app never sends them.
  - `GET /surveys?project_id=`, `/surveys/:id/assets`, `/surveys/:id/measurements`, `/designs?project_id=` and `/materials` are paged (`page`, `page_size`; `data: {<plural>, total, page, page_size}`). `fetchAllPages` (`src/lib/api/paging.ts`) walks pages of 100 until `total` wherever the app needs a whole list.
  - Updates are `PUT` (asset uploaded, measurement, folder); deletes answer `200` with `data: null` (a `204` is accepted too).
  - `POST /surveys/:id/generate` is sent only for the processor types with a legacy worker. The upload planner dispatches `orthophoto-tiles`, `pointcloud-tiles`, `vector-features` and, for a DSM or DTM, `terrain-quantized-mesh` directly.
  - `POST /surveys/:id/measurements/:mid/compute` and `/estimate` are offered only for `volume`, `stockpile` and `cut_fill` with an instant method (`smart_base`, `reference_level`). A `422` shows the server's message.
  - `POST /surveys/:id/profile` draws a line's cross-section: the survey's DSM first, then each compared survey (DSM or DTM) or design, sampled at shared stations. A surface that cannot be read carries its own `error`, shown in the chart's legend.
- orblode-svc's public `POST /leads` answering 201 for a stored request, 400 with a message for a bad field and 429 past its rate limit.
- orblode-svc's `GET|HEAD /files/<key>` honouring `Range`, and `?download=1` answering a 302 to a signed link with a filename.
- A storage CORS rule that admits `PUT` from this app's origins, since uploads go straight to the bucket.

## Running it

```bash
cp .env.example .env.local    # point the two URLs at running services
npm install                   # also copies Cesium's static build into public/cesium
npm run dev                   # http://localhost:3100
```

| Variable | Where it is read | |
|---|---|---|
| `USER_SVC_URL` | server, at request time | user-svc's API base, e.g. `https://api.dev.puckoops.com/user-svc-smm/api/v1` |
| `ORBLODE_SVC_URL` | server, at request time | orblode-svc's API base, e.g. `https://api.dev.puckoops.com/orblode-svc/api/v1` |
| `NEXT_PUBLIC_CESIUM_ION_TOKEN` | browser, inlined at build time | Cesium ion token for World Terrain and the Digital Twin layer; optional |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | browser, inlined at build time | The Google OAuth client user-svc's `GOOGLE_CLIENT_ID` names; empty hides "Sign in with Google". Its authorised JavaScript origins must list this app's origin, `http://localhost:3100` included. |

Checks: `npm run typecheck`, `npm run lint`, `npm test` (Node's test runner over `src/lib/**/*.test.ts`) and `npm run build`.

## Camelot

`@puckoops/camelot` is installed from `vendor/puckoops-camelot-0.2.0.tgz`, the same packed build orbit-fe uses. Its stylesheet is imported into a cascade layer (`src/app/globals.css`) between Tailwind's base and utilities. Tailwind is kept as the layout layer only: its colour palette and type scale are switched off, so colour comes from Camelot's role tokens (`bg-surface`, `border-hairline`, `text-ink-3`) and text size from Camelot's type classes (`small`, `caption`, `caps`, `num`).

The Cesium scene's colours and materials (measurement palette, heatmap legend, draft and selection styling, site markers) are data rendering, not chrome, and live in `src/lib/viewer/sceneStyle.ts`. That module and the landing page's `landing.module.css`, which has its own fixed dark palette, are the only places allowed literal colours. The space around the globe takes the theme's `--canvas` token, so the viewer follows light and dark. The app opens in dark (a 3D viewer reads best there); Settings and the account menu switch it.

Where Camelot has no equivalent, these stay:

- **`radix-ui` Collapsible** for the dense disclosure headers of the measurement tree and the layer sections (Camelot's Accordion is a full-height page section).
- **framer-motion** for the draggable detail panel and the toolbar pills, animating transform and opacity only, under `MotionConfig reducedMotion="user"`.
- **Plain elements** where no Camelot component fits: selectable list rows (site list, tree rows), the compass ring and drag handle, the measurement colour swatches, the command palette's options, the inline-editable measurement title, and the tag token input on Upload.
- **The command palette** overlay (Camelot has none), built from `SearchInput` and tokens; the scene context menu is Camelot's `Menu` anchored at the cursor.
- **The Orblode logo** (`src/components/brand/OrblodeLogo.tsx`) in place of Camelot's `BrandMark`, with its wordmark in Space Mono. `SidebarBrand` always draws `BrandMark`, so the rail's brand row is rebuilt in `shell.module.css` with the same breakpoints. The favicon (`src/app/icon.svg`) follows the OS light/dark setting; `src/app/apple-icon.png` is the white mark on black.
- **The Orblode loader** (`src/components/brand/Loader.tsx`), a pulsing mark, in place of Camelot's skeletons for page- and panel-level waits: route `loading.tsx` files, the auth forms' Suspense fallbacks, Cesium loading on the globe and viewer, the survey scene until its manifest arrives, and the site, survey, file and survey-tree lists. Inline progress (layer rows, buttons, search, uploads) stays on Camelot's `ProgressCircle`, `Progress` and `Button loading`.
- **The landing page** (`src/app/(marketing)/page.tsx`, `src/components/landing/`) is a marketing surface outside Camelot: a fixed dark palette and CSS modules. It is a static page that plays pictures rendered ahead of time from the survey flagged as the showcase in orblode-svc: a looping hero video, a descent video whose frame follows the scroll, a try-it turntable of 72 frames with preset measurements, and AVIF/WebP stills. They live in `public/landing/<site>-<hash>/`, described by `src/lib/landing/media.json`. They come from the same renderer the page used to run live (a z-buffered point-cloud renderer on a 2D canvas, `scene/CloudView.ts`, fed by `scene/terrain.worker.ts`), which now only runs on a capture route that exists when `LANDING_CAPTURE=1`. When a different survey is flagged, re-capture: `ORBLODE_SVC_URL=… npm run landing:capture` (Google Chrome and ffmpeg needed; the frames go to `.landing-capture/`), then `npm run landing:encode`, which fails on dropped frames, low VMAF or a file over its size budget, and commit `public/landing` and `media.json`. Every "Request a demo" opens one `<dialog>` (`DemoRequest.tsx`) whose form posts to `/api/leads`; the closing email field opens it with the address filled in.

## Deployment

Vercel builds the repo as a Next.js project from its root (`npm install`, `npm run build`), with `USER_SVC_URL` and `ORBLODE_SVC_URL` set for Production and Preview and `NEXT_PUBLIC_CESIUM_ION_TOKEN` and `NEXT_PUBLIC_GOOGLE_CLIENT_ID` set before the build. Google accepts only the origins listed on its client, so the Google button works on `www.orblode.com` (where `orblode.com` redirects) and not on preview URLs. `src/proxy.ts` runs on the Node.js runtime and rewrites `/files/*` to the external orblode-svc URL, which Vercel supports for proxy rewrites. The build needs about 8 GB of heap (`NODE_OPTIONS` in the build script) because of the viewer.

## Deviations from the port spec

- **Next.js 16.3.8 instead of fyns-fe's 16.2.6.** 16.2.6 carries critical advisories (RCE in the image optimizer, SSRF in rewrites, a proxy bypass) that the `/files` rewrite would sit right on top of. 16.3.8 is what orbit-fe runs. React stays at fyns-fe's 19.2.4.
- **Upload CORS fallback.** fyns-fe retried a CORS-blocked signed PUT through its `/gcs` rewrite. The `/files` proxy is read-only (`GET|HEAD`), so a blocked PUT now fails with a message naming the bucket's CORS rule instead of retrying. The bucket must allow PUT from the app's origins.
- **`/sign-up` creates an organisation.** fyns-fe's page only said accounts were by invitation; the spec's public `POST /orblode/clients/signup` makes self-serve sign-up real, so the page now sends GEOID's client sign-up fields and ends at the inbox like Orbit's sign-up.
- **Session profile cookie.** fyns-fe kept the login response's user and client in local/session storage. With the token httpOnly, they are kept in an httpOnly `orblode_profile` cookie with the same lifetime and read by the signed-in layouts. "Remember me" decides whether both cookies outlive the browser session.
- **Tailwind kept as the layout layer.** orbit-fe uses CSS modules only. The viewer's dense overlay layout ported far more safely as utilities, so Tailwind 4 stays, but with its palette and type scale removed (see Camelot above): it cannot produce a literal colour or font size.

## Changed or dropped from fyns-fe

- Dropped: the marketing route group (per the spec), the disabled Google/Microsoft SSO buttons, the dead "Report" button on the site panel, and `MeasurementPanel`, a component fyns-fe no longer rendered (its draw types moved to `src/lib/viewer/draw.ts`).
- Dropped because orblode-svc has no worker for them (`ORBLODE_PROCESSORS.md`): contour generation, GCP verification, GCP and drone-photo uploads (with the Survey upload type and the Images/GCPs toggles), design conformance, the co-register step (a DSM/DTM goes straight to terrain tiles), and every volume method but smart base and reference level, including the cross-survey compute in compare mode. Contour and TIN measurements can still be drawn, saved, listed and deleted; designs are still registered and drawn.
- Changed: cross-sections are drawn from orblode-svc's PostGIS profile in place of the profile-extract worker, and follow Propeller's layout rather than fyns-fe's inspector chart. A selected line gets a dock (its inspector's switch turns it off), and Cross-section has its own toolbar button as in Propeller. The dock sits over the bottom of the canvas and shows every compared surface, a readout under the cursor (elevation and the difference from the survey, width at a level, or grade), pins, a 1:n aspect ratio, wheel zoom, and CSV and DXF exports (the section in 2D, or the line in 3D in the survey's coordinates). A dot follows the cursor along the line on the scene. The compared surfaces and the switch are kept in the measurement's `params.cross_section`.
- Added: the landing page at `/`, `/forgot-password`, `/reset-password`, `/verify`, a not-found page, an appearance setting, and viewer keyboard shortcuts each person can rebind in Settings.
- The viewer's URL state codec (`src/lib/viewer/urlState.ts`) is still the no-op seam it is in fyns-fe: camera, module and selection are not in the URL yet.
