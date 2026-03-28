# Finance Tracker — Dog Sitting Business

A client-side web app for tracking income and expenses, with two-way sync to Google Sheets.

## Tech Stack
- Vanilla HTML/CSS/JavaScript (no build step, no framework)
- Chart.js (CDN) — dashboard charts
- Google Identity Services (GIS) — OAuth 2.0
- Google Sheets API v4 — data sync
- LocalStorage — offline persistence

## File Structure
```
index.html          — single-page app shell
css/style.css       — all styles
js/config.js        — ★ FILL THIS IN (Client ID, Sheet ID, currency)
js/auth.js          — Google OAuth token management
js/storage.js       — LocalStorage CRUD
js/sheets.js        — Sheets API (push/pull)
js/dashboard.js     — Chart.js charts + summary cards
js/app.js           — Main controller (tabs, modal, filters, render)
```

## Expected Google Sheet Structure
Row 1 must be a header row. Columns:
| A: ID | B: Date | C: Type | D: Category | E: Amount | F: Description | G: Created At |

The app creates this header automatically on first push if the sheet is empty.
If you have an existing sheet with different columns, either restructure it to match,
or only use the app→sheet push (not the pull sync).

---

## ★ One-time Google Cloud Setup

### 1. Create a Google Cloud project
1. Go to https://console.cloud.google.com/
2. Click "New Project" → name it (e.g. "Finance Tracker") → Create

### 2. Enable the Google Sheets API
1. In your project, go to **APIs & Services → Library**
2. Search "Google Sheets API" → Enable

### 3. Create OAuth 2.0 credentials
1. Go to **APIs & Services → Credentials**
2. Click **Create Credentials → OAuth client ID**
3. If prompted, configure the OAuth consent screen first:
   - User type: **External** (or Internal if you have Google Workspace)
   - App name: Finance Tracker
   - Add your email as a test user
   - Scopes: add `https://www.googleapis.com/auth/spreadsheets`
4. Back in Create Credentials → OAuth client ID:
   - Application type: **Web application**
   - Authorized JavaScript origins:
     - `http://localhost:3000`  (for local development)
     - `http://localhost:8080`  (alternative port)
     - Add your deployed URL if you host it online
5. Click Create → copy the **Client ID**

### 4. Fill in config.js
Open `js/config.js` and set:
- `CLIENT_ID` — the Client ID you just copied
- `SHEET_ID` — from your Google Sheet URL:
  `https://docs.google.com/spreadsheets/d/SHEET_ID_HERE/edit`
- `SHEET_TAB` — the tab name (default: "Transactions")
- `CURRENCY` — e.g. `'£'` or `'$'`

---

## Running the App

The app must be served over HTTP (not opened as a file://), because Google OAuth
requires a registered origin. Easiest options:

**Option A — VS Code Live Server**
- Install the "Live Server" extension → right-click `index.html` → Open with Live Server

**Option B — Python**
```bash
cd "Dog Sitting"
python3 -m http.server 3000
# Open http://localhost:3000
```

**Option C — Node**
```bash
npx serve . -p 3000
# Open http://localhost:3000
```

---

## How Sync Works

| Action | Behaviour |
|--------|-----------|
| Add transaction in app (connected) | Saved to localStorage + immediately pushed to sheet |
| Add transaction in app (not connected) | Saved to localStorage, marked pending (yellow dot) |
| Click "Connect Google Sheets" (with pending) | All pending transactions pushed automatically |
| Click "Sync from Sheet" button | Pulls rows from sheet; adds any IDs not in localStorage |
| Delete transaction in app | Removed from localStorage only — sheet is NOT modified |

---

## Architecture Notes
- No backend — entirely client-side
- OAuth token stored in localStorage (with expiry check); auto-restored on page load
- Transactions deduped by UUID (`crypto.randomUUID()`)
- Green dot = synced to sheet; amber dot = pending sync
