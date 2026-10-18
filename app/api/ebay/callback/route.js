import { NextResponse } from 'next/server';

const OAUTH_COOKIE = 'ebay_oauth'; // set by ../auth/route.js

// Friendlier text for the errors eBay sends back on this redirect
const EBAY_ERRORS = {
  access_denied: 'You cancelled the eBay sign-in.',
  invalid_scope: 'eBay refused the requested permissions for this App ID.',
};

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const code  = searchParams.get('code');
  const error = searchParams.get('error');
  const appBase = process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin;

  const back = (params) => {
    const res = NextResponse.redirect(`${appBase}/?${new URLSearchParams(params)}`);
    res.cookies.set(OAUTH_COOKIE, '', { path: '/api/ebay', maxAge: 0 }); // one-time use
    return res;
  };

  if (error || !code) {
    return back({ ebay_error: EBAY_ERRORS[error] || searchParams.get('error_description') || error || 'eBay didn’t return a sign-in code.' });
  }

  // Credentials + one-time state were stored by /api/ebay/auth
  let session;
  try {
    session = JSON.parse(Buffer.from(req.cookies.get(OAUTH_COOKIE)?.value || '', 'base64url').toString());
  } catch {
    session = null;
  }
  if (!session?.nonce) {
    return back({ ebay_error: 'The sign-in took too long or started on a different site address. Click Connect Account again.' });
  }
  if (searchParams.get('state') !== session.nonce) {
    return back({ ebay_error: 'eBay sign-in check failed (state mismatch). Click Connect Account again.' });
  }

  const { clientId, clientSecret, ruName } = session;

  try {
    // Exchange auth code for user access token
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const tokenResp = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type:   'authorization_code',
        code,
        redirect_uri: ruName,
      }).toString(),
    });

    if (!tokenResp.ok) {
      const text = await tokenResp.text();
      let msg = text.slice(0, 200);
      try { msg = JSON.parse(text).error_description || msg; } catch {}
      throw new Error(`eBay wouldn’t issue a token: ${msg}`);
    }

    const tokenData = await tokenResp.json();
    const accessToken = tokenData.access_token;

    // Fetch eBay username from identity API
    const identityResp = await fetch('https://apiz.ebay.com/commerce/identity/v1/user/', {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    });

    let username = 'eBay User';
    if (identityResp.ok) {
      const identity = await identityResp.json();
      username = identity.username || identity.userId || 'eBay User';
    }

    // Pass token + username back to the app — stored in localStorage client-side
    const params = {
      ebay_user:      username,
      ebay_token:     accessToken,
      ebay_token_exp: String(Date.now() + (tokenData.expires_in || 7200) * 1000), // milliseconds
    };
    if (tokenData.refresh_token) params.ebay_refresh = tokenData.refresh_token;
    return back(params);
  } catch (e) {
    return back({ ebay_error: e.message });
  }
}
