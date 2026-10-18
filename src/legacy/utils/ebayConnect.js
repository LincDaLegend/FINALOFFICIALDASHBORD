// Starts the eBay "Connect Account" sign-in.
// Credentials go to our own server in a POST body (never in a URL); the server checks them,
// keeps them in a short-lived httpOnly cookie, and returns the eBay sign-in URL.
// Resolves only by navigating away; throws an Error with a readable message on problems.
export async function startEbayConnect({ appId, clientSecret, ruName }) {
  const resp = await fetch('/api/ebay/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: appId, client_secret: clientSecret, ru_name: ruName }),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || !data.url) throw new Error(data.error || `Couldn’t start eBay sign-in (${resp.status}).`);
  window.location.href = data.url;
}

/** Where eBay must send people back to — paste this as the RuName's "auth accepted URL". */
export function ebayCallbackUrl() {
  return `${window.location.origin}/api/ebay/callback`;
}
