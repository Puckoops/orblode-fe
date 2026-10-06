# orblode-fe

The web app for **Orblode**, GEOID's site-survey platform running on Orbit: sign in, browse sites on a globe, upload survey data, download what was uploaded, and measure, compare and inspect each survey in a 3D Cesium viewer. Next.js 16 (App Router) with the Camelot design system. It is a port of GEOID's `fyns-fe`; the marketing site was not ported.

## How it talks to the backends

The browser only ever calls this app. The session token lives in an httpOnly cookie (`orblode_session`) and is attached on the server:

- **Accounts** come from Orbit's [user-svc](../user-svc). `/api/auth/*` signs people in, confirms email addresses, resets passwords and creates organisations, always with `"type": "orblode"`. The login response's user and client are kept in a second httpOnly cookie (`orblode_profile`) for display (sidebar, topbar, settings) and handed to client components by the signed-in layouts.
- **Orblode's domain** in user-svc (projects, members, permissions, viewer presets and bookmarks) is reached through `/api/users/*`, which forwards `/orblode/*` and `/users/*` with the session as a bearer token.
- **Everything else** comes from [orblode-svc](../orblode-svc) through `/api/orblode/*`, with paths identical to GEOID's asset-svc.
- **Stored files** (tiles, tilesets, GeoJSON, uploads) are read same-origin as `/files/<key>`. `src/proxy.ts` rewrites those requests to orblode-svc's files proxy with the bearer, forwarding only `Range` and the conditional-GET headers. Manifests carry `https://storage.googleapis.com/<bucket>/<key>`; `src/lib/files` maps them to `/files/<key>` on the way in and back to the stored URL when a value is sent to the API. `?download=1` makes orblode-svc answer with a short-lived signed link.
- **Uploads** go straight to storage with the signed PUT URL orblode-svc mints, with progress, a stall watchdog and a resumable retry.

Every backend answers with `{status, data, error, message}`; `src/lib/api` unwraps `data` and surfaces `message`. A 401 from either backend clears the session and lands on `/sign-in?next=…`.

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

Checks: `npm run typecheck`, `npm run lint`, `npm test` (Node's test runner over `src/lib/**/*.test.ts`) and `npm run build`.

## Camelot

`@puckoops/camelot` is installed from `vendor/puckoops-camelot-0.1.0.tgz`, the same packed build orbit-fe uses. Its stylesheet is imported into a cascade layer (`src/app/globals.css`) between Tailwind's base and utilities. Tailwind is kept as the layout layer only: its colour palette and type scale are switched off, so colour comes from Camelot's role tokens (`bg-surface`, `border-hairline`, `text-ink-3`) and text size from Camelot's type classes (`small`, `caption`, `caps`, `num`).

The Cesium scene's colours and materials (measurement palette, heatmaps, draft and selection styling) are data rendering, not chrome, and live in `src/lib/viewer/sceneStyle.ts`, the one module allowed literal colours.

## Deployment

Vercel builds the repo as a Next.js project from its root (`npm install`, `npm run build`), with `USER_SVC_URL` and `ORBLODE_SVC_URL` set for Production and Preview and `NEXT_PUBLIC_CESIUM_ION_TOKEN` set before the build. `src/proxy.ts` runs on the Node.js runtime and rewrites `/files/*` to the external orblode-svc URL, which Vercel supports for proxy rewrites. The build needs about 8 GB of heap (`NODE_OPTIONS` in the build script) because of the viewer.

## Deviations from the port spec

- **Next.js 16.3.8 instead of fyns-fe's 16.2.6.** 16.2.6 carries critical advisories (RCE in the image optimizer, SSRF in rewrites, a proxy bypass) that the `/files` rewrite would sit right on top of. 16.3.8 is what orbit-fe runs. React stays at fyns-fe's 19.2.4.
- **Upload CORS fallback.** fyns-fe retried a CORS-blocked signed PUT through its `/gcs` rewrite. The `/files` proxy is read-only (`GET|HEAD`), so a blocked PUT now fails with a message naming the bucket's CORS rule instead of retrying. The bucket must allow PUT from the app's origins.
- **`/sign-up` creates an organisation.** fyns-fe's page only said accounts were by invitation; the spec's public `POST /orblode/clients/signup` makes self-serve sign-up real, so the page now sends GEOID's client sign-up fields and ends at the inbox like Orbit's sign-up.
- **Session profile cookie.** fyns-fe kept the login response's user and client in local/session storage. With the token httpOnly, they are kept in an httpOnly `orblode_profile` cookie with the same lifetime and read by the signed-in layouts. "Remember me" decides whether both cookies outlive the browser session.
