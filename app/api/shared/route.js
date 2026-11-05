// Shared data for everyone with the link (Vercel Blob, private store).
//   GET  /api/shared?key=trip          → { data, etag }   (If-None-Match → 304 when unchanged)
//   PUT  /api/shared?key=trip  { data, etag }  → { etag }  (409 + latest when someone else saved first)
// No login on purpose: anyone who can open the site can read and edit these documents.
import { NextResponse } from 'next/server';
import { get, put, BlobPreconditionFailedError } from '@vercel/blob';

export const dynamic = 'force-dynamic';

const KEYS = new Set(['trip', 'trip-test']);
const MAX_BYTES = 512 * 1024;
const configured = () => !!(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);
const pathOf = (key) => `shared/${key}.json`;

async function read(key, ifNoneMatch) {
  const r = await get(pathOf(key), { access: 'private', useCache: false, ...(ifNoneMatch ? { ifNoneMatch } : {}) });
  if (!r) return { data: null, etag: null, status: 200 };
  if (r.statusCode === 304) return { status: 304, etag: r.blob.etag };
  return { data: JSON.parse(await new Response(r.stream).text()), etag: r.blob.etag, status: 200 };
}

function keyOf(req) {
  const key = new URL(req.url).searchParams.get('key');
  return KEYS.has(key) ? key : null;
}

export async function GET(req) {
  if (!configured()) return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  const key = keyOf(req);
  if (!key) return NextResponse.json({ error: 'unknown key' }, { status: 400 });
  try {
    const r = await read(key, req.headers.get('if-none-match'));
    if (r.status === 304) return new NextResponse(null, { status: 304, headers: { ETag: r.etag } });
    return NextResponse.json({ data: r.data, etag: r.etag }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return NextResponse.json({ error: e.message || 'Read failed' }, { status: 502 });
  }
}

export async function PUT(req) {
  if (!configured()) return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  const key = keyOf(req);
  if (!key) return NextResponse.json({ error: 'unknown key' }, { status: 400 });
  const raw = await req.text();
  if (raw.length > MAX_BYTES) return NextResponse.json({ error: 'Too big' }, { status: 413 });
  let body;
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ error: 'Bad JSON' }, { status: 400 }); }
  if (!body || typeof body.data !== 'object' || body.data === null) return NextResponse.json({ error: 'data must be an object' }, { status: 400 });
  try {
    const res = await put(pathOf(key), JSON.stringify(body.data), {
      access: 'private', contentType: 'application/json', addRandomSuffix: false,
      ...(body.etag ? { ifMatch: body.etag } : { allowOverwrite: false }),
    });
    return NextResponse.json({ etag: res.etag });
  } catch (e) {
    // Someone else saved first (or the doc already exists): hand back the latest so the page can catch up
    if (e instanceof BlobPreconditionFailedError || /already exists|precondition/i.test(e.message || '')) {
      const latest = await read(key).catch(() => null);
      return NextResponse.json({ error: 'conflict', data: latest?.data ?? null, etag: latest?.etag ?? null }, { status: 409 });
    }
    return NextResponse.json({ error: e.message || 'Save failed' }, { status: 502 });
  }
}
