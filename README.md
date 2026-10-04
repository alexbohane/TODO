# Todo App

A personal todo / wishlist / subscriptions tracker. Static frontend on
GitHub Pages, talking directly to Supabase (Postgres + Auth). No backend
server.

**Live:** https://alexbohane.github.io/TODO/

## Architecture

```
docs/  ──(GitHub Pages)──►  browser  ──(supabase-js)──►  Supabase
                                                         ├─ Auth (email/password)
                                                         └─ Postgres + RLS
```

- **`docs/`** — the entire app; plain HTML/CSS/JS, no build step. (Named
  `docs` only because GitHub Pages branch deploys serve root or `/docs`.)
  - `index.html` — markup for all tabs and modals
  - `style.css` — all styles
  - `config.js` — Supabase URL + publishable key
  - `supabase.min.js`, `marked.min.js`, `purify.min.js` — vendored libraries
    (Supabase client, markdown parser, HTML sanitiser)
  - `js/` — app code as native ES modules:

    | File | Responsibility |
    |---|---|
    | `main.js` | Entry point: tabs, view toggle, global error toast, starts auth |
    | `auth.js` | Login screen, sign in/out, session-expiry handling |
    | `db.js` | Supabase client + `db()` query helper |
    | `ui.js` | Shared helpers: `escapeHtml`, `priceFmt`, `showToast` |
    | `markdown.js` | Sanitised markdown rendering + editor shortcuts |
    | `todos.js` | Todos tab |
    | `wishlist.js` | Wishlist tab |
    | `subs.js` | Subscriptions tab |
- **`supabase/schema.sql`** — tables, row-level security policies and triggers.

### Security model

Single-user app. Signups are disabled in Supabase Auth, and every table's RLS
policy allows only `authenticated` users, so only the one account can read or
write data. The key in `config.js` is the *publishable* key and is safe to
ship in the browser.

### External calls

Besides Supabase, the Subscriptions tab fetches EUR→GBP/USD rates from
`api.frankfurter.dev` once a day (cached in `localStorage`, with hardcoded
fallback rates if offline).

## Development

Serve `docs/` locally:

```bash
python3 -m http.server -d docs 8000
```

Then open http://localhost:8000. ES modules don't load from `file://`, so
opening `index.html` directly won't work. It uses the live Supabase project, so
changes you make locally affect your real data.

Errors from any Supabase call show as a red toast at the bottom of the screen
(and in the browser console).

## Deploy

GitHub Pages serves `main:/docs` ("Deploy from a branch"). Pushing to `main`
redeploys automatically, usually within a minute or two.

## Database changes

Schema changes are **not** applied automatically. Add the SQL to
`supabase/schema.sql`, then run that statement yourself in the Supabase
SQL Editor.

Personal data exports (`*.local.sql`) are gitignored.

## Legacy

`legacy/` holds the original local-only version (FastAPI + SQLite, wrapped as
a macOS app by `build_app.sh`). It is no longer used and has not worked since
the move to Supabase; kept for reference only.
