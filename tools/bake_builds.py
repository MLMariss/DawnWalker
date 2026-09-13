#!/usr/bin/env python3
"""Bake the community build list out of GitHub Issues into data/builds.json.

    python3 tools/bake_builds.py            # rewrite data/builds.json
    python3 tools/bake_builds.py --dry-run  # print what it would write

The planner is a static site with nowhere to keep shared state, so the issue
tracker is the database: "Share a build" opens a prefilled issue (see
.github/ISSUE_TEMPLATE/build.yml), and a 👍 reaction on that issue is an upvote.
Reading either from the browser would mean an unauthenticated GitHub API call
per visitor, rate-limited to 60 an hour per IP and slow. So the deploy workflow
runs this first and ships the answer as a flat JSON file: the site reads its own
origin, costs nothing, and cannot be rate-limited.

The cost is staleness — an upvote shows up on the site at the next deploy, and
reactions fire no webhook, so the workflow is also on a schedule. That is the
whole trade: half an hour of lag in exchange for no backend, no accounts and no
bill.

An issue counts as a build if it carries the `build` label OR its body parses as
the build form. Requiring the label would have made the feature depend on that
label existing — a label an issue form silently drops if it does not, which would
have lost the first build anyone published and given no sign of it. The form is
its own evidence, so the label is for humans to filter by, not a gate.

Moderation is the issue tracker's: close an issue, or label it `rejected`, and
it leaves the list on the next bake.

Needs GITHUB_REPOSITORY (owner/name) and GITHUB_TOKEN in the environment; the
workflow supplies both. Exits non-zero rather than writing a short list if the
API call fails, so a hiccup leaves the previous deploy — and its builds — live.
"""
import json
import os
import re
import sys
import urllib.error
import urllib.request

OUT = 'data/builds.json'
API = 'https://api.github.com'

LABEL = 'build'                       # marks an issue as a build, but see above
BLOCK = {'rejected', 'spam', 'invalid', 'duplicate'}   # ... and these are out
PAGES = 5                             # at 100 an issue, more tracker than this
                                      # is not a planner problem

# The planner's encoder emits node ids, tree keys and digits joined by these
# separators and nothing else, so anything outside the set is not a build code.
# It is a sanity check, not a security boundary: assets/app.js ignores ids it
# does not know and clamps every level it does, so a hostile code can at worst
# describe a build that is already reachable by clicking.
CODE_RE = re.compile(r'^1;[A-Za-z0-9;=,.\-]{0,4000}$')

LIMITS = {'name': 80, 'author': 40, 'notes': 600}

# Issue-form headings -> the key they land on. These are the `label:` values in
# .github/ISSUE_TEMPLATE/build.yml; change one there and it must change here.
FIELDS = {'build name': 'name', 'author': 'author',
          'build code': 'code', 'notes': 'notes'}


def get(url, token):
    req = urllib.request.Request(url, headers={
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'dawnwalker-build-baker',
        'Authorization': 'Bearer ' + token,
    })
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode('utf-8')), r.headers.get('Link', '')


def issues(repo, token):
    """Every open issue, newest first, to a bounded number of pages."""
    url = '%s/repos/%s/issues?state=open&sort=created&direction=desc&per_page=100' % (API, repo)
    out = []
    for _ in range(PAGES):
        page, link = get(url, token)
        out.extend(page)
        m = re.search(r'<([^>]+)>;\s*rel="next"', link)
        if not m:
            break
        url = m.group(1)
    return out


def parse_body(body):
    """Split an issue-form body into its fields.

       GitHub renders a submitted form as `### Label` followed by the answer, so
       the headings are the field names. An unanswered optional field renders as
       the literal `_No response_`, and a `render:`-ed textarea (the build code)
       arrives wrapped in a fence."""
    out = {}
    key = None
    buf = []

    def flush():
        if key is None:
            return
        text = '\n'.join(buf).strip()
        text = re.sub(r'^```[a-z]*\n?|\n?```$', '', text).strip()
        out[key] = '' if text == '_No response_' else text

    for line in (body or '').replace('\r\n', '\n').split('\n'):
        head = re.match(r'^###\s+(.+?)\s*$', line)
        if head:
            flush()
            key = FIELDS.get(head.group(1).strip().lower())
            buf = []
        elif key is not None:
            buf.append(line)
    flush()
    return out


def clean(text, limit):
    """One line, no control characters, capped. The site escapes this on the way
       into the DOM; this only keeps the list readable."""
    text = re.sub(r'\s+', ' ', re.sub(r'[\x00-\x1f\x7f]', ' ', text or '')).strip()
    return text[:limit].strip()


def build_from(issue):
    if 'pull_request' in issue:
        return None
    labels = {(l['name'] if isinstance(l, dict) else l).lower()
              for l in issue.get('labels', [])}
    if labels & BLOCK:
        return None

    f = parse_body(issue.get('body', ''))
    code = re.sub(r'\s+', '', f.get('code', ''))
    if not CODE_RE.match(code):
        # Only worth a line when someone meant this to be a build; every other
        # issue in the tracker lands here and is simply not one.
        if LABEL in labels:
            print('  skip #%s: no usable build code' % issue['number'], file=sys.stderr)
        return None

    # The issue title is the fallback name: a build posted by hand rather than
    # through the planner may have filled in the title and nothing else.
    name = clean(f.get('name', ''), LIMITS['name']) or \
        clean(re.sub(r'^\s*\[build\]\s*', '', issue['title'], flags=re.I), LIMITS['name'])
    return {
        'id': issue['number'],
        'name': name or ('Build #%d' % issue['number']),
        'author': clean(f.get('author', ''), LIMITS['author']),
        'notes': clean(f.get('notes', ''), LIMITS['notes']),
        'code': code,
        'votes': (issue.get('reactions') or {}).get('+1', 0),
        'url': issue['html_url'],
        'created': issue['created_at'],
    }


def main(argv):
    repo = os.environ.get('GITHUB_REPOSITORY', '')
    token = os.environ.get('GITHUB_TOKEN', '')
    if not repo or not token:
        print('GITHUB_REPOSITORY and GITHUB_TOKEN must be set', file=sys.stderr)
        return 2

    try:
        raw = issues(repo, token)
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError) as err:
        # Deliberately fatal. Writing an empty list here would publish a site
        # whose community tab had silently emptied itself.
        print('ERROR: could not read issues from %s: %s' % (repo, err), file=sys.stderr)
        return 1

    builds = [b for b in (build_from(i) for i in raw) if b]
    if len(raw) == PAGES * 100:
        print('note: stopped at %d issues; older builds are not in the list' % len(raw),
              file=sys.stderr)
    builds.sort(key=lambda b: (-b['votes'], b['created']))

    doc = {'repo': repo, 'builds': builds}
    text = json.dumps(doc, indent=1, ensure_ascii=False) + '\n'

    if '--dry-run' in argv:
        print(text)
    else:
        open(OUT, 'w', encoding='utf-8').write(text)
    print('baked %d build(s) from %d issue(s) into %s' % (len(builds), len(raw), OUT))
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
