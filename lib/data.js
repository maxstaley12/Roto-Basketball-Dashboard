const CFG = require('./config');
const { ga4Report, gscQuery } = require('./google');
const { parseDay, isoDay, DAYMS, latestAvailable } = require('./params');
const publishDates = require('../data/publish-dates.json');
const { clusterOf, ORDER, OTHER } = require('./clusters');

const num = (v) => Number(v) || 0;
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ---------- scope filters ----------
const begins = (value) => ({ filter: { fieldName: 'landingPage', stringFilter: { matchType: 'BEGINS_WITH', value } } });
const organic = { filter: { fieldName: 'sessionDefaultChannelGroup', stringFilter: { matchType: 'EXACT', value: 'Organic Search' } } };

// Path pattern for the evergreen scope (RE2, matched against the whole value; a query string is allowed).
const EV = CFG.evergreen;
const evergreenPath = '/basketball/(?:[^/?]*|(?:' + EV.hubFolders.map(esc).join('|') + ')/?|(?:' + EV.pageFolders.map(esc).join('|') + ')/[^/?]+/?)(?:\\?.*)?';
const SITE_RE = '^https://www\\.rotowire\\.com';

function scopeFilters(scope) {
  if (scope === 'basketball') {
    return {
      ga4: begins('/basketball/'),
      gsc: [{ filters: [{ dimension: 'page', operator: 'includingRegex', expression: SITE_RE + '/basketball/' }] }],
    };
  }
  if (scope === 'evergreen') {
    const ga4 = { andGroup: { expressions: [
      { filter: { fieldName: 'landingPage', stringFilter: { matchType: 'FULL_REGEXP', value: evergreenPath } } },
      ...EV.excludePrefixes.map((p) => ({ notExpression: begins(p) })),
    ] } };
    const filters = [{ dimension: 'page', operator: 'includingRegex', expression: SITE_RE + evergreenPath + '$' }];
    if (EV.excludePrefixes.length) {
      filters.push({ dimension: 'page', operator: 'excludingRegex', expression: SITE_RE + '(?:' + EV.excludePrefixes.map(esc).join('|') + ')' });
    }
    return { ga4, gsc: [{ filters }] };
  }
  // article (the original report; filters unchanged)
  return {
    ga4: begins('/basketball/article/'),
    gsc: [{ filters: [{ dimension: 'page', operator: 'contains', expression: '/basketball/article/' }] }],
  };
}

// ---------- helpers ----------
function ga4Totals(resp) {
  const out = {};
  (resp.rows || []).forEach((r) => {
    out[r.dimensionValues[0].value] = { sessions: num(r.metricValues[0].value), users: num(r.metricValues[1].value), purchases: num(r.metricValues[2].value) };
  });
  return out;
}

function gscTotals(resp) {
  const r = (resp.rows || [])[0] || {};
  return { clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position };
}

function buildKpi(gsc, all, org) {
  const out = [];
  const add = (metric, get) => {
    const c = get('current'), y = get('last_year');
    out.push({
      metric, current: c, last_year: y,
      yoy_pct: y ? Math.round((c / y - 1) * 1000) / 10 : null,
      yoy_abs: Math.round((c - y) * 100) / 100,
    });
  };
  const g = (p) => (p === 'current' ? gsc.cur : gsc.ly);
  add('Search clicks', (p) => g(p).clicks);
  add('Search impressions', (p) => g(p).impressions);
  add('Average position', (p) => Math.round(g(p).position * 100) / 100);
  add('Search click-through rate', (p) => Math.round(g(p).ctr * 10000) / 100);
  add('Organic sessions', (p) => (org[p] || {}).sessions);
  add('All-channel sessions', (p) => (all[p] || {}).sessions);
  add('Purchases', (p) => (all[p] || {}).purchases);
  return out;
}

// Short ranges (21 days or fewer) are charted by day, longer ones by week (7 days from the start date).
function bucketDays(days) { return days <= 21 ? 1 : 7; }

function buildWeekly(gscDaily, ga4Daily, win, days) {
  const len = bucketDays(days);
  const count = Math.ceil(days / len);
  const starts = { current: parseDay(win.current.start), last_year: parseDay(win.lastYear.start) };
  const toMs = (s) => Date.parse((s.indexOf('-') > -1 ? s : s.slice(0, 4) + '-' + s.slice(4, 6) + '-' + s.slice(6, 8)) + 'T00:00:00Z');
  const rows = [];
  for (let i = 0; i < count; i++) {
    rows.push({
      n: i + 1, week: isoDay(starts.current + i * len * DAYMS), days: Math.min(len, days - i * len),
      clicks: 0, clicks_ly: 0, sessions: 0, sessions_ly: 0, purchases: 0, purchases_ly: 0,
    });
  }
  const bucket = (r) => Math.floor((toMs(r.date) - starts[r.period]) / (len * DAYMS));
  gscDaily.forEach((r) => { const i = bucket(r); if (i < 0 || i >= count) return; rows[i][r.period === 'current' ? 'clicks' : 'clicks_ly'] += num(r.clicks); });
  ga4Daily.forEach((r) => {
    const i = bucket(r); if (i < 0 || i >= count) return;
    rows[i][r.period === 'current' ? 'sessions' : 'sessions_ly'] += num(r.sessions);
    rows[i][r.period === 'current' ? 'purchases' : 'purchases_ly'] += num(r.purchases);
  });
  return { rows, unit: len === 1 ? 'day' : 'week' };
}

// Same page can come back several times with different query strings; combine by path.
const toPath = (u) => u.replace(/^https?:\/\/[^/]+/, '').replace(/[?#].*$/, '');

function articleCounts(win) {
  const sum = (w) => Object.entries(publishDates.counts).reduce((a, [d, n]) => (d >= w.start && d <= w.end ? a + n : a), 0);
  const c = sum(win.current), y = sum(win.lastYear);
  return {
    current: c, last_year: y, yoy_pct: y ? Math.round((c / y - 1) * 1000) / 10 : null,
    snapshot: publishDates.snapshot,
  };
}

// Group organic sessions and purchases by topic. Pages GA4 did not itemize are added to "Everything else"
// so each pie adds up to the dashboard's own organic totals.
function buildClusters(resp, orgCur) {
  const agg = new Map();
  let s = 0, p = 0;
  (resp.rows || []).forEach((r) => {
    const name = clusterOf(r.dimensionValues[0].value);
    const o = agg.get(name) || { name, sessions: 0, purchases: 0, pages: 0 };
    const ss = num(r.metricValues[0].value), pp = num(r.metricValues[1].value);
    o.sessions += ss; o.purchases += pp; o.pages += 1; s += ss; p += pp;
    agg.set(name, o);
  });
  const totS = Math.max((orgCur && orgCur.sessions) || 0, s), totP = Math.max((orgCur && orgCur.purchases) || 0, p); // never smaller than what was itemized
  const resS = Math.max(0, totS - s), resP = Math.max(0, totP - p);
  if (resS || resP) {
    const o = agg.get(OTHER) || { name: OTHER, sessions: 0, purchases: 0, pages: 0 };
    o.sessions += resS; o.purchases += resP; agg.set(OTHER, o);
  }
  const list = [...agg.values()];
  const by = (k) => list.filter((o) => o[k] > 0).sort((a, b) => b[k] - a[k]).map((o) => ({ name: o.name, value: o[k], pages: o.pages }));
  return { sessions: by('sessions'), purchases: by('purchases'), sessionsTotal: totS, purchasesTotal: totP, unitemizedSessions: resS, order: ORDER };
}

// ---------- main ----------
async function buildData(req) {
  const { scope, current, lastYear, days } = req;
  const f = scopeFilters(scope);
  const folder = f.ga4;
  const folderOrganic = { andGroup: { expressions: [folder, organic] } };
  const ranges = [
    { startDate: current.start, endDate: current.end, name: 'current' },
    { startDate: lastYear.start, endDate: lastYear.end, name: 'last_year' },
  ];
  const gscReq = (r, dims, limit) => ({ startDate: r.start, endDate: r.end, dimensions: dims, dimensionFilterGroups: f.gsc, rowLimit: limit });
  const gscTotalReq = (r) => ({ startDate: r.start, endDate: r.end, dimensionFilterGroups: f.gsc, rowLimit: 1 });
  const ga4Metrics = [{ name: 'sessions' }, { name: 'totalUsers' }, { name: 'keyEvents:purchase' }];
  const pageFetch = Math.max(1000, CFG.topPages * 4);
  const yoy = true; // page-level last-year comparison is shown in every view
  const convReq = (r, range) => ({
    dateRanges: [range], dimensions: [{ name: 'landingPage' }], metrics: [{ name: 'sessions' }, { name: 'keyEvents:purchase' }],
    dimensionFilter: folder,
    metricFilter: { filter: { fieldName: 'keyEvents:purchase', numericFilter: { operation: 'GREATER_THAN', value: { int64Value: '0' } } } },
    orderBys: [{ metric: { metricName: 'keyEvents:purchase' }, desc: true }], limit: '2000',
  });

  const sessReq = (range) => ({
    dateRanges: [range], dimensions: [{ name: 'landingPage' }], metrics: [{ name: 'sessions' }],
    dimensionFilter: folder, orderBys: [{ metric: { metricName: 'sessions' }, desc: true }], limit: String(CFG.clusterRows),
  });

  const [gscCur, gscLy, gscDailyCur, gscDailyLy, ga4All, ga4Org, ga4Daily, gscPages, conv, gscPagesLy, convLy, clusterResp, sessCurResp, sessLyResp] = await Promise.all([
    gscQuery(gscTotalReq(current)),
    gscQuery(gscTotalReq(lastYear)),
    gscQuery(gscReq(current, ['date'], 400)),
    gscQuery(gscReq(lastYear, ['date'], 400)),
    ga4Report({ dateRanges: ranges, metrics: ga4Metrics, dimensionFilter: folder }),
    ga4Report({ dateRanges: ranges, metrics: ga4Metrics, dimensionFilter: folderOrganic }),
    ga4Report({
      dateRanges: ranges, dimensions: [{ name: 'date' }], metrics: [{ name: 'sessions' }, { name: 'keyEvents:purchase' }],
      dimensionFilter: folderOrganic, orderBys: [{ dimension: { dimensionName: 'date' } }], limit: '800',
    }),
    gscQuery(gscReq(current, ['page'], pageFetch)),
    ga4Report(convReq(current, ranges[0])),
    yoy ? gscQuery(gscReq(lastYear, ['page'], pageFetch)) : Promise.resolve({ rows: [] }),
    yoy ? ga4Report(convReq(lastYear, ranges[1])) : Promise.resolve({ rows: [] }),
    ga4Report({
      dateRanges: [ranges[0]], dimensions: [{ name: 'landingPage' }], metrics: [{ name: 'sessions' }, { name: 'keyEvents:purchase' }],
      dimensionFilter: folderOrganic, orderBys: [{ metric: { metricName: 'sessions' }, desc: true }], limit: String(CFG.clusterRows),
    }),
    ga4Report(sessReq(ranges[0])),
    ga4Report(sessReq(ranges[1])),
  ]);

  const kpi = buildKpi({ cur: gscTotals(gscCur), ly: gscTotals(gscLy) }, ga4Totals(ga4All), ga4Totals(ga4Org));

  const gscDaily = [];
  [[gscDailyCur, 'current'], [gscDailyLy, 'last_year']].forEach(([resp, period]) => {
    (resp.rows || []).forEach((r) => gscDaily.push({ period, date: r.keys[0], clicks: r.clicks }));
  });
  const ga4DailyRows = (ga4Daily.rows || []).map((r) => ({
    date: r.dimensionValues[0].value, period: r.dimensionValues[1].value,
    sessions: num(r.metricValues[0].value), purchases: num(r.metricValues[1].value),
  }));
  const weekly = buildWeekly(gscDaily, ga4DailyRows, { current, lastYear }, days);

  // top pages by clicks, merged by path (position is weighted by impressions)
  const pm = new Map();
  (gscPages.rows || []).forEach((r) => {
    const p = toPath(r.keys[0]);
    const o = pm.get(p) || { label: p, clicks: 0, impressions: 0, posImpr: 0 };
    o.clicks += r.clicks; o.impressions += r.impressions; o.posImpr += r.position * r.impressions;
    pm.set(p, o);
  });
  const lyClicks = new Map();
  (gscPagesLy.rows || []).forEach((r) => { const p = toPath(r.keys[0]); lyClicks.set(p, (lyClicks.get(p) || 0) + r.clicks); });
  const topPages = [...pm.values()]
    .map((o) => {
      const row = { label: o.label, clicks: o.clicks, impressions: o.impressions, position: o.impressions ? Math.round((o.posImpr / o.impressions) * 10) / 10 : 0 };
      if (yoy) {
        const ly = lyClicks.get(o.label) || 0;
        row.clicks_ly = ly;
        row.change_pct = ly ? Math.round((o.clicks / ly - 1) * 1000) / 10 : null; // null = no clicks last year ("new")
      }
      return row;
    })
    .sort((a, b) => b.clicks - a.clicks).slice(0, CFG.topPages);

  // Sessions per landing page (all channels, same basis as the purchases table), merged by path, for both periods.
  const sessMap = (resp) => {
    const m = new Map();
    (resp.rows || []).forEach((r) => { const p = toPath(r.dimensionValues[0].value); m.set(p, (m.get(p) || 0) + num(r.metricValues[0].value)); });
    return m;
  };
  const sessCur = sessMap(sessCurResp), sessLy = sessMap(sessLyResp);

  const cm = new Map();
  (conv.rows || []).forEach((r) => {
    const p = toPath(r.dimensionValues[0].value);
    const o = cm.get(p) || { label: p, sessions: 0, purchases: 0 };
    o.sessions += num(r.metricValues[0].value); o.purchases += num(r.metricValues[1].value);
    cm.set(p, o);
  });
  const lyPurch = new Map();
  (convLy.rows || []).forEach((r) => { const p = toPath(r.dimensionValues[0].value); lyPurch.set(p, (lyPurch.get(p) || 0) + num(r.metricValues[1].value)); });

  const withLy = (o) => {
    const ly = lyPurch.get(o.label) || 0;
    const sl = sessLy.get(o.label);
    return {
      ...o,
      sessions_ly: sl == null ? null : sl,
      purchases_ly: ly,
      change_abs: o.purchases - ly,
      is_new: !ly && o.purchases > 0,
      dropped: o.purchases === 0 && ly > 0,
    };
  };
  const withPurchases = [...cm.values()].sort((a, b) => b.purchases - a.purchases || b.sessions - a.sessions).map(withLy);
  // Pages that had purchases last year and none now go at the bottom so a lost converter is visible.
  const dropped = [...lyPurch.entries()]
    .filter(([p, n]) => n > 0 && !cm.has(p))
    .map(([p, n]) => withLy({ label: p, sessions: sessCur.get(p) || 0, purchases: 0 }))
    .sort((a, b) => b.purchases_ly - a.purchases_ly);
  const converters = withPurchases.concat(dropped).slice(0, CFG.topConverters);

  return {
    scope, scopeInfo: CFG.scopes[scope],
    kpi, weekly: weekly.rows, weeklyUnit: weekly.unit, days,
    topPages, converters, yoy,
    clusters: buildClusters(clusterResp, ga4Totals(ga4Org).current),
    articles: scope === 'article' ? articleCounts({ current, lastYear }) : null,
    generatedAt: new Date().toISOString(),
    window: { current, lastYear },
    defaults: CFG.defaultRange, latest: latestAvailable(), kickoff: CFG.kickoff, earliestStart: CFG.earliestStart,
  };
}

module.exports = { buildData };
