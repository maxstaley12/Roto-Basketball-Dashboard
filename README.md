# NBA Articles Tracker (Vercel)

Password-protected dashboard for the basketball section: GA4 + Search Console, with a view switch (articles, all /basketball, evergreen pages) and date range, compared with last year.
Same cards, charts and tables as the Claude artifact, but the data comes from a small server function
on Vercel that signs in to Google with your OAuth refresh token.

## Deploy (Vercel CLI, about 10 minutes)

1. Unzip this folder and open a terminal inside it.
2. `npm install -g vercel`, then `vercel login` (use the email you signed up to Vercel with).
3. Run `vercel` and answer the prompts: set up and deploy = Y, link to existing project = N,
   project name = basketball-dashboard, directory = ./ , accept the defaults. This creates a preview deployment.
4. Add the environment variables, either in the Vercel dashboard
   (Project -> Settings -> Environment Variables, tick Production, Preview and Development)
   or with the CLI (`vercel env add NAME production`, it prompts for the value):

   | Name | Value |
   |---|---|
   | GOOGLE_CLIENT_ID | the OAuth client ID from Google Cloud |
   | GOOGLE_CLIENT_SECRET | the OAuth client secret |
   | GOOGLE_REFRESH_TOKEN | the refresh token from the OAuth Playground |
   | DASHBOARD_PASSWORD | the password people type to view the report |
   | AUTH_SALT | optional, any random string |

5. Run `vercel --prod`. Your live URL is shown at the end. Open it, sign in, and check the numbers (below).

Never put these values in a file that gets shared or committed to GitHub. `.env` files are ignored by `.gitignore`.
If you'd rather deploy through GitHub: push this folder to a private repo, import it at vercel.com/new, and add the same variables.

## Checking it against the artifact

For the Articles view, window Oct 20 to Nov 15, 2026 vs Oct 21 to Nov 16, 2025, the cards should read
(checked against GA4 and Search Console on Nov 17, 2026):
Organic sessions 31,023 vs 69,151; Search clicks 28,490 vs 66,285; Search impressions about 1.36M vs 3.43M;
Avg position 5.37 vs 5.20; Click-through rate 2.10% vs 1.93%. Organic purchases 8 vs 16.
Articles published reads 71 vs 139 in the Articles view.
Note: /basketball/nba-lineups.php alone has about 6.2M organic sessions in the window, so the All /basketball and
Evergreen views are dominated by that one page.

## Views and date range

* Three views (buttons under the tabs): Articles (/basketball/article/), All /basketball, and Evergreen pages.
* Evergreen = the /basketball/ home page, every stand-alone page directly under /basketball/ (nba-lineups.php, rankings.php, cheatsheet.php, projected-minutes.php, draft-kit.php ...),
  plus the depth chart (including the team pages), draft assistant, advice, shot chart, mock draft and start/sit hub pages.
  Left out: articles, headlines, news, player and team pages, pages under advice, news.php and the /basketball/articles listing page.
  The rule lives in `lib/config.js` (`evergreen`). To add or drop a hub folder, edit that list and redeploy.
* Page tables (top pages by clicks, most purchases) compare with last year in every view: last-year columns and change, "new" for pages with nothing last year, and "lost" rows for pages that had purchases last year but none now. The purchases table counts all channels; the top pages table is Search Console.
* Dates: two date pickers plus quick ranges. Last year is always the same dates shifted back 364 days. Ranges of 21 days or fewer chart by day, longer ones by week.
* A link keeps the view: `?scope=evergreen&start=2026-10-20&end=2026-11-15`.
* Articles published (est.) is calculated for the Articles view from `data/publish-dates.json` (a snapshot of the basketball article sitemap, Nov 17; publish dates are estimated from article ID order plus last-modified times). It shows a dash in the other views.

## Updating things

* Default dates, opening-night dates and row limits: `lib/config.js` (`defaultRange`, `kickoff` holds the NBA opening nights).
* Refresh the Articles published numbers: send a new `basketball_articles.xml` and ask for a new `data/publish-dates.json`.
* Data is cached for 6 hours per view and date range. Add `&refresh=1` to `/api/data?...` to force a refresh.
* Change the password: edit DASHBOARD_PASSWORD in Vercel and redeploy. Everyone has to sign in again.

## If something breaks

* "Google sign-in failed: invalid_grant": the refresh token was revoked or expired. Create a new one in the OAuth Playground and update GOOGLE_REFRESH_TOKEN.
* "Google API error: ... has not been used / is disabled": enable the Google Analytics Data API and Search Console API in the Cloud project.
* "Google API error: ... permission": the Google account that made the token can't see the GA4 property or the Search Console site.
* Page says DASHBOARD_PASSWORD is not set: add the variable and redeploy. The site shows nothing until a password exists.

## Local testing

`npm install`, copy `.env.example` to `.env.local`, fill it in, then `npm run dev`.
`MOCK=1` shows fake data (layout testing only, no Google calls).

Vercel's free Hobby plan is for non-commercial use. For company work, use a Pro plan or a team.
