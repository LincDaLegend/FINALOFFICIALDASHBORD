import { NextResponse } from 'next/server';
import { randomBytes } from 'crypto';

// Only what the app uses: the base scope (Trading API AddToWatchList) and identity (to show
// the connected username). Restricted scopes like buy.marketplace.insights need eBay approval
// and make sign-in fail for apps that don't have it.
const SCOPES = [
  'https://api.ebay.com/oauth/api_scope',
  'https://api.ebay.com/oauth/api_scope/commerce.identity.readonly',
];

const OAUTH_COOKIE = 'ebay_oauth'; // read by ../callback/route.js

// Values pasted into Settings sometimes carry spaces or quotes
const clean = (v) => String(v || '').trim().replace(/^["']+|["']+$/g, '').trim();

// eBay answers bad sign-in requests with a bare "Input request parameters are invalid",
// so catch the usual mistakes here and say what's actually wrong.
function problemWith({ clientId, clientSecret, ruName }) {
  if (!clientId)     return 'Add your eBay App ID (Client ID) in Settings first.';
  if (!clientSecret) return 'Add your eBay Client Secret (Cert ID) in Settings first.';
  if (!ruName)       return 'Add your RuName in Settings first — it’s needed to connect your account.';
  if (/-SBX-/i.test(clientId) || /^SBX-/i.test(clientSecret)) {
    return 'Those are Sandbox keys. Use your Production App ID and Cert ID (they contain “PRD”).';
  }
  if (/^https?:\/\//i.test(ruName) || ruName.includes('/')) {
    return 'The RuName box needs the RuName itself (it looks like Your_Name-YourName-AppName-abcdefgh), not a web address. Find it on developer.ebay.com → User Tokens.';
  }
  if (/\s/.test(ruName)) return 'The RuName can’t contain spaces — check it was copied exactly.';
  return null;
}

function begin(creds, req) {
  const problem = problemWith(creds);
  if (problem) return { error: problem };

  // `state` is a random one-time value checked by the callback; the credentials stay server-side
  const nonce = randomBytes(16).toString('hex');
  const params = new URLSearchParams({
    client_id:     creds.clientId,
    redirect_uri:  creds.ruName, // eBay wants the RuName here, not a URL
    response_type: 'code',
    scope:         SCOPES.join(' '),
    state:         nonce,
  });
  const url = `https://auth.ebay.com/oauth2/authorize?${params}`;

  const cookie = Buffer.from(JSON.stringify({ ...creds, nonce })).toString('base64url');
  const cookieOpts = {
    httpOnly: true,
    secure:   new URL(req.url).protocol === 'https:',
    sameSite: 'lax',         // still sent when eBay redirects back to /api/ebay/callback
    path:     '/api/ebay',
    maxAge:   600,           // 10 minutes to finish signing in
  };
  return { url, cookie, cookieOpts };
}

// Settings posts the keys saved in the browser
export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  const result = begin({
    clientId:     clean(body.app_id)        || clean(process.env.EBAY_APP_ID),
    clientSecret: clean(body.client_secret) || clean(process.env.EBAY_CLIENT_SECRET),
    ruName:       clean(body.ru_name)       || clean(process.env.EBAY_REDIRECT_URI),
  }, req);

  if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });
  const res = NextResponse.json({ url: result.url });
  res.cookies.set(OAUTH_COOKIE, result.cookie, result.cookieOpts);
  return res;
}

// Plain link version, for deployments that keep the keys in env vars only.
// Add ?debug=1 to see what would be sent to eBay instead of redirecting.
export async function GET(req) {
  const { searchParams, origin } = new URL(req.url);
  const appBase = process.env.NEXT_PUBLIC_APP_URL || origin;
  const creds = {
    clientId:     clean(process.env.EBAY_APP_ID),
    clientSecret: clean(process.env.EBAY_CLIENT_SECRET),
    ruName:       clean(process.env.EBAY_REDIRECT_URI),
  };
  const result = begin(creds, req);

  if (searchParams.get('debug')) {
    return NextResponse.json({
      ok: !result.error, error: result.error ?? null, scopes: SCOPES,
      clientId: creds.clientId ? `${creds.clientId.slice(0, 12)}…` : null,
      ruName: creds.ruName || null, clientSecret: creds.clientSecret ? 'set' : 'missing',
      callbackUrl: `${appBase}/api/ebay/callback`,
    });
  }
  if (result.error) return NextResponse.redirect(`${appBase}/?ebay_error=${encodeURIComponent(result.error)}`);

  const res = NextResponse.redirect(result.url);
  res.cookies.set(OAUTH_COOKIE, result.cookie, result.cookieOpts);
  return res;
}
