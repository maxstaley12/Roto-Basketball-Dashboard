// Fake Google responses, used only when MOCK=1 (layout testing). Same shapes as the real APIs.
const DAY = 86400000;
const ymd = (ms) => new Date(ms).toISOString().slice(0, 10);

function days(a, b) {
  const out = [];
  for (let t = Date.parse(a + 'T00:00:00Z'); t <= Date.parse(b + 'T00:00:00Z'); t += DAY) out.push(t);
  return out;
}
const MOCK_KW = ['mock-draft-pick-by-pick', 'cheat-sheet-ppr', 'waiver-wire-week', 'start-sit-week', 'nba-dfs-picks', 'rankings-top-100', 'trade-analyzer-guide', 'injury-report-week', 'draft-pass-tool', 'who-should-i-draft', 'nba-best-bets-player-props'];
const MOCK_EV = ['rankings.php','cheatsheet.php','nba-lineups.php','draft-assistant/','mock-draft/','start-sit/','adp.php','nba-depth-charts/'];
const shape = (i, n) => Math.max(0.15, Math.sin((i / n) * Math.PI * 0.9) + 0.25);

function ga4Report(body) {
  const org = JSON.stringify(body).includes('Organic Search');
  const scale = org ? 1 : 1.3;
  const dims = (body.dimensions || []).map((d) => d.name);
  const ranges = body.dateRanges;
  const rows = [];
  if (!dims.length) {
    ranges.forEach((r, k) => {
      const n = days(r.startDate, r.endDate).length;
      const s = Math.round((k === 0 ? 5800 : 3400) * n * scale);
      rows.push({ dimensionValues: [{ value: r.name }], metricValues: [{ value: String(s) }, { value: String(Math.round(s * 0.7)) }, { value: String(Math.round(s / (k === 0 ? 1700 : 2700))) }] });
    });
  } else if (dims[0] === 'date') {
    ranges.forEach((r, k) => {
      const ds = days(r.startDate, r.endDate);
      ds.forEach((t, i) => {
        const s = Math.round((k === 0 ? 9000 : 5200) * shape(i, ds.length) * scale);
        rows.push({ dimensionValues: [{ value: ymd(t).replace(/-/g, '') }, { value: r.name }], metricValues: [{ value: String(s) }, { value: String(Math.round(s / 2500)) }] });
      });
    });
  } else {
    const ev = JSON.stringify(body).includes('start-sit');
    const all = JSON.stringify(body).includes('"BEGINS_WITH","value":"/basketball/"');
    const lyq = ranges[0].startDate.startsWith('2025');
    for (let i = 0; i < (lyq ? 37 : 40); i++) {
      const v = ev ? '/basketball/' + MOCK_EV[i % MOCK_EV.length] + (i > 5 ? '?scoring=ppr' : '') : (all && i % 3 === 0 ? '/basketball/headlines/mock-headline-' + (500000 + i) : '/basketball/article/' + MOCK_KW[i % MOCK_KW.length] + '-' + (130000 + i));
      rows.push({ dimensionValues: [{ value: v }], metricValues: [{ value: String(Math.round((9000 - i * 180) * (lyq ? 0.7 : 1))) }, { value: String(Math.max(1, Math.round((60 - i) * (lyq ? 0.8 : 1)))) }] });
    }
  }
  return { rows };
}

function gscQuery(body) {
  const dims = body.dimensions || [];
  const k = body.startDate.startsWith('2026') ? 0 : 1;
  if (!dims.length) {
    return { rows: [{ clicks: k === 0 ? 483506 : 246512, impressions: k === 0 ? 12687004 : 9121009, ctr: k === 0 ? 0.0381 : 0.027, position: k === 0 ? 5.84 : 10.07 }] };
  }
  if (dims[0] === 'date') {
    const ds = days(body.startDate, body.endDate);
    return { rows: ds.map((t, i) => ({ keys: [ymd(t)], clicks: Math.round((k === 0 ? 7000 : 3600) * shape(i, ds.length)), impressions: 100000 })) };
  }
  const n = body.rowLimit || 12;
  const ev = JSON.stringify(body).includes('start-sit');
  const lyf = k === 1 ? 0.6 : 1;
  return { rows: Array.from({ length: Math.min(n, 300) - (k === 1 && ev ? 2 : 0) }, (_, i) => ({ keys: [ev ? 'https://www.rotowire.com/basketball/' + MOCK_EV[i % MOCK_EV.length] + (i >= MOCK_EV.length ? '?scoring=ppr' : '') : 'https://www.rotowire.com/basketball/article/mock-article-' + (130000 + i)], clicks: Math.round((28000 - i * 90) * lyf), impressions: 500000 - i * 1200, position: 4.5 + (i % 30) / 10 })) };
}

module.exports = { ga4Report, gscQuery };
