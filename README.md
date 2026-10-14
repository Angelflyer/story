# CERT Atlas

A comparison of the national CSIRTs/CERTs of all 27 EU member states, plus EU-level bodies (CERT-EU, ENISA EUVD), free community services (Shadowserver, abuse.ch, DIVD, MISP) and 18 national teams from 17 countries outside the EU for comparison (UK, Switzerland, Norway, Ukraine, US CISA and CERT/CC, Canada, Brazil, Japan, South Korea, Singapore, India, China, Taiwan, Hong Kong, Australia, New Zealand, Israel).

- `docs/index.html` is the website: overview map, ratings, comparison table, a service directory grouped by type (feeds, blocklists, alerts, reporting, notifications, tools, newsletters), latest posts and subscription links.
- `docs/data/certs.json` is the hand-curated dataset (services, links, stats, scores). Edit it to correct or add a team.
- `scripts/update_feeds.py` fetches each team's RSS/Atom feed. It tries known URLs first, then auto-discovers feeds on the team's homepage. Output goes to `docs/data/latest.json` (newest posts), `docs/data/history.json` (every dated post seen, for the activity chart) and `docs/data/feeds.opml`.
- `.github/workflows/update-feeds.yml` runs the updater every 6 hours and commits the results.

### How each team is tracked

1. Known feed URLs from `certs.json` (`feeds`), or a JSON API (`api`, used for the ENISA EUVD).
2. Feeds advertised on the team's homepage or extra `pages`, including plain links containing "rss" or "feed".
3. Common feed paths (`/feed/`, `/rss.xml`, `/index.xml` …) on the team's site.
4. If there is still no feed, new article links are read from the team's news `pages`.

Feeds with nothing newer than two years are ignored as abandoned. Sites that answer every request with HTTP 403 are marked as blocking automated readers. As of October 2026 that applies to Belgium (CCB), Lithuania (NKSC), Malta (MITA), Spain's CCN-CERT, CISA's website and Israel's INCD; Portugal's CNCS returns server errors. CISA is tracked through its KEV catalogue mirror on GitHub instead. CERT-In, TWCERT/CC, ASD's ACSC and CERT-UA have no feed the updater can read yet.

## Viewing the site

Enable GitHub Pages (Settings → Pages → Deploy from branch → `main` / `/docs`). The site is then served at https://angelflyer.github.io/certatlas/. The page loads its data with `fetch`, so open it through Pages or a local server (`python3 -m http.server -d docs`), not as a `file://` URL.

## Getting updates by email

Import `docs/data/feeds.opml` into an RSS reader that can send email digests, or add individual feed URLs to an RSS-to-email service. Newsletters and mailing lists (CERT.at daily summary, NCSC-FI, Bürger-CERT and others) are listed in the site's Follow tab. They need a personal sign-up with email confirmation.

## Scoring

Eight dimensions are each scored 0 (none found), 1 (limited or constituency-only) or 2 (public and mature): alerts, machine-readable feeds, protective blocking, reporting channels, open-source tools, proactive notifications, transparency and English availability. The total is scaled to 100. Scores are editorial assessments based on public information as of October 2026.
