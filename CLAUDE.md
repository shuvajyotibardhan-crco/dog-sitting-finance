# Dog Sitting Finance Tracker

Web app to track dog sitting business income and expenses, synced to a Google Sheet.

## Production URL
https://shuvajyotibardhan-crco.github.io/dog-sitting-finance/

## GitHub Repo
https://github.com/shuvajyotibardhan-crco/dog-sitting-finance

## Tech Stack
- Vanilla HTML/CSS/JavaScript — no build step, no framework
- Google Identity Services (GIS) — OAuth 2.0 (free)
- Google Sheets API v4 — read/write sync
- LocalStorage — offline persistence

## Your Google Sheet
**ID:** `1368w-lEeEpDkNK3PxguJjFPmLNAf6n3ITyHeP8pYF34`
**URL:** https://docs.google.com/spreadsheets/d/1368w-lEeEpDkNK3PxguJjFPmLNAf6n3ITyHeP8pYF34/edit

## Sheet Structure (year-based tabs)
Each year has two tabs. Tab naming set in `js/config.js` via `TAB_EXPENSE` / `TAB_INCOME`.

**Expense tab** — 5 columns, row 1 = header:
| A: Date | B: Expense | C: Amount | D: Store | E: Remarks |

**Income tab** — 4 columns, row 1 = header:
| A: Date | B: Dog Name | C: Income | D: Source |
> Tips are stored as `DogName-Tips` (capital T) in column B. The app also parses lowercase `-tips` for backward compatibility. Both map to Income Type = Tips.

## File Structure
```
index.html      — single-page app
css/style.css   — all styles
js/config.js    — ★ FILL IN: CLIENT_ID, tab name patterns, currency
js/auth.js      — Google OAuth token management
js/storage.js   — LocalStorage CRUD + dedup logic
js/sheets.js    — Sheets API push/pull (year-aware)
js/app.js       — Main controller: tabs, filters, modal, render
```

## App Features
- **Year selector** — view any year; add only allowed for current + next year
- **Expenses tab** — filter by date range, store, has/no remarks; total at bottom
- **Income tab** — filter by date range, dog name, source, income type (Regular/Tips); total at bottom
- **Push on entry** — every new row is immediately pushed to the sheet if connected
- **Sync button** — pulls from sheet; adds any rows not already in the app
- **Pending indicator** — amber dot = not yet synced; green dot = synced

---

## ★ One-Time Google Cloud Setup

### Step 1 — Create a Google Cloud project
1. Go to https://console.cloud.google.com/
2. Click the project dropdown (top left) → **New Project**
3. Name it (e.g. "Dog Sitting Finance") → **Create**
4. Make sure the new project is selected

### Step 2 — Enable the Google Sheets API
1. In the left sidebar: **APIs & Services → Library**
2. Search for **"Google Sheets API"**
3. Click it → **Enable**

### Step 3 — Configure the OAuth consent screen
1. Go to **APIs & Services → OAuth consent screen**
2. User type: **External** → **Create**
3. Fill in:
   - App name: `Dog Sitting Finance`
   - User support email: your email
   - Developer contact: your email
4. Click **Save and Continue**
5. On Scopes page: click **Add or Remove Scopes**
   - Search for `spreadsheets` → tick `https://www.googleapis.com/auth/spreadsheets`
   - Click **Update** → **Save and Continue**
6. On Test Users page: click **Add Users** → add your Gmail → **Save and Continue**
7. Click **Back to Dashboard**

### Step 4 — Create OAuth 2.0 credentials
1. Go to **APIs & Services → Credentials**
2. Click **+ Create Credentials → OAuth client ID**
3. Application type: **Web application**
4. Name: `Dog Sitting Finance`
5. Under **Authorized JavaScript origins**, add:
   - `http://localhost:3000`
   - `http://localhost:8080`
   - (add your hosted URL here if you deploy online)
6. Click **Create**
7. Copy the **Client ID** shown (looks like `123456789-abc.apps.googleusercontent.com`)

### Step 5 — Fill in config.js
Open `js/config.js` and set:
```js
CLIENT_ID: 'paste-your-client-id-here',
TAB_EXPENSE: '{year} Expense',   // ← change to match your actual tab names
TAB_INCOME:  '{year} Income',    // ← change to match your actual tab names
```

> **Tab naming:** Look at your Google Sheet tabs. If 2025's expense tab is called `"2025 Expenses"`, set `TAB_EXPENSE: '{year} Expenses'`. The `{year}` part is replaced automatically.

---

## Running the App

The app **must be served over HTTP** — Google OAuth blocks `file://` origins.

**Option A — VS Code Live Server** (easiest)
- Install "Live Server" extension → right-click `index.html` → Open with Live Server

**Option B — Python**
```bash
cd "/Users/shuvajyotibardhan/Projects/Dog Sitting"
python3 -m http.server 3000
# Open: http://localhost:3000
```

**Option C — Node**
```bash
npx serve . -p 3000
# Open: http://localhost:3000
```

---

## Sync Behaviour

| Action | Result |
|--------|--------|
| Add expense/income (connected) | LocalStorage + pushed to sheet immediately |
| Add expense/income (disconnected) | LocalStorage only; amber dot shown |
| Reconnect Google | All pending rows auto-pushed |
| Click Sync | Pulls sheet for selected year; adds missing rows |
| Delete in app (connected) | Removed from app AND sheet via batchUpdate API |
| Delete in app (disconnected) | Local only — sheet is NOT modified; re-sync or manual sheet edit needed |
| Past-year rows in sheet | Synced and displayed; cannot be added manually from app |
