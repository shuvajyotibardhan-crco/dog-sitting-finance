// ================================================================
// CONFIGURATION
// Fill in CLIENT_ID before using the app.
// See CLAUDE.md for step-by-step Google Cloud setup.
// ================================================================
const CONFIG = {

  // ① Your Google OAuth 2.0 Client ID (from Google Cloud Console)
  CLIENT_ID: 'YOUR_GOOGLE_CLIENT_ID_HERE',

  // ② Your Google Sheet ID — already filled in from your sheet URL
  SHEET_ID: '1368w-lEeEpDkNK3PxguJjFPmLNAf6n3ITyHeP8pYF34',

  // ③ Tab name patterns — use {year} as a placeholder.
  //    Must exactly match the tab names in your Google Sheet.
  //    e.g. if your tabs are "2025 Expense" and "2025 Income":
  TAB_EXPENSE: 'Expense-{year}',
  TAB_INCOME:  'Income-{year}',

  // ④ Currency symbol shown in the UI
  CURRENCY: '£',

  // ⑤ Earliest year to show in the year selector
  START_YEAR: 2023,
};

// ── Sheet column order (do not change unless your sheet differs) ──
// Expense: A=Date  B=Expense  C=Amount  D=Store     E=Remarks
// Income:  A=Date  B=DogName  C=Income  D=Source
//   Tips are encoded as "DogName-tips" in column B
