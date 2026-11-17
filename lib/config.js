// Everything you might change week to week lives here.
// Dates are inclusive. Last year is always the same window shifted back 364 days so weekdays line up.
module.exports = {
  propertyId: 'properties/249838960',
  siteUrl: 'https://www.rotowire.com/',

  // The window the dashboard opens on. Visitors can change it with the date pickers.
  defaultRange: { start: '2026-10-20', end: '2026-11-15' },
  earliestStart: '2024-01-01', // date pickers and the API refuse anything earlier
  maxDays: 366,                // longest range allowed in one view
  shiftDays: 364,              // last-year comparison offset (keeps weekdays aligned)

  // Opening-night dates drawn as markers on the weekly charts (shown only when inside the chosen range).
  // The key is still called "kickoff" because the dashboard code reads it by that name.
  kickoff: { current: '2026-10-20', lastYear: '2025-10-21' },

  topPages: 250,       // rows shown in the "top pages" table
  topConverters: 250,  // rows shown in the "most purchases" table

  // ---- Topic clusters (the pie charts) ----
  // Each landing page goes to the FIRST cluster whose pattern matches its lowercase path. Anything that matches
  // none is "Everything else". Patterns starting with ^/basketball/article/ only apply to articles; the others
  // also catch tool pages. To tweak a topic, edit its keywords here and redeploy (no other code to change).
  clusterOther: 'Everything else',
  clusters: [
    { name: 'Cheat sheets', re: 'cheat-?sheet' },
    { name: 'Draft Pass & draft tools', re: '^/basketball/(draft-kit|draft-assistant|draft-software)|^/basketball/article/.*(draft-pass|fantasy-pass|draft-tool|draft-assist|draft-kit|draft-app|draft-prep|live-draft)' },
    { name: 'Mock drafts', re: 'mock-draft' },
    { name: 'Trade analyzer & tools', re: '^/basketball/article/.*(trade|buy-low|sell-high|analyzer|redraft|rate-my|calculator|simulator|grader|power-rankings)' },
    { name: 'DFS', re: '^/basketball/nba-dfs|^/basketball/article/.*(dfs|draftkings|fanduel|daily-fantasy|showdown|cash-game|high-score)' },
    { name: 'Waiver wire & streaming', re: '^/basketball/article/.*(waiver|stream|pickups|add-drop|free-agents)' },
    { name: 'Start/sit & weekly advice', re: '^/basketball/start-sit|^/basketball/article/.*(start-sit|sit-start|start-or-sit|who-to-start|week-\\d+-advice)' },
    { name: 'Betting picks & props', re: '^/basketball/(article|news)/.*(bets|prop|odds|picks|betting|spread|parlay|sportsbook|moneyline|over-under|win-total|futures|mvp|predictions)' },
    { name: 'Injuries', re: 'injur|^/basketball/inactives' },
    { name: 'Lineups & minutes', re: '^/basketball/(nba-lineups|lineups|projected-minutes|minutes|rotations|court-on-off)(\\.php|$)' },
    { name: 'Draft strategy & who to draft', re: '^/basketball/article/.*(draft-strategy|who-should-i-draft|drafting-from|bold-predictions|draft-guide|draft-slot|punt|category)' },
    { name: 'Rankings, ADP & sleepers', re: '^/basketball/(rankings|weekly-rankings|adp|auction-values|projections|sleepers|ratings|best-ball)|^/basketball/article/.*(adp|rank|tiers|top-\\d+|sleepers|busts|breakouts|rookie|dynasty|keeper|best-ball|auction)' },
    { name: 'Depth charts', re: '^/basketball/nba-depth-charts' },
    { name: 'Schedules, stats & trends', re: '^/basketball/(scoreboard|schedules?|schedule-adv|standings|team-trends|opp-avg|ref|ref-stats|stats|team-stats|split-stats|player-gamelog|boxscore-breakdown|breakdowns|average-points|fantasy-points-changes|playing-time-changes|shot-chart)|^/basketball/article/.*(recap|box-score|usage|stats|breakdown|team-ages|week-\\d+)' },
    { name: 'Player news & profiles', re: '^/basketball/(headlines|news\\.php|rumors\\.php|player/|team/|team$)' },
  ],
  clusterRows: 20000, // landing pages fetched per view for the pies; the remainder is added to "Everything else"

  // ---- Scopes (the toggle) ----
  // article:    everything under /basketball/article/ (the original report)
  // basketball: everything under /basketball/
  // evergreen:  the tools and hub pages worth watching, without the big content folders
  scopes: {
    article: { label: 'Articles', path: '/basketball/article/', noun: 'articles', Noun: 'Articles', title: 'NBA Articles Tracker' },
    basketball: { label: 'All /basketball', path: '/basketball/', noun: 'pages', Noun: 'Pages', title: 'NBA /basketball Tracker' },
    evergreen: { label: 'Evergreen pages', path: '/basketball/', noun: 'pages', Noun: 'Pages', title: 'NBA Evergreen Pages Tracker' },
  },

  // Evergreen = the /basketball/ home page, every stand-alone page directly under /basketball/
  // (nba-lineups.php, rankings.php, cheatsheet.php, projected-minutes.php, ...), and the folders below.
  // Left out on purpose: /article/, /headlines/, /news/, /player/, /team/ pages,
  // pages under /advice/, and /basketball/news.php and the /basketball/articles listing page.
  evergreen: {
    hubFolders: ['nba-depth-charts', 'draft-assistant', 'advice', 'shot-chart', 'mock-draft', 'start-sit'], // the folder's own page
    pageFolders: ['nba-depth-charts'], // folders whose pages underneath (the 30 team depth charts) are also included
    // removed even though they sit directly under /basketball/: the news feed, and the /basketball/articles listing page
    excludePrefixes: ['/basketball/news.php', '/basketball/articles'],
  },
};
