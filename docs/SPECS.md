# Technical Specifications — Dog Sitting Finance Tracker

## Data Models

### Expense Record
```js
{
  id:        string,   // crypto.randomUUID() — local only, not stored in sheet
  date:      string,   // ISO 8601: "YYYY-MM-DD"
  expense:   string,   // free text description
  amount:    number,   // positive float, 2 decimal places
  store:     string,   // optional; empty string if absent
  remarks:   string,   // optional; empty string if absent
  synced:    boolean,  // true = row exists in Google Sheet
  createdAt: string,   // ISO 8601 timestamp; used as secondary sort key
}
```

### Income Record
```js
{
  id:         string,  // crypto.randomUUID() — local only
  date:       string,  // ISO 8601: "YYYY-MM-DD"
  dogName:    string,  // dog's name (without "-Tips" suffix)
  incomeType: string,  // "Regular" | "Tips"
  income:     number,  // positive float, 2 decimal places
  source:     string,  // e.g. "Cash", "Bank Transfer"
  synced:     boolean,
  createdAt:  string,
}
```

---

## LocalStorage Schema

| Key | Value |
|-----|-------|
| `dogsit_expenses` | JSON array of Expense Records |
| `dogsit_income` | JSON array of Income Records |
| `gauth_token` | `{ token: string, expiry: number }` — OAuth token + Unix timestamp |

---

## Composite Deduplication Keys

Used to detect duplicate rows when pulling from the sheet. Keys are always lowercase.

**Expense key:**
```
{date}|{expense.toLowerCase()}|{amount}|{store.toLowerCase()}
```

**Income key:**
```
{date}|{rawDogField.toLowerCase()}|{income}|{source.toLowerCase()}
```
Where `rawDogField` = `dogName` for Regular, `dogName + "-tips"` (lowercase) for Tips.

**Tips encoding note:** The app writes Tips rows to the sheet as `DogName-Tips` (capital T). When parsing from the sheet, `parseDogName()` recognises both `-Tips` and `-tips` suffixes for backward compatibility. The dedup key always uses lowercase `-tips` regardless of the suffix case found in the sheet.

---

## Google Sheet Structure

### Expense Tab
Tab name pattern: configurable via `CONFIG.TAB_EXPENSE` (default: `Expense-{year}`)

| Col A | Col B | Col C | Col D | Col E |
|-------|-------|-------|-------|-------|
| Date | Expense | Amount | Store | Remarks |

- Row 1 is a header row — skipped during import via date-format validation
- Dates are written by the app as `YYYY-MM-DD` with `valueInputOption=USER_ENTERED`; Google reformats them per sheet locale
- Amounts written as raw numbers (no currency symbol)

### Income Tab
Tab name pattern: configurable via `CONFIG.TAB_INCOME` (default: `Income-{year}`)

| Col A | Col B | Col C | Col D |
|-------|-------|-------|-------|
| Date | Dog Name | Income | Source |

- No header row in existing sheets — first row is data. Rows with unparseable dates are silently skipped during import.
- Tips encoded in column B as `DogName-Tips` (capital T)
- App reads columns A–F (`!A:F` range) but income only uses A–D

---

## API Endpoints Used

### Google Identity Services
```
https://accounts.google.com/gsi/client   (script tag — token client)
```
Scope requested: `https://www.googleapis.com/auth/spreadsheets`

### Sheets API — Read
```
GET https://sheets.googleapis.com/v4/spreadsheets/{SHEET_ID}/values/{range}
  ?dateTimeRenderOption=FORMATTED_STRING
  &valueRenderOption=FORMATTED_VALUE
```
`dateTimeRenderOption=FORMATTED_STRING` is required — without it, date cells return as integer serial numbers (days since 30 Dec 1899).

### Sheets API — Append
```
POST https://sheets.googleapis.com/v4/spreadsheets/{SHEET_ID}/values/{range}:append
  ?valueInputOption=USER_ENTERED
  &insertDataOption=INSERT_ROWS
```

### Sheets API — Values Update (edit row in-place — used internally by updateExpenseRow/updateIncomeRow via delete+append; direct PUT not currently used but listed for reference)
```
PUT https://sheets.googleapis.com/v4/spreadsheets/{SHEET_ID}/values/{range}
  ?valueInputOption=USER_ENTERED
Body: { values: [[col_A, col_B, ...]] }
```

### Sheets API — Batch Update (delete rows)
```
POST https://sheets.googleapis.com/v4/spreadsheets/{SHEET_ID}:batchUpdate
Body: { requests: [ { deleteDimension: { range: { sheetId, dimension: "ROWS", startIndex, endIndex } } } ] }
```
Multiple delete requests in one batch call. Indices sorted descending (bottom-to-top) to preserve index validity during sequential deletion.

### Sheets API — Spreadsheet Metadata (for tab sheetIds)
```
GET https://sheets.googleapis.com/v4/spreadsheets/{SHEET_ID}?fields=sheets.properties
```
Result cached in `_tabIdCache` keyed by tab name.

---

## Date Handling

### Normalisation (sheet → app)
`normaliseDate(str)` handles the following input formats:

| Format | Example | Regex / rule |
|--------|---------|--------------|
| ISO 8601 | `2025-03-01` | Pass-through |
| DD/MM/YYYY | `01/03/2025` | Slash-delimited, day first |
| ddMMMyyyy | `01Mar2025` | Day + 3-char month + year |
| DDMMYYYY | `01032025` | 8 digits, no separator |
| Fallback | Any `Date()`-parseable string | `new Date(str).toISOString()` |

### Display format (app → user)
`fmtDate(d)` converts ISO `YYYY-MM-DD` to `ddMMMYYYY`:
```js
"2025-03-01" → "01Mar2025"
```

### Write format (app → sheet)
Dates written as ISO `YYYY-MM-DD` with `valueInputOption=USER_ENTERED`. Google Sheets reformats automatically to the sheet's locale date format.

---

## Sync Algorithm

### Push (app → sheet)
```
for each expense where synced === false:
  POST append to Expense-{year} tab
  mark synced = true in LocalStorage

for each income where synced === false:
  POST append to Income-{year} tab
  mark synced = true in LocalStorage
```

### Pull (sheet → app)
```
GET all rows from Expense-{year} tab
  → parse each row to Expense record
  → build sheetKeySet from all valid rows
  → upsert each row (skip if key already exists)
  → remove local synced rows whose key is not in sheetKeySet

GET all rows from Income-{year} tab
  → same process for Income records
```

### Edit Row (app → sheet)
```
capture oldRow from LocalStorage (needed for sheet delete key)
update LocalStorage record with new field values + synced: false

IF connected:
  IF oldRow.synced === true:
    deleteExpenseRows/deleteIncomeRows([oldRow])
      → find row in sheet by content key, batchUpdate deleteDimension
  pushExpense/pushIncome(updatedRow)
    → POST append to sheet
    → markExpenseSynced/markIncomeSynced(id) → LocalStorage synced: true
ELSE:
  row remains pending (amber dot); pushed on next Sync or reconnect
```

### Row-Level Re-sync
```
for each selected row:
  remove from LocalStorage (regardless of synced state)

pull full year from sheet
  → re-imports the rows with current sheet values
```

**Design note:** Re-sync deletes and re-imports — it does not patch in place (the Sheets API has no "refresh single row" primitive). If a row has pending local changes AND was edited in the sheet, the sheet version wins.

### Delete from Sheet
```
build keySet from selected rows (grouped by year)
for each year:
  GET all rows from tab
  find row indices whose computed key is in keySet
  sort indices descending
  POST batchUpdate with one deleteDimension per index
```

---

## Configuration (`js/config.js`)

```js
const CONFIG = {
  CLIENT_ID:   'your-google-client-id.apps.googleusercontent.com',
  SHEET_ID:    'your-google-sheet-id',
  TAB_EXPENSE: 'Expense-{year}',  // {year} replaced at runtime
  TAB_INCOME:  'Income-{year}',
  CURRENCY:    '$',
  START_YEAR:  2023,              // earliest year in year selector
};
```

`NEXT_YEAR` is not in `CONFIG` — it is derived at runtime as `new Date().getFullYear() + 1`. The year selector spans `START_YEAR` through `NEXT_YEAR`. **Adding** new rows is restricted to `CURR_YEAR` and `NEXT_YEAR`; **editing** existing rows is allowed for all years.

---

## Filter State Objects

```js
// Expense filters
const EF = {
  from:    '',      // ISO date string or ''
  to:      '',      // ISO date string or ''
  store:   '',      // exact store name or ''
  remarks: '',      // '' | 'yes' | 'no'
  sort:    'desc',  // 'desc' | 'asc'
};

// Income filters
const IF = {
  from:   '',
  to:     '',
  dog:    '',       // exact dog name or ''
  source: '',       // exact source or ''
  type:   '',       // '' | 'Regular' | 'Tips'
  sort:   'desc',
};
```

---

## File Inventory

```
/
├── index.html              Single-page app shell; all markup
├── css/
│   └── style.css           All styles; 700px responsive breakpoint
├── js/
│   ├── config.js           ★ User-specific: CLIENT_ID, SHEET_ID, tab names
│   ├── auth.js             GIS OAuth token client; token stored in LocalStorage
│   ├── storage.js          LocalStorage CRUD, dedup keys, sync helpers
│   ├── sheets.js           Sheets API v4: push, pull, delete; date normalisation
│   └── app.js              UI controller: tabs, filters, modal, render, toasts
└── docs/
    ├── REQUIREMENTS.md     Feature requirements with acceptance criteria and test plans
    ├── DESIGN.md           Architecture, module design, design decisions
    └── SPECS.md            This file — data models, API specs, algorithms
```

---

## Browser Compatibility

| Feature | Minimum requirement |
|---------|---------------------|
| `crypto.randomUUID()` | Chrome 92, Safari 15.4, Firefox 95 |
| `fetch()` | All modern browsers |
| `localStorage` | All modern browsers |
| ES2020 (optional chaining, nullish coalescing) | Chrome 80, Safari 13.1, Firefox 74 |
| CSS custom properties | All modern browsers |

No polyfills are included. The app targets modern evergreen browsers only.

---

## Security Notes

- All user-generated strings inserted into `innerHTML` are HTML-escaped via `esc()` (replaces `&`, `<`, `>`, `"`) to prevent XSS.
- OAuth tokens are stored in LocalStorage. Acceptable for a single-user personal app; not suitable for shared or public deployments.
- `CLIENT_ID` and `SHEET_ID` are visible in the client bundle. The OAuth consent screen restricts access to listed test users only; the spreadsheet is protected by Google authentication.
- No cookies, no sessions, no server-side logic.
