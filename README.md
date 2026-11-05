# Fleet Planner

Plans first-person household-task recording sessions: schedules recording devices into operators' homes, keeps devices busy inside their daily window, and tracks operator hours and pay (LKR, Asia/Colombo time).

Built with Next.js (App Router, TypeScript), Prisma + SQLite, Tailwind with shadcn-style components, Recharts, and Vitest.

## Quick start

Requires Node.js 20+.

```bash
npm install && npm run dev
```

Open http://localhost:3000 and sign in with the password from `.env` (default **`admin`**; change it).

The first `npm run dev` creates `.env` from `.env.example`, creates the SQLite database at `prisma/dev.db`, and seeds:

- one project: 1,000 h over 7 days from today, with default settings
- tasks: Cleaning, Organizing, Vegetable cutting, Cooking (250 h each, editable)
- devices DEV-01 to DEV-10 and power banks PB-01 to PB-10

The seed runs only on an empty database, so it never overwrites your data.

### Try it in GitHub Codespaces (no install)

On the repository page: **Code → Codespaces → Create codespace on `claude/gifted-fermat-99wxs8`** (or whichever branch holds this code). The codespace installs dependencies, loads the demo data and starts the app; a preview opens on port 3000 (also under the **Ports** tab). Sign in with `admin`. The codespace's database is throw-away test data.

### Demo data (optional)

To try the app with realistic data (12 sample operators, a project that started 3 days ago, about 80 bookings with logged sessions):

```bash
npm run db:reset:demo
```

⚠ `db:reset*` **deletes everything** in the database. Use `npm run db:reset` for a clean start with only the standard seed.

## Environment (`.env`)

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | `file:./dev.db` (SQLite, relative to `prisma/`) or a Postgres URL |
| `ADMIN_PASSWORD` | The single admin password. Changing it signs everyone out. |
| `AUTH_SECRET` | Long random string used to sign session cookies |
| `SHARE_TOKEN` | Optional. Enables a read-only share link: `/share?token=<SHARE_TOKEN>` |

## Screens

| Screen | What it does |
| --- | --- |
| **Dashboard** (`/`) | Recorded vs target, pace, projected completion, burn-up, task progress, device utilization (today and week to date), largest idle gaps, operator table and leaderboard, alerts |
| **Schedule** | Gantt board with one row per device (or per operator) and day or week view. Drag to create, move or resize, with live rule checks. Buffers are hatched and idle time is red. **Fill gaps** proposes open slots and ranks operators for each one. |
| **Today** | Day checklist: which device goes to which home and when, offloads, charges, power banks, and quick status buttons |
| **Log sessions** | Enter actual minutes per segment, pre-filled with the plan |
| **Tasks** | Targets, per-person caps, and recorded / planned / remaining hours. Shows operators still needed. |
| **Capacity** | What-if planner with sliders: feasibility verdict, shortfall and fixes, operators to recruit, cost |
| **Operators** | List and profile: hours by task, remaining cap, hours per day, history, earnings, paid vs owed |
| **Devices** | Bulk add, status, current location, lifetime hours, event log, power banks |
| **Payments** | Amount owed per operator for a date range; mark as paid with a reference |
| **Export** | CSV or Excel for bookings, operator hours, task progress and payments; one-click database backup |
| **Projects / Settings** | Create, select and archive projects. Every scheduling rule is editable per project. |

## How the rules work

All scheduling logic lives in **`lib/rules/`**: pure TypeScript with no database or UI code, covered by unit tests (`npm test`). The schedule board runs these rules in the browser for live feedback, and the server runs the same functions again before saving.

- `validateBooking(draft, context)` returns `{level: 'block' | 'warn', rule, message}[]`. A **block** can only be saved with an override reason, and that reason is written to `OverrideLog`.
- `buildDeviceTimeline()` derives automatic buffers from a device's bookings:
  - **Handoff:** placed before a booking when the previous same-day booking belongs to a different operator.
  - **Offload:** placed after a booking when the offload trigger fires. The trigger is the end of the day, after N recorded hours, or both.
  - **Charge:** placed when the next booking would run the battery past its runtime and the gap allows it. Otherwise the booking is flagged and needs a power bank. Each power bank adds one full runtime. The battery is assumed full each morning.
- Required gap between same-day bookings on a device = offload (if due) + handoff (if the operator changes).
- `generateOpenSlots()` / `rankOperatorsForSlot()` power **Fill gaps**. They only make suggestions and never book anything.
- `computeCapacity()` simulates one device-day with these same rules and scales it to the fleet. With the defaults it reproduces the planning math: 10 devices × 7 days ≈ 840 h, so 1,000 h needs 12 devices or 9 days.
- **Recorded hours** always come from `actualMinutes` of segments in **completed** bookings. Planned hours are shown separately and never mixed in.

Automatic device events (handoff, offload and charge) are stored in `DeviceEvent` and rebuilt whenever bookings or settings change. Editing one on the device page turns it into a manual event that survives rebuilds.

## Backup

- **In the app:** Export → *Download backup* gives you a consistent copy of the SQLite database.
- **By hand:** stop the app and copy `prisma/dev.db`.
- **Restore:** stop the app, replace `prisma/dev.db` with the backup file, then start the app.

## Deploying later

### Docker (simplest, keeps SQLite)

```bash
docker build -t fleet-planner .
docker run -d -p 3000:3000 -v fleet-data:/app/data \
  -e ADMIN_PASSWORD='a-strong-password' -e AUTH_SECRET="$(openssl rand -hex 32)" \
  fleet-planner
```

The database lives in the `fleet-data` volume. Put it behind HTTPS, for example with Caddy or a Cloudflare tunnel. Cookies are marked `Secure` in production. If you really need plain HTTP on a LAN, set `INSECURE_COOKIES=1`.

### Vercel + Postgres

Vercel has no persistent disk, so use hosted Postgres (Neon, Supabase, Vercel Postgres):

1. In `prisma/schema.prisma`, change `provider = "sqlite"` to `provider = "postgresql"`. The schema is otherwise Postgres-compatible.
2. Set `DATABASE_URL`, `ADMIN_PASSWORD`, `AUTH_SECRET` (and optionally `SHARE_TOKEN`) in the Vercel project.
3. Create the tables once from your laptop: `DATABASE_URL=<postgres-url> npx prisma db push && DATABASE_URL=<postgres-url> npx prisma db seed`.
4. Deploy. The build command is `npm run build`.

The in-app backup button is SQLite-only. On Postgres, use `pg_dump` or your provider's backups.

### Read-only share mode

Set `SHARE_TOKEN` and send people `https://your-host/share?token=<SHARE_TOKEN>`. They can view the Dashboard, Schedule, Today, Tasks and Capacity screens, but every write is refused. Operator contact details and payments stay admin-only.

## Development

```bash
npm test          # rules engine unit tests
npm run lint      # type check
npm run build     # production build
```
