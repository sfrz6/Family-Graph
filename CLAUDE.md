# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Family Graph: an interactive family tree and kinship-relationship finder, bilingual (English / Arabic with RTL). React + React Flow frontend, FastAPI + SQLAlchemy + SQLite backend.

## Commands

### Backend (run from `backend/`)
```
venv\Scripts\activate          # activate the existing virtualenv (Windows)
pip install -r requirements.txt
uvicorn app.main:app --reload  # dev server on http://localhost:8000
```
There is no test suite or linter configured for the backend.

### Frontend (run from `frontend/`)
```
npm install
npm run dev       # Vite dev server, http://localhost:5173
npm run build     # production build
npm run lint      # oxlint
npm run preview   # preview production build
```
There is no test suite configured for the frontend.

Both servers must run simultaneously for the app to work (frontend calls the backend over HTTP, see CORS below).

## Architecture

### Backend (`backend/app/`)
- `main.py` — FastAPI app setup, CORS (allows `localhost:3000` and `localhost:5173`), registers routers, creates tables on startup via `Base.metadata.create_all`.
- `database.py` — SQLite engine (`family.db`) and `get_db` session dependency.
- `models.py` — Three SQLAlchemy tables only:
  - `Person` (`name_en`, `name_ar`, `gender`)
  - `Relationship` — stores only two relationship types: `parent_child` (`person_id`=parent, `related_person_id`=child) and `spouse`. **Siblings are intentionally not stored** — they're derived at query time from shared parents, to avoid sync bugs.
  - `PendingContribution` — user-submitted suggestions (JSON blob in `data`) awaiting admin approval.
- `schemas.py` — Pydantic request/response models, separate from DB models by design (e.g. `PersonCreate` vs `PersonResponse`).
- `relationship_finder.py` — the kinship engine. Builds an adjacency graph from `Person`/`Relationship` rows, BFS's the shortest path between two people (`up`=toward parent, `down`=toward child, `spouse`=lateral), then classifies the step pattern (`ups`/`downs`/`has_spouse` counts) into a human relationship term. `interpret_english` and `interpret_arabic` are independent rule tables — Arabic kinship terms additionally distinguish paternal vs. maternal lines (عم/عمة vs خال/خالة) and must be edited separately from the English logic when adding new relationship patterns.
- `routes/` — one router module per concern, all mounted under `/api`:
  - `auth.py` — login via shared secret codes (`USER_CODE`/`ADMIN_CODE` constants, hardcoded — intentionally simple, no JWT/sessions). Returns a role string; the frontend holds this in memory only (no persisted auth state).
  - `persons.py` — CRUD for people/relationships, plus convenience endpoints `add-child` and `add-spouse` that create multiple `Relationship` rows in one call (e.g. linking a child also auto-links the parents as spouses if not already linked).
  - `relationship.py` — `/api/relationship/find` wraps `relationship_finder.get_relationship`.
  - `contributions.py` — submit/list/approve/reject pending contributions, plus `/api/admin/stats` (counts + generation depth) and `/api/persons/{id}/missing-relatives`. Approving a contribution replays its JSON `data` into real `Person`/`Relationship` rows; the branching logic per `contribution_type`/`relative_type` here must stay in sync with whatever shapes the frontend submits.

### Frontend (`frontend/src/`)
- `api.js` — single axios instance, every backend call lives here as a named export. Add new endpoints here rather than calling axios directly from components.
- `App.jsx` — top-level role/language state (`role`, `language`, default Arabic); renders `LoginPage` until a role is set, then `FamilyGraph`.
- `components/FamilyGraph.jsx` — the core view, wrapped in `ReactFlowProvider`. Holds the three view modes as `userMode`:
  - `"tree"` — males-only graph by default; clicking a male node toggles `expandedMales` to reveal his female depth-1 relatives (keeps large trees readable).
  - `"search"` — centers on one person and shows only their depth-1 neighborhood (`getDepthOne`); clicking a node re-centers.
  - `"relationship"` — shows the full graph with the BFS path from `relationship_finder` highlighted (`relationshipResult.path`).
  Layout (`buildGraphData`/`calculateGenerations`) is a custom BFS-by-generation layout (not an external layout library) — generation = BFS depth from root nodes (people with no parents), spouses are nudged ±70px horizontally to sit next to each other.
- `components/PersonNode.jsx` — custom React Flow node renderer for a person.
- `components/PersonPanel.jsx` — detail panel for the selected person (relatives list, admin edit/delete actions).
- `components/SearchBar.jsx` — person search/autocomplete, also drives the two-person relationship-finder input.
- `components/AdminPanel.jsx` — admin-only modal: stats dashboard, contribution approval queue, presumably person/relationship management.
- `components/LoginPage.jsx` / `UserMenu.jsx` — secret-code login, and the post-login mode picker popup for regular users.

### Data flow for "add a relative" operations
There are two parallel paths that both end up creating `Person`/`Relationship` rows, and they must be kept consistent when changed:
1. Admin direct path: `POST /api/persons` then `POST /api/persons/add-child` or `/add-spouse` (immediate, no approval).
2. User contribution path: `POST /api/contributions` (type `add_person` or `add_relative`, with a JSON `data` blob) → admin calls `PUT /api/contributions/{id}/approve`, which re-implements similar linking logic inside `contributions.py`.
