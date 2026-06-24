# Family Graph

Interactive family tree and relationship finder, built for private family use.
Built with React and FastAPI, deployed as a single Vercel project backed by a
Neon Postgres database.

## Features
- Interactive family graph visualization
- Relationship finder between any two family members (English & Arabic)
- Admin management panel with contribution approval workflow
- Bilingual support (English / Arabic with RTL)
- Code-based login (no accounts) with JWT sessions in HttpOnly cookies
- Blocked from search engine indexing (private site)

## Tech Stack
- **Frontend:** React, React Flow, Vite
- **Backend:** Python, FastAPI, running as a Vercel serverless function under `/api`
- **Database:** PostgreSQL (Neon free tier)
- **Auth:** Shared secret codes -> JWT session in an HttpOnly cookie (30-day expiry)

## Project layout

```
api/
  index.py          # Vercel serverless entrypoint (imports app.main:app)
  app/
    main.py         # FastAPI app, CORS, route registration
    config.py       # Reads & validates required environment variables
    database.py     # SQLAlchemy engine/session (Postgres)
    auth_utils.py   # JWT creation/verification
    dependencies.py # get_current_user / require_admin FastAPI dependencies
    models.py, schemas.py, relationship_finder.py
    routes/         # auth, persons, relationship, contributions
frontend/           # Vite + React app
requirements.txt    # Python deps (repo root, required by Vercel's Python builder)
vercel.json         # Build + routing config for the monorepo
.env.example         # Variable names only - copy to .env and fill in locally
```

## Environment variables

| Variable | Used by | Notes |
|---|---|---|
| `DATABASE_URL` | backend | Postgres connection string (Neon gives you this) |
| `USER_ACCESS_CODE` | backend | The code that logs in as a normal user |
| `ADMIN_ACCESS_CODE` | backend | The code that logs in as admin |
| `JWT_SECRET` | backend | Signs session tokens. Generate with `python -c "import secrets; print(secrets.token_hex(32))"` |
| `ENVIRONMENT` | backend | `development` locally, `production` on Vercel - controls the cookie's `Secure` flag |
| `FRONTEND_URL` | backend | Allowed CORS origin(s) for the frontend, comma-separated if more than one |

None of these are hardcoded anywhere in the source, and none are committed -
`.env` is gitignored. The backend fails immediately on startup with a clear
error if `DATABASE_URL`, `JWT_SECRET`, `USER_ACCESS_CODE`, or
`ADMIN_ACCESS_CODE` are missing.

## Local development

### 1. Backend

```bash
cd api
python -m venv venv
venv\Scripts\activate          # Windows
# source venv/bin/activate     # macOS/Linux
pip install -r ../requirements.txt
```

Create a `.env` file at the **repo root** (copy `.env.example`):

```
DATABASE_URL=postgresql://user:password@host/dbname?sslmode=require
USER_ACCESS_CODE=pick-your-own-code
ADMIN_ACCESS_CODE=pick-your-own-code
JWT_SECRET=output-of-the-secrets.token_hex(32)-command-above
ENVIRONMENT=development
FRONTEND_URL=http://localhost:5173
```

You need a real Postgres database even for local dev - the free Neon project
from the deployment steps below works fine for this too (or run a local
Postgres if you prefer).

`python-dotenv`'s `load_dotenv()` walks upward from `api/app/config.py`
looking for a `.env` file, so it finds the repo-root one automatically
regardless of which directory you launch uvicorn from:

```bash
cd api
uvicorn app.main:app --reload --port 8000
```

The first run creates all tables in your Postgres database automatically
(`Base.metadata.create_all`) - no separate migration step needed for a fresh
database.

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Vite's dev server proxies `/api/*` to `http://localhost:8000` (see
`vite.config.js`), so the frontend talks to your local backend exactly the
way it'll talk to the same-origin API in production - no CORS issues, cookies
work normally.

Open `http://localhost:5173`.

## Deploying

### 1. Create a Neon database

1. Sign up at [neon.tech](https://neon.tech) (free tier).
2. Create a project and copy the connection string it gives you - use the
   **pooled** connection string (Neon labels it "Pooled connection") since
   Vercel functions are serverless and can open many short-lived connections.
   It already includes `?sslmode=require`.
3. That string is your `DATABASE_URL`.

### 2. Deploy to Vercel

1. Push this repo to GitHub.
2. In Vercel, "Add New Project" -> import the repo. Vercel will read
   `vercel.json` at the repo root, which builds both the frontend
   (`@vercel/static-build`) and the API (`@vercel/python`, entry at
   `api/index.py`) as part of one deployment.
3. In Project Settings -> Environment Variables, add all six variables from
   the table above:
   - `DATABASE_URL` - from Neon
   - `USER_ACCESS_CODE` / `ADMIN_ACCESS_CODE` - your chosen login codes
   - `JWT_SECRET` - a fresh `secrets.token_hex(32)` value (don't reuse the
     local dev one)
   - `ENVIRONMENT=production`
   - `FRONTEND_URL` - your Vercel deployment URL, e.g.
     `https://your-project.vercel.app`
4. Deploy.

Because the frontend and API are served from the same Vercel domain, requests
from the browser to `/api/*` are same-origin in production - the session
cookie just works, no cross-origin cookie complications.

If the first deploy 404s on static assets, check the Vercel build logs for
where `@vercel/static-build` actually mounted the frontend's `dist/` output
and adjust the catch-all `dest` in `vercel.json` accordingly (this is a
common one-time tweak for Python+static monorepos on Vercel and isn't
something that can be fully verified without a live deploy).

### 3. Verify

- Visit your deployment URL, log in with each code, confirm you land on the
  right role.
- Refresh the page - you should stay logged in (the session cookie persists
  for 30 days).
- As admin, add a person and confirm it shows up in the graph.
- As a normal user, submit a contribution and confirm it shows up under the
  admin's pending requests.

## Security notes

- Login codes and the JWT secret live only in environment variables, never
  in source or in the frontend bundle.
- The session token is stored exclusively in an HttpOnly cookie - it's never
  reachable from JavaScript, so it can't be read by an XSS payload or stored
  in localStorage/sessionStorage.
- `robots.txt`, a `<meta name="robots">` tag, and an `X-Robots-Tag` response
  header all tell search engines and crawlers to stay out, since this is a
  private family site, not a public one.
