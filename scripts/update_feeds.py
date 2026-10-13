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
from urllib.parse import urljoin
from xml.etree import ElementTree as ET

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "docs" / "data"
UA = "Mozilla/5.0 (compatible; EU-CERT-Atlas/1.0; +https://github.com/angelflyer/story)"
TIMEOUT = 25
MAX_ITEMS = 8


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/rss+xml, application/atom+xml, application/xml, text/xml, text/html;q=0.8, */*;q=0.5"})
    with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
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
        if tag == "link" and "alternate" in (a.get("rel") or "").lower() and any(t in (a.get("type") or "") for t in ("rss", "atom")) and a.get("href"):
            self.found.append(a["href"])


def discover(home):
    raw, ctype, final = fetch(home)
    p = AltLinks()
    p.feed(raw.decode("utf-8", "replace"))
    return [urljoin(final, h) for h in p.found]


def update(cert):
    tried = []
    candidates = list(cert.get("feeds") or [])
    for phase in ("known", "discovered"):
        if phase == "discovered":
            try:
                candidates = [u for u in discover(cert["url"]) if u not in tried]
            except Exception as e:  # noqa: BLE001
                tried.append(f"{cert['url']} (discovery: {type(e).__name__})")
                break
        for url in candidates:
            tried.append(url)
            try:
                raw, _, final = fetch(url)
                items = parse_feed(raw, final)
            except Exception:  # noqa: BLE001
                continue
            if items:
                return {"status": "ok", "feed": url, "via": phase, "items": items}
    return {"status": "no-feed", "tried": tried, "items": []}


def main():
    certs = json.loads((DATA / "certs.json").read_text("utf-8"))["certs"]
    previous = {}
    out_path = DATA / "latest.json"
    if out_path.exists():
        previous = json.loads(out_path.read_text("utf-8")).get("teams", {})
    teams = {}
    for c in certs:
        r = update(c)
        # Keep the last good items when a feed is temporarily down.
        if r["status"] != "ok" and previous.get(c["id"], {}).get("items"):
            r = {**previous[c["id"]], "status": "stale", "error": "latest fetch failed"}
        teams[c["id"]] = r
        print(f"{c['id']:<14} {r['status']:<8} {r.get('feed', '')}", file=sys.stderr)
    out = {"updated": datetime.now(timezone.utc).isoformat(timespec="seconds"), "teams": teams}
    out_path.write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n", "utf-8")
    write_opml(certs, teams)


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
