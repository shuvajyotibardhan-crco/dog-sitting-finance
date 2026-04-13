# Requirements — Dog Sitting Finance Tracker

## Overview

The Dog Sitting Finance Tracker is a single-page web application that enables a sole-trader dog sitter to record, view, and manage business income and expenses. All data is persisted locally in the browser and optionally synchronised bidirectionally with a Google Sheet that serves as the authoritative ledger.

---

## Scope

**In scope**
- Recording expense and income transactions for the current and next calendar year
- Viewing historical data for any year back to START_YEAR (configurable)
- Two-way sync with a Google Sheet via the Sheets API v4
- Offline entry with deferred sync
- Filtering, sorting, and totalling of displayed rows
- Single and bulk deletion from both the app and the sheet
- In-app editing of any row with immediate sheet sync
- Row-level re-sync for sheet edits
- Responsive layout for desktop, tablet, and mobile browsers

**Out of scope**
- Multi-user access or shared accounts
- Reporting / dashboard / charts
- Receipt image uploads
- Tax calculation
- Native mobile application

---

## Feature: F-01 — Expense Entry

### User Story
As a dog sitter I want to record an expense so that I can track my business costs.

### Acceptance Criteria
1. The app **shall** provide a modal form with fields: Date, Expense description, Amount, Store, Remarks.
2. Date **shall** default to today's date when the current year is selected.
3. Date input **shall** be constrained to the selected year (min/max).
4. Amount **must** be a positive decimal number greater than zero.
5. Date and Expense **must** be filled before submission is accepted.
6. Store and Remarks **shall** be optional.
7. On submission the record **shall** be saved to LocalStorage immediately.
8. If Google Sheets is connected, the record **shall** be pushed to the sheet before the modal closes; success **shall** show a "Synced ✓" toast.
9. If not connected, the record **shall** be saved with `synced: false` and an info toast **shall** inform the user to connect.
10. The Add button **must** be disabled when a past year is selected.

### Test Plan
| # | Step | Expected |
|---|------|----------|
| T1.1 | Open Expenses tab, click "+ Add", leave Date blank, click "Add Expense" | Form validation prevents submission |
| T1.2 | Enter all required fields, submit (connected) | Row appears in table with green sync dot; sheet contains the row |
| T1.3 | Submit while disconnected | Row appears with amber dot; sheet unaffected |
| T1.4 | Select a past year (e.g. 2023), click "+ Add" | Button is disabled; click has no effect |
| T1.5 | Enter amount 0 or negative | Form validation prevents submission |

---

## Feature: F-02 — Income Entry

### User Story
As a dog sitter I want to record income (regular pay or tips) attributed to a specific dog so that I can track earnings per client.

### Acceptance Criteria
1. The income form **shall** include fields: Date, Income Type (Regular / Tips), Dog Name, Amount, Source.
2. Income Type **shall** default to "Regular".
3. Tips entries **must** be written to the sheet as `DogName-Tips` (capital T) in column B.
4. Dog Name and Source **must** be required fields.
5. Autocomplete datalists **shall** be populated from previously entered dog names and sources.
6. All other criteria mirror F-01 (LocalStorage, push, sync dot, year restriction).

### Test Plan
| # | Step | Expected |
|---|------|----------|
| T2.1 | Add income with type "Tips" (connected) | Sheet column B reads `DogName-Tips` |
| T2.2 | Add income while disconnected, then connect | Auto-push fires on connect; dot turns green |
| T2.3 | Open income form, check Dog Name datalist | Previously entered names appear as suggestions |
| T2.4 | Submit with Amount left blank | Validation blocks submission |

---

## Feature: F-03 — Two-Way Google Sheets Sync

### User Story
As a dog sitter I want to sync the app with my Google Sheet so that both sources stay consistent.

### Acceptance Criteria
1. The Sync button **shall** only be enabled when Google Sheets is connected.
2. Clicking Sync **shall** first push all locally pending (unsynced) rows to the sheet.
3. Sync **shall** then pull all rows for the selected year from the sheet.
4. Rows present in the sheet but absent locally **shall** be added to LocalStorage.
5. Rows absent from the sheet but present locally as synced **shall** be removed from LocalStorage.
6. Locally pending rows (amber dot) **must never** be removed during a pull.
7. The Sync button **shall** display a spinner and be disabled for the duration of the operation.
8. A toast **shall** summarise the result: rows pushed, added, removed, or "Already up to date".
9. Dates from the sheet **shall** be normalised from any supported format (DD/MM/YYYY, YYYY-MM-DD, ddMMMyyyy, DDMMYYYY) to ISO 8601 internally.
10. The pending badge **shall** show the count of unsynced rows; it **must** disappear when count is zero.

### Test Plan
| # | Step | Expected |
|---|------|----------|
| T3.1 | Add row while disconnected, connect, click Sync | Pending row pushed; badge clears |
| T3.2 | Delete a row in the sheet directly, click Sync in app | App row removed; toast shows "1 removed" |
| T3.3 | Add a row directly in the sheet, click Sync | New row appears in app with green dot |
| T3.4 | Click Sync with nothing to do | Toast reads "Already up to date" |
| T3.5 | Click Sync on a year with no sheet tab | No error; graceful "0 added, 0 removed" |

---

## Feature: F-04 — Filtering & Sorting

### User Story
As a dog sitter I want to filter and sort my records so that I can find specific transactions quickly.

### Acceptance Criteria
1. Expense tab **shall** support filters: date from, date to, store (exact match dropdown), remarks (has / no / all).
2. Income tab **shall** support filters: date from, date to, dog name (exact match dropdown), source (exact match dropdown), income type (Regular / Tips / all).
3. Both tabs **shall** support sort order: Newest first / Oldest first.
4. Store and dog/source dropdowns **shall** be populated dynamically from data for the selected year.
5. The "Clear" button **shall** reset all filters for that tab to their defaults.
6. Filtered row count and running total **shall** update in real time.
7. Totals **shall** reflect only the currently visible (filtered) rows.

### Test Plan
| # | Step | Expected |
|---|------|----------|
| T4.1 | Set Store filter to "Amazon" | Only rows where store === "Amazon" shown; "AmazonP" excluded |
| T4.2 | Set date From > date To | Zero rows shown (no crash) |
| T4.3 | Filter by Remarks = "Has remarks" | Only rows with non-empty remarks shown |
| T4.4 | Click Clear | All rows for year restored; total resets |
| T4.5 | Toggle Sort to "Oldest first" | Rows reorder chronologically ascending |

---

## Feature: F-05 — Delete Rows

### User Story
As a dog sitter I want to delete incorrect entries from both the app and the sheet so that the data stays accurate.

### Acceptance Criteria
1. Each row **shall** have a ✕ delete button.
2. Clicking ✕ **shall** display a confirmation dialog before deletion.
3. On confirmation, the row **must** be removed from LocalStorage immediately.
4. If the row is synced and Google Sheets is connected, it **must** also be deleted from the sheet using the `batchUpdate / deleteDimension` API.
5. If the row was pending (never synced), deletion **shall** be local only; a toast **shall** note it was not yet in the sheet.
6. Checkboxes **shall** allow multi-row selection; a "Delete selected (N)" button **shall** appear when rows are selected.
7. Bulk delete **shall** require a single confirmation dialog showing the count.
8. Rows deleted from the sheet **must** be matched by composite content key (date + name + amount + store/source), not by row index.

### Test Plan
| # | Step | Expected |
|---|------|----------|
| T5.1 | Click ✕ on a synced row (connected), confirm | Row gone from app and sheet |
| T5.2 | Click ✕ on a pending row | Row removed locally; toast says "was not yet in sheet" |
| T5.3 | Cancel the confirmation dialog | Nothing deleted |
| T5.4 | Select 3 rows via checkboxes, click "Delete selected (3)", confirm | All 3 removed from app and sheet |
| T5.5 | Click ✕ on a synced row while disconnected | Row removed from app; toast warns sheet not updated |

---

## Feature: F-06 — Edit Row

### User Story
As a dog sitter I want to edit an existing row from the app so that I can correct mistakes without having to delete and re-enter.

### Acceptance Criteria
1. Each row **shall** display a ✎ edit button alongside the ✕ delete button.
2. Clicking ✎ **shall** open the same modal form, pre-populated with the row's current values.
3. The modal title **shall** change to "Edit Expense" or "Edit Income"; the submit button **shall** read "Save Changes".
4. The date input **shall** be constrained to the row's original year (cannot move a row to a different year).
5. On save, the record **must** be updated in LocalStorage immediately with `synced: false`.
6. If connected and the row was previously synced, the app **must** delete the old row from the sheet and append the updated row.
7. If connected and the row was pending (never synced), the app **shall** push it as a new row (no delete needed).
8. If disconnected, the row **shall** be saved locally with an amber dot; it will sync on the next push/sync.
9. Edit **shall** be available for all years including past years (view-only restriction applies only to adding new rows).
10. After a successful sheet sync the row **shall** show a green dot and a "Synced to Google Sheets ✓" toast **shall** appear.

### Test Plan
| # | Step | Expected |
|---|------|----------|
| T6.1 | Click ✎ on any row | Modal opens with all fields pre-filled |
| T6.2 | Change a field, click "Save Changes" (connected, row was synced) | Row updated in app and sheet; green dot |
| T6.3 | Change a field, click "Save Changes" (disconnected) | Row updated locally with amber dot; sheet unchanged |
| T6.4 | Click ✎ on a past-year row | Modal opens; changes can be saved |
| T6.5 | Change a field, click "Save Changes" (connected, row was pending) | Row updated locally; pushed to sheet as new row |
| T6.6 | Click "Save Changes" (connected) | App shows amber dot immediately; green dot after sheet sync |

---

## Feature: F-07 — Row-Level Re-sync

### User Story
As a dog sitter I want to re-sync a specific row after editing it in the sheet so that the app reflects the updated value.

### Acceptance Criteria
1. Checkboxes **shall** allow selection of one or more rows.
2. A "Select all" checkbox **shall** be available at the top of the checkbox column to toggle all visible rows.
3. When rows are selected, a "↻ Re-sync selected (N)" button **shall** appear; the count N **must** update dynamically as selection changes.
4. When rows are selected, a "Delete selected (N)" button **shall** also appear with a dynamically updating count.
5. Clicking Re-sync **shall** require Google Sheets to be connected.
6. Re-sync **shall** remove the selected rows from LocalStorage then pull the full year from the sheet, which re-imports them with updated values.
7. A toast **shall** confirm the count of re-synced rows.
8. Selection state **shall** persist across table re-renders (e.g. when filters change); rows that become filtered out are automatically deselected.

### Test Plan
| # | Step | Expected |
|---|------|----------|
| T6.1 | Edit a row value in the sheet, select the row in app, click Re-sync | App shows updated value |
| T6.2 | Click Re-sync while disconnected | Toast: "Connect Google Sheets first" |

---

## Feature: F-08 — Year Selector

### User Story
As a dog sitter I want to view records for any year so that I can review historical data.

### Acceptance Criteria
1. The year dropdown **shall** include all years from START_YEAR to NEXT_YEAR (current + 1).
2. The current year **shall** be selected by default on load.
3. Past years **shall** display a "View only" badge.
4. The "+ Add" button **must** be disabled for past years.
5. Changing year **shall** reset all filters.
6. Sync **shall** pull data for the currently selected year only.

### Test Plan
| # | Step | Expected |
|---|------|----------|
| T7.1 | Select a past year | "View only" badge appears; Add button disabled |
| T7.2 | Select current year | Badge hidden; Add button enabled |
| T7.3 | Apply a filter, change year | Filters reset to defaults |

---

## Feature: F-09 — Google OAuth Authentication

### Acceptance Criteria
1. The app **shall** use Google Identity Services (GIS) OAuth 2.0 for authentication — no backend required.
2. Clicking "Connect Sheets" **shall** open the Google sign-in popup.
3. The access token **must** be stored in LocalStorage with its expiry timestamp.
4. Tokens within 60 seconds of expiry **shall** be treated as expired.
5. On reconnect, pending rows **shall** be auto-pushed without user action.
6. Clicking "Disconnect" **shall** revoke the token and clear it from storage.
7. If `CLIENT_ID` is not configured, a setup banner **shall** be shown.

### Test Plan
| # | Step | Expected |
|---|------|----------|
| T8.1 | Click "Connect Sheets", sign in | "Connected" status with green dot appears; Sync enabled |
| T8.2 | Click "Disconnect" | Status reverts to "Connect Sheets"; Sync disabled |
| T8.3 | Add rows while disconnected, reconnect | Auto-push fires; rows synced |
| T8.4 | Open app with unconfigured CLIENT_ID | Setup banner visible |
