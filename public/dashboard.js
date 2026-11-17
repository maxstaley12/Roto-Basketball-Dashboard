(function () {
'use strict';
const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
const DAYMS = 86400000;
const NUM = {
  cmp: (v) => (v >= 1e6 ? d3.format('.3~s')(v).replace('G', 'B') : d3.format(',.0f')(v)),
  int: d3.format(',.0f'), dec1: d3.format('.1f'), dec2: d3.format('.2f'),
  pct: (v) => d3.format('.2f')(v) + '%',
};
const signed = (v) => (v > 0 ? '+' : '') + v;
const pctText = (v) => (v == null || isNaN(v) ? 'n/a' : signed(v) + '%');
let DATA = null;
let META = null; // defaults, latest, kickoff, earliestStart (kept from the last good response)

const SCOPES = {
  article: {
    title: 'NBA Articles Tracker', noun: 'articles', Noun: 'Articles', nav: 'Top articles', th: 'Article', path: '/basketball/article/',
    desc: 'only pages under /basketball/article/',
    def: 'GA4 sessions whose landing page is under /basketball/article/.',
  },
  basketball: {
    title: 'NBA /basketball Tracker', noun: 'pages', Noun: 'Pages', nav: 'Top pages', th: 'Page', path: '/basketball/',
    desc: 'all pages under /basketball/',
    def: 'GA4 sessions whose landing page is anywhere under /basketball/ (articles, headlines, player pages, lineups and other tools, and everything else).',
  },
  evergreen: {
    title: 'NBA Evergreen Pages Tracker', noun: 'pages', Noun: 'Pages', nav: 'Top pages', th: 'Page', path: 'the evergreen pages',
    desc: 'evergreen pages only: the /basketball/ home page, tools and stand-alone pages like nba-lineups.php and rankings.php, plus the depth chart, draft assistant and advice hubs',
    def: 'GA4 sessions whose landing page is an evergreen page: the /basketball/ home page, stand-alone pages directly under /basketball/ (lineups, projected minutes, rankings, cheat sheets, injury report and so on), and the depth chart (including the 30 team pages), draft assistant, advice and shot chart pages. Left out: articles, headlines, news.php, player and team pages, and pages underneath advice.',
  },
};

const q = (sel, root) => Array.from((root || document).querySelectorAll(sel));
const el = (id) => document.getElementById(id);
const setText = (id, t) => { const e = el(id); if (e) e.textContent = t; };
const kpiRow = (metric) => (DATA.kpi || []).find((r) => r.metric === metric) || {};

// ---------- date helpers ----------
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const ms = (s) => Date.parse(s + 'T00:00:00Z');
const iso = (t) => new Date(t).toISOString().slice(0, 10);
const md = (s) => MON[+s.slice(5, 7) - 1] + ' ' + +s.slice(8, 10);
const mdy = (s) => md(s) + ', ' + s.slice(0, 4);
const rangeText = (a, b) => (a.slice(0, 4) === b.slice(0, 4) ? md(a) + ' to ' + mdy(b) : mdy(a) + ' to ' + mdy(b));
const plusDays = (s, n) => iso(ms(s) + n * DAYMS);

// ---------- state (kept in the page address so a link reopens the same view) ----------
const state = { scope: 'article', start: null, end: null };
(function readUrl() {
  const p = new URLSearchParams(location.search);
  if (SCOPES[p.get('scope')]) state.scope = p.get('scope');
  if (/^\d{4}-\d{2}-\d{2}$/.test(p.get('start') || '')) state.start = p.get('start');
  if (/^\d{4}-\d{2}-\d{2}$/.test(p.get('end') || '')) state.end = p.get('end');
})();

function syncUrl() {
  const p = new URLSearchParams();
  if (state.scope !== 'article') p.set('scope', state.scope);
  const d = META && META.defaults;
  if (state.start && state.end && !(d && d.start === state.start && d.end === state.end)) { p.set('start', state.start); p.set('end', state.end); }
  const qs = p.toString();
  try { history.replaceState(null, '', location.pathname + (qs ? '?' + qs : '')); } catch (e) { /* ignore */ }
}

// ---------- tiles, text ----------
function fillTiles() {
  q('[data-draw="tile"]').forEach((e) => {
    const r = kpiRow(e.dataset.metric);
    e.textContent = r.current != null && !isNaN(r.current) ? NUM[e.dataset.fmt](r.current) : '—';
  });
  q('[data-draw="ly"]').forEach((e) => {
    const r = kpiRow(e.dataset.metric);
    e.textContent = r.last_year != null && !isNaN(r.last_year) ? NUM[e.dataset.fmt](r.last_year) : '—';
  });
  q('[data-draw="chip"]').forEach((e) => {
    const r = kpiRow(e.dataset.metric);
    const v = r[e.dataset.kind === 'pct' ? 'yoy_pct' : 'yoy_abs'];
    e.classList.remove('good', 'bad');
    if (v == null || isNaN(v)) { e.textContent = '—'; return; }
    e.textContent = e.dataset.kind === 'pct' ? signed(v) + '%' : signed(v);
    if (v !== 0) e.classList.add((e.dataset.better === 'up' ? v > 0 : v < 0) ? 'good' : 'bad');
  });
  // Articles published (estimated from the sitemap): Articles view only
  const a = DATA.articles;
  setText('art-cur', a ? NUM.int(a.current) : '—');
  setText('art-ly', a ? NUM.int(a.last_year) : '—');
  setText('art-chip', a && a.yoy_pct != null ? signed(a.yoy_pct) + '%' : '—');
  setText('art-vs', a ? 'vs last year' : 'Articles view only');
}

function fillLede() {
  const e = el('lede');
  if (!e) return;
  e.replaceChildren();
  const S = SCOPES[DATA.scope];
  const o = kpiRow('Organic sessions'), c = kpiRow('Search clicks'), p = kpiRow('Purchases');
  const b = (t) => { const x = document.createElement('b'); x.textContent = t; return x; };
  const cur = DATA.window.current;
  const isDefault = META && META.defaults.start === cur.start && META.defaults.end === cur.end;
  e.append((isDefault ? 'Season to date (' : 'For ') + rangeText(cur.start, cur.end) + (isDefault ? ')' : '') + ', organic sessions to these ' + S.noun + ' are ', b(pctText(o.yoy_pct)),
    ' and search clicks are ', b(pctText(c.yoy_pct)),
    (DATA.days % 7 === 0 ? ' vs the same weeks last year.' : ' vs the weekday-aligned dates last year.') + ' Purchases from sessions that start on these pages: ',
    b(String(p.current)), ' this year vs ', b(String(p.last_year)), ' last year.');
}

function fillText() {
  const S = SCOPES[DATA.scope];
  const w = DATA.window, cur = w.current, ly = w.lastYear, days = DATA.days;
  const unit = DATA.weeklyUnit === 'day' ? 'day' : 'week';
  const per = unit === 'day' ? 'by day' : 'by week';
  document.title = S.title;
  setText('title-text', S.title);
  setText('scope', rangeText(cur.start, cur.end) + ' vs the weekday-aligned same dates of last year (' + rangeText(ly.start, ly.end) + ') · ' + S.desc + ' · GA4 + Search Console');
  setText('rangebox', days % 7 === 0 ? days / 7 + ' full weeks' : days + ' days');
  setText('nav-pages', S.nav);
  setText('h-sessions', 'Organic sessions ' + per);
  setText('h-clicks', 'Search clicks ' + per);
  setText('h-purchases', 'Purchases ' + per);
  const last = (DATA.weekly || []).slice(-1)[0];
  const partial = unit === 'week' && last && last.days < 7 ? ' The last point covers only ' + last.days + (last.days === 1 ? ' day' : ' days') + ', so it will look low.' : '';
  setText('n-weeks', unit === 'day'
    ? 'Each point is one day, starting ' + md(cur.start) + '. Last year\'s days are shifted 364 days so weekdays line up; the dashed line is last year.'
    : 'Each point is one week of seven days, labeled by its start date. Last year\'s weeks are shifted 364 days so weekdays line up; the dashed line is last year.' + partial);
  setText('n-clicks', 'Google web search clicks to ' + S.path + ', same ' + (unit === 'day' ? 'daily' : 'weekly') + ' buckets.');
  setText('n-purch', 'Purchases from organic sessions that landed on these ' + S.noun + '. ' + (unit === 'day' ? 'Daily' : 'Weekly') + ' counts are small, so expect noise.');
  setText('h-pages', 'Top ' + S.noun + ' by search clicks');
  setText('n-top', 'The top 250 ' + S.noun + ' by web-search clicks in this range. Pages with several query-string versions are combined.' +
    (DATA.yoy ? ' "Last yr" is the same dates shifted back 364 days; "new" means the page had no search clicks then.' : '') + ' Scroll inside the table to see more.');
  setText('h-converting', S.Noun + ' with the most purchases');
  setText('n-conv', 'Purchases are credited to the page a session landed on, so they show where the visit started, not necessarily where the buyer decided. Only pages with at least one purchase this year or last year appear, up to 250, and counts per page are small, so read the tail as examples, not a ranking.' + (DATA.yoy ? ' "Last yr" is the same dates shifted back 364 days (aligned weekdays); "new" means no purchases from that page then, and "lost" marks pages that had purchases last year but none now (listed after the pages that have purchases). Sessions here count every channel, not just organic, so they will not match the organic cards above; "n/a" means the page was outside last year\'s top landing pages.' : '') + ' Scroll inside the table to see more.');
  q('.th-page').forEach((t) => { t.textContent = S.th; });
  setText('h-topics', 'Which topics drive traffic and purchases');
  setText('n-topics', 'Organic search sessions and purchases to ' + S.path + ' grouped by topic, using keywords in each page\'s URL. Same dates and view as everything above; the legend shows each topic\'s count and share.');
  setText('def-scope', S.def);
  setText('def-window', (days % 7 === 0 ? days / 7 + ' full weeks' : days + ' days') + ', ' + rangeText(cur.start, cur.end) + '.');
  setText('asof-tag', 'AS OF ' + md(cur.end).toUpperCase());
  setText('asof-text', 'Search Console data lags about two days, so ranges end no later than ' + md(META.latest) + '.' +
    (DATA.articles ? ' Articles published is estimated from the basketball article sitemap (snapshot ' + md(DATA.articles.snapshot) + '), not read live.' : ' Articles published is only estimated for the Articles view.'));
  // opening-night note only when an opening night falls inside the window
  const k = META.kickoff;
  const inCur = k.current >= cur.start && k.current <= cur.end, inLy = k.lastYear >= ly.start && k.lastYear <= ly.end;
  const kb = el('kickoff');
  if (kb) kb.style.display = inCur || inLy ? '' : 'none';
}

// ---------- chart ----------
function yoyChart(box, cur, ly, label) {
  box.replaceChildren();
  const rows = (DATA && DATA.weekly) || [];
  if (!rows.length) { box.textContent = 'No data'; return; }
  const W = Math.max(280, box.clientWidth), H = 240;
  const fmtT = d3.format(',.0f');
  const maxV = d3.max(rows, (r) => Math.max(r[cur], r[ly])) || 1;
  const y = d3.scaleLinear().domain([0, maxV]).nice().range([H - 28, 30]);
  const yt = y.ticks(4);
  const left = Math.max(...yt.map((t) => fmtT(t).length)) * 7 + 14;
  const x = d3.scalePoint().domain(rows.map((r) => r.n)).range([left + 10, W - 34]);
  const dayFmt = d3.utcFormat('%b %-d');
  const wk = (r) => dayFmt(new Date(r.week + 'T00:00:00Z'));
  const unit = DATA.weeklyUnit === 'day' ? 'day' : 'week';
  const len = unit === 'day' ? 1 : 7;
  const yrCur = DATA.window.current.start.slice(0, 4), yrLy = DATA.window.lastYear.start.slice(0, 4);
  const svg = d3.select(box).append('svg').attr('width', '100%').attr('height', H).attr('viewBox', '0 0 ' + W + ' ' + H).attr('role', 'img').attr('aria-label', label);
  svg.append('g').selectAll('line').data(yt).join('line').attr('x1', left).attr('x2', W - 8).attr('y1', (d) => y(d)).attr('y2', (d) => y(d)).style('stroke', '#e6eaf2');
  svg.append('g').selectAll('text').data(yt).join('text').attr('x', left - 6).attr('y', (d) => y(d) + 4).attr('text-anchor', 'end').text(fmtT).style('fill', '#6b7690').style('font-size', '11px').style('font-family', MONO);
  const line = (key) => d3.line().x((r) => x(r.n)).y((r) => y(r[key]))(rows);
  svg.append('path').attr('d', d3.area().x((r) => x(r.n)).y0(y(0)).y1((r) => y(r[cur]))(rows)).style('fill', '#2c5aa8').style('fill-opacity', 0.08);
  svg.append('path').attr('d', line(ly)).style('fill', 'none').style('stroke', '#6b7690').style('stroke-width', 2).style('stroke-dasharray', '5 3');
  svg.append('path').attr('d', line(cur)).style('fill', 'none').style('stroke', '#2c5aa8').style('stroke-width', 2.5);
  svg.append('g').selectAll('circle').data(rows.slice(-1)).join('circle').attr('cx', (r) => x(r.n)).attr('cy', (r) => y(r[cur])).attr('r', 3).style('fill', '#2c5aa8');

  // opening-night markers, drawn only when that date is inside that year's window
  const stepPx = rows.length > 1 ? x(rows[1].n) - x(rows[0].n) : 0;
  const kx = (days) => x(rows[0].n) + (days / len) * stepPx;
  const K = META.kickoff, W_ = DATA.window;
  const off = (k, start) => (ms(k) - ms(start)) / DAYMS;
  const o25 = off(K.lastYear, W_.lastYear.start), o26 = off(K.current, W_.current.start);
  const kd = (d) => d.slice(5, 7) + '/' + d.slice(8, 10);
  if (o25 >= 0 && o25 < DATA.days) {
    const k25 = kx(o25);
    svg.append('line').attr('x1', k25).attr('x2', k25).attr('y1', 34).attr('y2', H - 28).style('stroke', '#9aa5bd').style('stroke-width', 1).style('stroke-dasharray', '2 3');
    svg.append('text').attr('x', k25 - 6).attr('y', 26).attr('text-anchor', 'end').text(K.lastYear.slice(0, 4) + ' opener ' + kd(K.lastYear)).style('fill', '#6b7690').style('font-size', '11px').style('font-family', MONO);
  }
  if (o26 >= 0 && o26 < DATA.days) {
    const k26 = kx(o26);
    svg.append('line').attr('x1', k26).attr('x2', k26).attr('y1', 34).attr('y2', H - 28).style('stroke', '#e0303a').style('stroke-width', 1).style('stroke-dasharray', '3 3');
    svg.append('text').attr('x', k26 + 6).attr('y', 26).attr('text-anchor', 'start').text('Opener ' + kd(K.current)).style('fill', '#e0303a').style('font-size', '11px').style('font-weight', 700).style('font-family', MONO);
  }
  const lg = svg.append('g').attr('transform', 'translate(' + (left + 10) + ',12)');
  lg.append('line').attr('x1', 0).attr('x2', 22).attr('y1', 0).attr('y2', 0).style('stroke', '#2c5aa8').style('stroke-width', 2.5);
  lg.append('text').attr('x', 28).attr('y', 4).text(yrCur).style('fill', '#6b7690').style('font-size', '11px').style('font-family', MONO);
  lg.append('line').attr('x1', 120).attr('x2', 142).attr('y1', 0).attr('y2', 0).style('stroke', '#6b7690').style('stroke-width', 2).style('stroke-dasharray', '5 3');
  lg.append('text').attr('x', 148).attr('y', 4).text(yrLy + ' (aligned)').style('fill', '#6b7690').style('font-size', '11px').style('font-family', MONO);

  const tip = d3.select(box).append('div').attr('class', 'tip').style('display', 'none');
  svg.append('rect').attr('x', left).attr('y', 24).attr('width', W - left).attr('height', H - 52).style('fill', 'transparent')
    .on('mousemove', (ev) => {
      const p = d3.pointer(ev, box);
      const r = rows.reduce((best, d) => (Math.abs(x(d.n) - p[0]) < Math.abs(x(best.n) - p[0]) ? d : best), rows[0]);
      const head = (unit === 'day' ? '' : 'Week of ') + wk(r) + (unit === 'week' && r.days < 7 ? ' (' + r.days + '-day partial week)' : '');
      tip.style('display', 'block').style('left', Math.max(0, Math.min(p[0] + 12, W - 230)) + 'px').style('top', Math.max(p[1] - 40, 0) + 'px')
        .text(head + ': ' + fmtT(r[cur]) + ' (' + yrCur + ') vs ' + fmtT(r[ly]) + ' (' + yrLy + ')');
    })
    .on('mouseleave', () => tip.style('display', 'none'));
  const step = Math.ceil(rows.length / Math.max(2, Math.floor((W - left) / 60)));
  svg.append('g').selectAll('text').data(rows.filter((r, i) => i % step === 0)).join('text')
    .attr('x', (r) => x(r.n)).attr('y', H - 10).attr('text-anchor', 'middle')
    .text(wk).style('fill', '#6b7690').style('font-size', '11px').style('font-family', MONO);
}

function drawCharts() {
  const S = SCOPES[DATA.scope];
  const per = DATA.weeklyUnit === 'day' ? 'day' : 'week';
  const defs = [
    ['chart-sessions', 'sessions', 'sessions_ly', 'Line chart of organic sessions per ' + per + ' to ' + S.path + ', this year against the aligned dates of last year'],
    ['chart-clicks', 'clicks', 'clicks_ly', 'Line chart of search clicks per ' + per + ' to ' + S.path + ', this year against the aligned dates of last year'],
    ['chart-purchases', 'purchases', 'purchases_ly', 'Line chart of purchases per ' + per + ' from organic sessions to ' + S.path + ', this year against the aligned dates of last year'],
  ];
  defs.forEach(([id, cur, ly, label]) => { const e = el(id); if (e) yoyChart(e, cur, ly, label); });
}

// ---------- topic pies ----------
const PALETTE = ['#2c5aa8', '#e0303a', '#2f8f7a', '#b4501e', '#7c3aed', '#b8305a', '#0e8aa8', '#a07a00', '#4f7d2a', '#c0508f', '#5b6b8c', '#1d6b4f', '#8a4fff', '#6d4c41'];
const OTHER_COLOR = '#c3cad8';
function topicColor(name) {
  const c = DATA.clusters || {};
  if (name === 'Everything else') return OTHER_COLOR;
  const i = (c.order || []).indexOf(name);
  return PALETTE[(i < 0 ? 0 : i) % PALETTE.length];
}

function drawPie(box, title, rows, total, unit) {
  box.replaceChildren();
  const h = document.createElement('h3'); h.textContent = title; box.appendChild(h);
  const sub = document.createElement('p'); sub.className = 'sub'; sub.textContent = NUM.int(total) + ' ' + unit + ' in this range'; box.appendChild(sub);
  if (!rows.length || !total) { const n = document.createElement('p'); n.className = 'note'; n.textContent = 'No data in this range.'; box.appendChild(n); return; }
  const size = Math.max(200, Math.min(280, (box.clientWidth || 420) - 36));
  const wrap = document.createElement('div'); wrap.className = 'donut'; box.appendChild(wrap);
  const R = size / 2;
  const svg = d3.select(wrap).append('svg').attr('width', size).attr('height', size).attr('viewBox', '0 0 ' + size + ' ' + size).attr('role', 'img')
    .attr('aria-label', title + ': ' + rows.slice(0, 5).map((r) => r.name + ' ' + d3.format('.0%')(r.value / total)).join(', '));
  const g = svg.append('g').attr('transform', 'translate(' + R + ',' + R + ')');
  const arc = d3.arc().innerRadius(R * 0.58).outerRadius(R - 2).padAngle(0.012);
  const arcHover = d3.arc().innerRadius(R * 0.58).outerRadius(R + 2).padAngle(0.012);
  const pie = d3.pie().sort(null).value((r) => r.value)(rows);
  const tip = d3.select(wrap).append('div').attr('class', 'tip').style('display', 'none');
  g.selectAll('path').data(pie).join('path').attr('d', arc).style('fill', (d) => topicColor(d.data.name)).style('stroke', '#fff').style('stroke-width', 1)
    .on('mousemove', function (ev, d) {
      d3.select(this).attr('d', arcHover);
      const p = d3.pointer(ev, wrap);
      tip.style('display', 'block').style('left', Math.max(0, Math.min(p[0] + 12, size - 150)) + 'px').style('top', Math.max(p[1] - 30, 0) + 'px')
        .text(d.data.name + ': ' + NUM.int(d.data.value) + ' (' + d3.format('.1%')(d.data.value / total) + ')');
    })
    .on('mouseleave', function () { d3.select(this).attr('d', arc); tip.style('display', 'none'); });
  const ctr = document.createElement('div'); ctr.className = 'center'; ctr.style.top = (R - 20) + 'px';
  const b = document.createElement('b'); b.textContent = NUM.cmp(total); const sp = document.createElement('span'); sp.textContent = unit;
  ctr.append(b, sp); wrap.appendChild(ctr);
  const ul = document.createElement('ul'); ul.className = 'legend';
  rows.forEach((r) => {
    const li = document.createElement('li');
    const sw = document.createElement('span'); sw.className = 'sw'; sw.style.background = topicColor(r.name);
    const nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = r.name;
    const vl = document.createElement('span'); vl.className = 'vl'; vl.textContent = NUM.int(r.value);
    const pc = document.createElement('span'); pc.className = 'pc'; pc.textContent = d3.format('.1%')(r.value / total);
    li.append(sw, nm, vl, pc); ul.appendChild(li);
  });
  box.appendChild(ul);
}

function drawPies() {
  const c = DATA.clusters;
  if (!c) return;
  drawPie(el('pie-sessions'), 'Organic sessions by topic', c.sessions || [], c.sessionsTotal || 0, 'sessions');
  drawPie(el('pie-purchases'), 'Organic purchases by topic', c.purchases || [], c.purchasesTotal || 0, 'purchases');
}

function fillTable(bodySel, rows, cols) {
  const tb = document.querySelector(bodySel);
  if (!tb) return;
  tb.replaceChildren();
  rows.forEach((r) => {
    const tr = document.createElement('tr');
    cols.forEach((c) => {
      const td = document.createElement('td');
      const cls = [];
      if (c.num) cls.push('num');
      if (c.yoy) cls.push('yoy');
      if (c.tone) { const t = c.tone(r); if (t) cls.push(t); }
      if (cls.length) td.className = cls.join(' ');
      const v = c.text ? c.text(r) : r[c.key];
      td.textContent = v == null ? '' : (c.text ? v : c.fmt(v));
      tr.appendChild(td);
    });
    tb.appendChild(tr);
  });
}

function render() {
  fillText();
  fillTiles();
  fillLede();
  drawCharts();
  drawPies();
  const yoy = !!DATA.yoy;
  ['tbl-top', 'tbl-conv'].forEach((id) => { const t = el(id); if (t) t.classList.toggle('noyoy', !yoy); });
  const goodBad = (v) => (v > 0 ? 'good' : v < 0 ? 'bad' : 'flat');
  fillTable('[data-draw="top_rows"]', DATA.topPages || [], [
    { key: 'label', fmt: String }, { key: 'clicks', num: true, fmt: NUM.int },
    { key: 'clicks_ly', num: true, yoy: true, fmt: NUM.int },
    { key: 'change_pct', num: true, yoy: true, text: (r) => (r.change_pct == null ? 'new' : signed(r.change_pct) + '%'), tone: (r) => (r.change_pct == null ? 'flat' : goodBad(r.change_pct)) },
    { key: 'impressions', num: true, fmt: NUM.int }, { key: 'position', num: true, fmt: NUM.dec1 },
  ]);
  fillTable('[data-draw="conv_rows"]', DATA.converters || [], [
    { key: 'label', fmt: String }, { key: 'sessions', num: true, fmt: NUM.int },
    { key: 'sessions_ly', num: true, yoy: true, text: (r) => (r.sessions_ly == null ? 'n/a' : NUM.int(r.sessions_ly)) },
    { key: 'purchases', num: true, fmt: NUM.int },
    { key: 'purchases_ly', num: true, yoy: true, fmt: NUM.int },
    { key: 'change_abs', num: true, yoy: true, text: (r) => (r.is_new ? 'new' : r.dropped ? 'lost (' + signed(r.change_abs) + ')' : signed(r.change_abs)), tone: (r) => (r.is_new ? 'flat' : goodBad(r.change_abs)) },
  ]);
  document.querySelectorAll('.tablewrap').forEach((t) => { t.scrollTop = 0; });
}

// ---------- controls ----------
function syncControls() {
  q('#scope-seg button').forEach((b) => b.classList.toggle('on', b.dataset.scope === state.scope));
  const s = el('d-start'), e = el('d-end');
  if (META) {
    s.min = META.earliestStart; s.max = META.latest; e.min = META.earliestStart; e.max = META.latest;
  }
  if (state.start) s.value = state.start;
  if (state.end) e.value = state.end;
  const d = META && META.defaults;
  const presets = presetRanges();
  q('#presets button').forEach((b) => {
    const r = presets[b.dataset.preset];
    b.classList.toggle('on', !!(r && r.start === state.start && r.end === state.end));
  });
  void d;
}

function presetRanges() {
  if (!META) return {};
  const d = META.defaults;
  return {
    season: { start: d.start, end: d.end },
    l14: { start: plusDays(META.latest, -13), end: META.latest },
    l28: { start: plusDays(META.latest, -27), end: META.latest },
  };
}

function setMsg(t) { setText('ctl-msg', t || ''); }

function validate(start, end) {
  if (!start || !end) return 'Pick both a start and an end date.';
  if (start > end) return 'The start date is after the end date.';
  if (META) {
    if (start < META.earliestStart) return 'The earliest start date is ' + mdy(META.earliestStart) + '.';
    if (end > META.latest) return 'Search Console data lags about two days, so the latest end date is ' + mdy(META.latest) + '.';
  }
  if ((ms(end) - ms(start)) / DAYMS + 1 > 366) return 'Please pick a range of 366 days or fewer.';
  return '';
}

function wireControls() {
  q('#scope-seg button').forEach((b) => b.addEventListener('click', () => {
    if (state.scope === b.dataset.scope) return;
    state.scope = b.dataset.scope; load();
  }));
  el('d-apply').addEventListener('click', () => {
    const start = el('d-start').value, end = el('d-end').value;
    const msg = validate(start, end);
    if (msg) { setMsg(msg); return; }
    state.start = start; state.end = end; load();
  });
  q('#presets button').forEach((b) => b.addEventListener('click', () => {
    const r = presetRanges()[b.dataset.preset];
    if (!r) return;
    const msg = validate(r.start, r.end);
    if (msg) { setMsg(msg); return; }
    state.start = r.start; state.end = r.end; load();
  }));
}

// ---------- loading ----------
function showError(msg) {
  let box = el('errbox');
  if (!box) {
    box = document.createElement('div');
    box.id = 'errbox';
    box.className = 'errbox';
    const nfl = document.querySelector('.nfl');
    nfl.insertBefore(box, el('kpis'));
  }
  box.style.display = 'block';
  box.textContent = 'Could not load the data: ' + msg;
}
const hideError = () => { const b = el('errbox'); if (b) b.style.display = 'none'; };

let seq = 0;
function load() {
  const my = ++seq;
  const root = document.querySelector('.nfl');
  root.classList.add('loading');
  setMsg('Loading…');
  syncControls();
  const p = new URLSearchParams({ scope: state.scope });
  if (state.start && state.end) { p.set('start', state.start); p.set('end', state.end); }
  fetch('/api/data?' + p.toString(), { credentials: 'same-origin' })
    .then((r) => {
      if (r.status === 401) { location.href = '/login.html'; return null; }
      return r.json().then((j) => { if (!r.ok) throw new Error(j.error || 'Request failed'); return j; });
    })
    .then((d) => {
      if (!d || my !== seq) return;
      DATA = d;
      META = { defaults: d.defaults, latest: d.latest, kickoff: d.kickoff, earliestStart: d.earliestStart };
      state.scope = d.scope; state.start = d.window.current.start; state.end = d.window.current.end;
      hideError(); setMsg(''); render(); syncControls(); syncUrl();
    })
    .catch((e) => {
      if (my !== seq) return;
      setMsg('');
      showError(e.message);
    })
    .finally(() => { if (my === seq) root.classList.remove('loading'); });
}

wireControls();
load();

let t = null;
window.addEventListener('resize', () => { clearTimeout(t); t = setTimeout(() => { if (DATA) { drawCharts(); drawPies(); } }, 150); });
})();
