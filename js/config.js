// ================================================================
// CONFIGURATION — fill these in before using the app
// See CLAUDE.md for step-by-step setup instructions
// ================================================================
const CONFIG = {
  // Your Google OAuth 2.0 Client ID (from Google Cloud Console)
  // e.g. "123456789-abc.apps.googleusercontent.com"
  CLIENT_ID: 'YOUR_GOOGLE_CLIENT_ID_HERE',

  // Your Google Sheet ID — found in the sheet URL:
  // https://docs.google.com/spreadsheets/d/SHEET_ID_HERE/edit
  SHEET_ID: 'YOUR_SHEET_ID_HERE',

  // The tab name inside your spreadsheet (default: "Transactions")
  // The app will use this tab and expects the first row to be headers.
  SHEET_TAB: 'Transactions',

  // Currency symbol shown in the UI
  CURRENCY: '£',
};

// Expected sheet columns (do not change order if using an existing sheet):
// A: ID | B: Date | C: Type | D: Category | E: Amount | F: Description | G: Created At
