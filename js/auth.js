// Google OAuth 2.0 using Google Identity Services (GIS)
const Auth = (() => {
  const TOKEN_KEY = 'gauth_token';
  let _token = null;
  let _expiry = 0;
  let _onAuthChange = null;

  function init(onAuthChange) {
    _onAuthChange = onAuthChange;

    // Restore token from localStorage if still valid
    try {
      const stored = JSON.parse(localStorage.getItem(TOKEN_KEY));
      if (stored && stored.expiry > Date.now() + 60_000) {
        _token = stored.token;
        _expiry = stored.expiry;
        onAuthChange(true);
        return;
      }
    } catch { /* ignore */ }

    onAuthChange(false);
  }

  function connect() {
    if (CONFIG.CLIENT_ID === 'YOUR_GOOGLE_CLIENT_ID_HERE') {
      alert('Please fill in your CLIENT_ID in js/config.js first.\nSee CLAUDE.md for setup instructions.');
      return;
    }
    const client = google.accounts.oauth2.initTokenClient({
      client_id: CONFIG.CLIENT_ID,
      scope: 'https://www.googleapis.com/auth/spreadsheets',
      callback: (response) => {
        if (response.error) {
          console.error('OAuth error:', response.error);
          if (_onAuthChange) _onAuthChange(false);
          return;
        }
        _token = response.access_token;
        _expiry = Date.now() + (response.expires_in * 1000);
        localStorage.setItem(TOKEN_KEY, JSON.stringify({ token: _token, expiry: _expiry }));
        if (_onAuthChange) _onAuthChange(true);
      }
    });
    client.requestAccessToken();
  }

  function disconnect() {
    if (_token) {
      try { google.accounts.oauth2.revoke(_token); } catch { /* ignore */ }
    }
    _token = null;
    _expiry = 0;
    localStorage.removeItem(TOKEN_KEY);
    if (_onAuthChange) _onAuthChange(false);
  }

  function getToken() {
    // Return token only if it has more than 60 seconds left
    return (_token && _expiry > Date.now() + 60_000) ? _token : null;
  }

  function isConnected() {
    return !!getToken();
  }

  return { init, connect, disconnect, getToken, isConnected };
})();
