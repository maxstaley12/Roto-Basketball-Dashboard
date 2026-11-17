const CFG = require('./config');

const DAYMS = 86400000;
const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);
const parseDay = (s) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s || '')) return null;
  const ms = Date.parse(s + 'T00:00:00Z');
  return isNaN(ms) || isoDay(ms) !== s ? null : ms;
};

// Search Console data lags about two days; GA4 is fine but both sources share one window.
function latestAvailable(now) {
  return isoDay((now || Date.now()) - 2 * DAYMS);
}

// Turns ?scope=&start=&end= into a validated request. Throws an Error with .status = 400 on bad input.
function resolveParams(search, now) {
  const bad = (m) => { const e = new Error(m); e.status = 400; return e; };
  const scope = search.get('scope') || 'article';
  if (!CFG.scopes[scope]) throw bad('Unknown scope "' + scope + '". Use article, basketball or evergreen.');

  const start = search.get('start') || CFG.defaultRange.start;
  const end = search.get('end') || CFG.defaultRange.end;
  const s = parseDay(start), e = parseDay(end);
  if (s == null || e == null) throw bad('Dates must look like 2026-08-01.');
  if (s > e) throw bad('The start date is after the end date.');
  if (start < CFG.earliestStart) throw bad('The earliest start date is ' + CFG.earliestStart + '.');
  const latest = latestAvailable(now);
  if (end > latest) throw bad('Search Console data lags about two days, so the latest end date is ' + latest + '.');
  const days = Math.round((e - s) / DAYMS) + 1;
  if (days > CFG.maxDays) throw bad('Please pick a range of ' + CFG.maxDays + ' days or fewer.');

  const lastYear = { start: isoDay(s - CFG.shiftDays * DAYMS), end: isoDay(e - CFG.shiftDays * DAYMS) };
  return { scope, current: { start, end }, lastYear, days, latest };
}

module.exports = { resolveParams, latestAvailable, isoDay, parseDay, DAYMS };
