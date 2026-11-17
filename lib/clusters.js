const CFG = require('./config');

const rules = CFG.clusters.map((c) => ({ name: c.name, re: new RegExp(c.re) }));
const OTHER = CFG.clusterOther;

// Which topic a landing page belongs to (first matching rule wins).
function clusterOf(path) {
  const p = String(path || '').toLowerCase().replace(/[?#].*$/, '');
  for (const r of rules) if (r.re.test(p)) return r.name;
  return OTHER;
}

// Fixed order used for colours so a topic keeps its colour in both pies.
const ORDER = rules.map((r) => r.name).concat([OTHER]);

module.exports = { clusterOf, ORDER, OTHER };
