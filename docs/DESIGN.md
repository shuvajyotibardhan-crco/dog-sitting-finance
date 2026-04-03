# Design — Dog Sitting Finance Tracker

## High-Level Overview

The app is a client-side-only single-page application (SPA). There is no server, no database, and no build step. All state lives in the browser's LocalStorage. Google Sheets acts as the cloud persistence layer and is accessed directly from the browser via the Google Sheets API v4, authenticated through Google Identity Services (GIS) OAuth 2.0.

The design deliberately avoids a backend to keep the project dependency-free, free to host (GitHub Pages), and simple to maintain.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Browser (SPA)                        │
│                                                         │
│  ┌──────────┐   ┌──────────┐   ┌────────────────────┐  │
│  │  app.js  │──▶│storage.js│   │      auth.js       │  │
│  │          │   │          │   │  (GIS token mgmt)  │  │
│  │ UI logic │   │LocalStore│   └────────┬───────────┘  │
│  │ Filters  │   │  CRUD    │            │ Bearer token  │
│  │ Render   │   │  Dedup   │   ┌────────▼───────────┐  │
│  └────┬─────┘   └──────────┘   │     sheets.js      │  │
│       │                        │  Google Sheets API  │  │
│       └────────────────────────│  v4 (fetch calls)  │  │
│                                └────────┬───────────┘  │
└─────────────────────────────────────────│───────────────┘
                                          │ HTTPS
                          ┌───────────────▼──────────────┐
                          │        Google APIs           │
                          │                              │
                          │  accounts.google.com/gsi     │
                          │  (OAuth 2.0 token issuance)  │
                          │                              │
                          │  sheets.googleapis.com/v4    │
                          │  (Spreadsheet read/write)    │
                          └──────────────────────────────┘
```

**Data flow — Add a row:**
```
User submits form
  → app.js validates input
  → storage.js.addExpense() → LocalStorage (synced: false)
  → app.js re-renders table (amber dot)
  → IF connected: sheets.js.pushExpense() → Sheets API append
    → storage.js.markExpenseSynced() → LocalStorage (synced: true)
    → app.js re-renders table (green dot)
```

**Data flow — Sync:**
```
User clicks Sync
  → sheets.js.pushPending() — all unsynced rows pushed first
  → sheets.js.pullYear(year)
      → Sheets API GET values for Expense tab
      → Sheets API GET values for Income tab
      → For each sheet row: storage.js.upsertExpense/Income() (skip if key exists)
      → storage.js.removeExpensesNotInSheet() (delete local synced rows absent from sheet)
  → app.js re-renders
```

---

## Module Design

### `js/config.js`
Static configuration object. No logic.
- `CLIENT_ID` — Google OAuth client ID
- `SHEET_ID` — Google Spreadsheet ID
- `TAB_EXPENSE` / `TAB_INCOME` — tab name patterns with `{year}` placeholder
- `CURRENCY` — display symbol (e.g. `$`)
- `START_YEAR` — earliest year shown in year selector

### `js/auth.js`
Manages the OAuth 2.0 token lifecycle using the Google Identity Services library.
- Token stored in LocalStorage as `{ token, expiry }` where expiry is a Unix timestamp
- `getToken()` returns the token only if it has >60 seconds of remaining validity
- `connect()` opens the GIS token popup; on success fires the `onAuthChange` callback
- `disconnect()` calls `google.accounts.oauth2.revoke()` and clears stored token
- `init(callback)` — called on page load; restores session if token still valid

### `js/storage.js`
LocalStorage CRUD layer. Two independent key spaces: `dogsit_expenses` and `dogsit_income`.
- All reads parse from JSON; writes serialise to JSON
- `expKey(e)` — composite dedup key: `date|expense|amount|store` (all lowercase)
- `incKey(i)` — composite dedup key: `date|rawDogField|income|source` (tips reconstructed)
- `upsertExpense/Income()` — used by pull sync; skips insert if key already exists
- `removeExpensesNotInSheet(year, sheetKeySet)` — retains: different year rows, pending rows, and rows whose key is in the sheet set

### `js/sheets.js`
All Google Sheets API v4 communication. Uses `fetch()` with Bearer token from `Auth.getToken()`.
- `readUrl(tabName)` — includes `dateTimeRenderOption=FORMATTED_STRING` so date cells return as text, not serial integers
- `appendUrl(tabName)` — uses `valueInputOption=USER_ENTERED` so Google parses dates/numbers naturally
- `normaliseDate(str)` — multi-format parser: YYYY-MM-DD, DD/MM/YYYY, ddMMMyyyy, DDMMYYYY → ISO 8601
- `parseDogName(raw)` — detects `-Tips` / `-tips` suffix; returns `{ dogName, incomeType }`
- `toDogField(dogName, incomeType)` — writes `DogName-Tips` (capital T) for tips rows
- `deleteRowsByKey(tabName, keySet, rowKeyFn)` — reads full tab, finds matching row indices, sends batchUpdate deleteDimension from bottom to top to preserve index validity
- `_tabIdCache` — caches tab sheetIds fetched from spreadsheet metadata to avoid repeated API calls

### `js/app.js`
Main controller. Bootstrapped by `DOMContentLoaded`.
- `EF` / `IF` — plain objects holding current filter state for expenses and income respectively
- `expSelected` / `incSelected` — Sets of selected row IDs; persist across re-renders
- Rendering is full-replace (`innerHTML`); no virtual DOM or diffing
- `fmtDate(d)` — formats ISO date as `ddMMMYYYY` (e.g. `01Jan2025`) for display
- `esc(s)` — HTML-escapes all user-generated strings before insertion into innerHTML
- `toast(msg, type)` — temporary notification; auto-removes after 4 seconds

---

## Design Considerations

### Why no framework?
The app has simple, predictable state. Adding React/Vue would introduce a build pipeline, `node_modules`, and deployment complexity for no measurable benefit at this scale. Vanilla JS is sufficient and keeps the project maintainable indefinitely without dependency rot.

### Why LocalStorage as primary store?
LocalStorage gives instant offline capability with zero infrastructure. The app remains fully usable without internet; Google Sheets is the cloud backup, not the primary data source. The risk (single-browser, ~5MB limit) is acceptable for a personal finance tracker.

### Why composite key deduplication?
UUIDs are generated fresh on every pull from the sheet, so row identity cannot be tracked by ID across syncs. The composite key (date + description + amount + store/source) provides stable deduplication without requiring the sheet to store or return IDs.

### Why batchUpdate for delete instead of re-writing rows?
The Sheets API does not offer a "delete row by content" primitive. Re-writing the entire sheet would overwrite any formatting or formulas the user might have added. `batchUpdate / deleteDimension` deletes specific rows by index with no side-effects on other rows.

### Two-way sync design
- **App → Sheet (push):** Immediate on entry if connected; deferred if not. Deferral handled by `synced: false` flag.
- **Sheet → App (pull):** Manual via Sync button. Pull is additive (upsert) plus deletion-mirror. It does not overwrite pending (unsynced) rows.
- **Sync ordering:** When the Sync button is clicked, push runs to completion **before** pull begins. This prevents pending rows from being treated as absent and deleted during the pull.
- **Sheet edits:** Not auto-detected. User selects affected rows and clicks Re-sync, which drops and re-imports them.

### Year isolation
Each year's data lives in its own pair of sheet tabs. Pulls and pushes are year-scoped. This keeps API responses small and avoids cross-year key collisions. Past-year data is read-only in the app to prevent accidental edits to closed accounting periods.

### Security
- All user-generated strings rendered into innerHTML are HTML-escaped via `esc()` to prevent XSS.
- OAuth tokens are stored in LocalStorage (not cookies) — adequate for a personal, single-user app. Not appropriate for a shared or multi-user deployment.
- `CLIENT_ID` and `SHEET_ID` are visible in the client bundle. This is acceptable because the OAuth flow requires the user to be an authorised test user on the Google Cloud project, and the sheet itself is protected by Google account authentication.

---

## Technology Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| UI | HTML5 / CSS3 / Vanilla JS (ES2020) | No build step; no dependency rot |
| Persistence | Browser LocalStorage | Instant offline; zero infrastructure |
| Cloud sync | Google Sheets API v4 | User already owns the sheet |
| Authentication | Google Identity Services (GIS) | Free; no backend OAuth server needed |
| Hosting | GitHub Pages | Free static hosting; auto-deploy on push |
| Version control | Git / GitHub | Standard; enables iPad/web Claude Code access |

---

## Deployment

- **Hosting:** GitHub Pages, branch `main`, root `/`
- **Production URL:** `https://shuvajyotibardhan-crco.github.io/dog-sitting-finance/`
- **Deploy process:** `git push origin main` → GitHub Pages auto-deploys within ~60 seconds
- **Authorised origin:** Production URL must be listed under Authorised JavaScript Origins in the Google Cloud OAuth credential

---

## Constraints & Known Limitations

| Constraint | Detail |
|-----------|--------|
| Single browser | LocalStorage is device- and browser-specific. Data does not sync between devices automatically — Sync button must be used on each device. |
| Sheet edits | In-place edits to existing sheet rows are not auto-detected. Re-sync must be triggered manually. |
| Offline delete | Deleting a row while offline removes it locally but cannot remove it from the sheet until reconnected. |
| 5MB LocalStorage limit | Effectively unlimited for this use case (thousands of rows at ~200 bytes each). |
| No conflict resolution | If the same row is edited both locally and in the sheet between syncs, the sheet version wins on next pull. |
