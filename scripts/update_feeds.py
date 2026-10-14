#!/usr/bin/env python3
"""Fetch the latest posts from every CERT listed in docs/data/certs.json.

For each team it tries the known feed URLs first, then looks for an
RSS/Atom <link rel="alternate"> on the team's homepage. Results go to
docs/data/latest.json, which the website reads. Standard library only.
"""
import json
import re
import sys
import urllib.request
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from html import unescape
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin, urlparse
from xml.etree import ElementTree as ET

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "docs" / "data"
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
TIMEOUT = 20
MAX_ITEMS = 60  # items read per feed; all feed the activity history
SHOW_ITEMS = 8  # items kept per team in latest.json
HISTORY_DAYS = 400
DEAD_DAYS = 730  # a feed with nothing newer than this is treated as abandoned


_opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor())


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "en-GB,en;q=0.8", "Accept": "application/rss+xml, application/atom+xml, application/xml, text/xml, text/html;q=0.8, */*;q=0.5"})
    with _opener.open(req, timeout=TIMEOUT) as r:
        return r.read(3_000_000), r.headers.get("Content-Type", ""), r.geturl()


def local(tag):
    return tag.rsplit("}", 1)[-1].lower()


def child(el, *names):
    for c in el:
        if local(c.tag) in names:
            return c
    return None


def text(el):
    return (el.text or "").strip() if el is not None else ""


def clean(s, n=280):
    s = unescape(re.sub(r"<[^>]+>", " ", s or ""))
    s = re.sub(r"\s+", " ", s).strip()
    return s if len(s) <= n else s[: n - 1].rsplit(" ", 1)[0] + "…"


def parse_date(s):
    if not s:
        return None
    s = s.strip()
    try:
        d = parsedate_to_datetime(s)
    except (TypeError, ValueError):
        d = None
    if d is None:
        try:
            d = datetime.fromisoformat(s.replace("Z", "+00:00"))
        except ValueError:
            return None
    if d.tzinfo is None:
        d = d.replace(tzinfo=timezone.utc)
    return d.astimezone(timezone.utc).isoformat()


def parse_feed(raw, base):
    root = ET.fromstring(raw)
    items = []
    for el in root.iter():
        kind = local(el.tag)
        if kind not in ("item", "entry"):
            continue
        title = clean(text(child(el, "title")), 200)
        link_el = child(el, "link")
        link = ""
        if link_el is not None:
            link = link_el.get("href") or text(link_el)
        if kind == "entry":
            for c in el:
                if local(c.tag) == "link" and c.get("rel", "alternate") == "alternate" and c.get("href"):
                    link = c.get("href")
                    break
        date = parse_date(text(child(el, "pubdate", "published", "updated", "date", "issued")))
        summary = clean(text(child(el, "description", "summary", "content")))
        if title or link:
            items.append({"title": title or link, "link": urljoin(base, link.strip()), "date": date, "summary": summary})
    items.sort(key=lambda i: i["date"] or "", reverse=True)
    return items[:MAX_ITEMS]


class AltLinks(HTMLParser):
    def __init__(self):
        super().__init__()
        self.found = []

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "a" and a.get("href") and re.search(r"(rss|atom|/feed)", a["href"], re.I) and not a["href"].startswith("mailto:"):
            self.found.append(a["href"])
        if tag == "link" and "alternate" in (a.get("rel") or "").lower() and any(t in (a.get("type") or "") for t in ("rss", "atom")) and a.get("href"):
            self.found.append(a["href"])


class Anchors(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links, self._href, self._text = [], None, []

    def handle_starttag(self, tag, attrs):
        if tag == "a":
            self._href, self._text = dict(attrs).get("href"), []

    def handle_data(self, data):
        if self._href is not None:
            self._text.append(data)

    def handle_endtag(self, tag):
        if tag == "a" and self._href is not None:
            self.links.append((self._href, " ".join(self._text)))
            self._href = None


DATE_RE = re.compile(r"\b(20\d\d)[-./](\d{1,2})[-./](\d{1,2})\b|\b(\d{1,2})[./](\d{1,2})[./](20\d\d)\b")


def watch_page(page):
    """Fallback for teams without a feed: list article links from a news page."""
    raw, _, final = fetch(page)
    p = Anchors()
    p.feed(raw.decode("utf-8", "replace"))
    base = urlparse(final)
    listing = base.path.rstrip("/")
    skip = {final.rstrip("/"), f"{base.scheme}://{base.netloc}"}
    items, seen = [], set()
    for href, txt in p.links:
        title = clean(txt, 200)
        if not href or len(title) < 25 or href.startswith(("#", "mailto:", "javascript:")):
            continue
        url = urljoin(final, href).split("#")[0]
        u = urlparse(url)
        if u.netloc != base.netloc or url.rstrip("/") in skip or url in seen:
            continue
        depth = len([x for x in u.path.split("/") if x])
        under_listing = listing and u.path.startswith(listing + "/") and len(u.path.rstrip("/")) > len(listing) + 1
        if depth < 2 or not (under_listing or re.search(r"\d{3,}", u.path)):
            continue
        seen.add(url)
        m = DATE_RE.search(url) or DATE_RE.search(txt)
        date = None
        if m:
            y, mo, d = (m.group(1), m.group(2), m.group(3)) if m.group(1) else (m.group(6), m.group(5), m.group(4))
            try:
                date = datetime(int(y), int(mo), int(d), tzinfo=timezone.utc).isoformat()
            except ValueError:
                pass
        items.append({"title": title, "link": url, "date": date, "summary": ""})
        if len(items) >= MAX_ITEMS:
            break
    return items if len(items) >= 3 else []


def discover(home):
    raw, ctype, final = fetch(home)
    p = AltLinks()
    p.feed(raw.decode("utf-8", "replace"))
    return [urljoin(final, h) for h in p.found]


COMMON_PATHS = ("/feed/", "/rss.xml", "/rss", "/feed.xml", "/atom.xml", "/index.xml", "/feed.rss", "/?format=feed&type=rss")


def common_feeds(url):
    p = urlparse(url)
    origin = f"{p.scheme}://{p.netloc}"
    prefix = p.path.rstrip("/")
    out = [origin + path for path in COMMON_PATHS]
    if prefix:
        out = [origin + prefix + path for path in COMMON_PATHS[:3]] + out
    return out


def parse_euvd(raw, base):
    """ENISA EUVD JSON API -> feed items."""
    data = json.loads(raw)
    rows = data.get("items", data) if isinstance(data, dict) else data
    items = []
    for r in rows or []:
        vid = r.get("id") or r.get("enisaUuid") or ""
        aliases = (r.get("aliases") or "").split()
        title = vid + (f" ({aliases[0]})" if aliases else "")
        score = r.get("baseScore")
        if score not in (None, "", -1):
            title += f" · CVSS {score}"
        date = None
        for f in ("datePublished", "dateUpdated", "exploitedSince"):
            if r.get(f):
                for fmt in ("%b %d, %Y, %I:%M:%S %p", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d"):
                    try:
                        date = datetime.strptime(r[f].split(".")[0], fmt).replace(tzinfo=timezone.utc).isoformat()
                        break
                    except ValueError:
                        continue
                if date:
                    break
        items.append({"title": title or "EUVD entry", "link": f"https://euvd.enisa.europa.eu/vulnerability/{vid}" if vid else base, "date": date, "summary": clean(r.get("description"))})
    items.sort(key=lambda i: i["date"] or "", reverse=True)
    return items[:MAX_ITEMS]


def parse_kev(raw, base):
    """CISA Known Exploited Vulnerabilities JSON -> feed items (newest additions first)."""
    rows = json.loads(raw).get("vulnerabilities", [])
    rows.sort(key=lambda r: r.get("dateAdded", ""), reverse=True)
    items = []
    for r in rows[:MAX_ITEMS]:
        cve = r.get("cveID", "")
        date = parse_date(r.get("dateAdded", "") + "T00:00:00+00:00") if r.get("dateAdded") else None
        items.append({"title": f"{cve}: {r.get('vendorProject', '')} {r.get('product', '')} added to KEV", "link": f"https://nvd.nist.gov/vuln/detail/{cve}", "date": date, "summary": clean(r.get("shortDescription"))})
    return items


def try_urls(urls, tried, phase, parser=parse_feed):
    for url in urls:
        if url in tried:
            continue
        tried.append(url)
        try:
            raw, _, final = fetch(url)
            items = parser(raw, final)
        except Exception:  # noqa: BLE001
            continue
        newest = max((i["date"] for i in items if i["date"]), default=None)
        if newest and (datetime.now(timezone.utc) - datetime.fromisoformat(newest)).days > DEAD_DAYS:
            continue
        if items:
            return {"status": "ok", "feed": url, "via": phase, "items": items}
    return None


def update(cert):
    tried = []
    api = cert.get("api")
    parsers = {"euvd": parse_euvd, "kev": parse_kev}
    if api and api.get("type") in parsers:
        r = try_urls([api["url"]], tried, "api", parsers[api["type"]])
        if r:
            return r
    r = try_urls(cert.get("feeds") or [], tried, "known")
    if r:
        return r
    found = []
    for page in [cert["url"], *(cert.get("pages") or [])]:
        try:
            found += discover(page)
        except Exception as e:  # noqa: BLE001
            tried.append(f"{page} (discovery: {type(e).__name__} {getattr(e, 'code', '')})".replace(" )", ")"))
    r = try_urls(found, tried, "discovered")
    if r:
        return r
    r = try_urls(common_feeds(cert["url"]), tried, "probed")
    if r:
        return r
    for page in cert.get("pages") or []:
        try:
            items = watch_page(page)
        except Exception:  # noqa: BLE001
            continue
        if items:
            return {"status": "watched", "page": page, "via": "page", "items": items}
    blocked = bool(tried) and all("403" in t for t in tried if "discovery" in t) and any("discovery" in t for t in tried)
    return {"status": "no-feed", "blocked": blocked, "tried": tried, "items": []}


def main():
    certs = json.loads((DATA / "certs.json").read_text("utf-8"))["certs"]
    previous = {}
    out_path = DATA / "latest.json"
    if out_path.exists():
        previous = json.loads(out_path.read_text("utf-8")).get("teams", {})
    from concurrent.futures import ThreadPoolExecutor
    with ThreadPoolExecutor(max_workers=12) as pool:
        results = dict(zip([c["id"] for c in certs], pool.map(update, certs)))
    teams = {}
    for c in certs:
        r = results[c["id"]]
        # Keep the last good items when a feed is temporarily down.
        prev_items = previous.get(c["id"], {}).get("items") or []
        prev_newest = max((i["date"] for i in prev_items if i.get("date")), default=None)
        prev_alive = prev_newest and (datetime.now(timezone.utc) - datetime.fromisoformat(prev_newest)).days <= DEAD_DAYS
        if r["status"] not in ("ok", "watched") and prev_alive:
            r = {**previous[c["id"]], "status": "stale", "error": "latest fetch failed"}
        teams[c["id"]] = r
        print(f"{c['id']:<14} {r['status']:<8} {r.get('feed', '')}", file=sys.stderr)
    update_history(teams)
    for t in teams.values():
        t["items"] = (t.get("items") or [])[:SHOW_ITEMS]
    out = {"updated": datetime.now(timezone.utc).isoformat(timespec="seconds"), "teams": teams}
    out_path.write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n", "utf-8")
    write_opml(certs, teams)


def update_history(teams):
    """Keep one dated record per post ever seen, so activity can be charted over time.

    Posts without a publication date (news-page watching) are dated on the day
    the updater first saw them.
    """
    import hashlib
    path = DATA / "history.json"
    hist = json.loads(path.read_text("utf-8")) if path.exists() else {"started": None, "teams": {}}
    today = datetime.now(timezone.utc).date()
    hist["started"] = hist.get("started") or today.isoformat()
    cutoff = (today.toordinal() - HISTORY_DAYS)
    for tid, t in teams.items():
        seen = hist["teams"].setdefault(tid, {})
        for i in t.get("items") or []:
            key = hashlib.sha1((i.get("link") or i.get("title") or "").encode()).hexdigest()[:12]
            day = (i.get("date") or "")[:10] or seen.get(key) or today.isoformat()
            seen.setdefault(key, day)
        hist["teams"][tid] = {k: d for k, d in seen.items() if datetime.fromisoformat(d).toordinal() >= cutoff}
    path.write_text(json.dumps(hist, separators=(",", ":"), sort_keys=True) + "\n", "utf-8")


def write_opml(certs, teams):
    """Feed list for importing into any RSS reader (or an RSS-to-email service)."""
    from xml.sax.saxutils import quoteattr
    lines = ['<?xml version="1.0" encoding="UTF-8"?>', '<opml version="2.0">', "<head><title>EU CERT Atlas feeds</title></head>", "<body>"]
    for c in certs:
        t = teams.get(c["id"], {})
        if t.get("feed"):
            lines.append(f'  <outline type="rss" text={quoteattr(c["cc"] + " – " + c["name"])} xmlUrl={quoteattr(t["feed"])} htmlUrl={quoteattr(c["url"])}/>')
    lines += ["</body>", "</opml>"]
    (DATA / "feeds.opml").write_text("\n".join(lines) + "\n", "utf-8")


if __name__ == "__main__":
    main()
