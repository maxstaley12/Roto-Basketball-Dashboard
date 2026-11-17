import { NextResponse } from 'next/server';
import data from '../../../lib/data';
import params from '../../../lib/params';
const { buildData } = data;
const { resolveParams } = params;

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const TTL = 6 * 60 * 60 * 1000; // refresh from Google at most every 6 hours per scope and date range
const MAX_ENTRIES = 40;
const cache = new Map(); // key -> { at, data }

export async function GET(req) {
  const url = new URL(req.url);
  const force = url.searchParams.get('refresh') === '1';
  try {
    const p = resolveParams(url.searchParams);
    const key = p.scope + '|' + p.current.start + '|' + p.current.end;
    const hit = cache.get(key);
    let out;
    if (!force && hit && Date.now() - hit.at <= TTL) {
      out = hit.data;
    } else {
      out = await buildData(p);
      cache.delete(key);
      cache.set(key, { at: Date.now(), data: out });
      while (cache.size > MAX_ENTRIES) cache.delete(cache.keys().next().value);
    }
    return NextResponse.json(out, { headers: { 'Cache-Control': 'private, max-age=300' } });
  } catch (e) {
    const status = e && e.status === 400 ? 400 : 500;
    return NextResponse.json({ error: String(e && e.message ? e.message : e) }, { status });
  }
}
