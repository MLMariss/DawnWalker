# The build list's backend

A single Cloudflare Worker over a single D1 (SQLite) database. It exists for one
reason: the planner is a static site and cannot hold a credential, so something
has to own the write access that the browser must not. Publishing and upvoting
then happen in the page, with no account and nowhere else to go.

Everything here fits inside Cloudflare's free tier by a wide margin — the
planner would need to be busier than it will ever be to leave it.

## Deploying it

You need a (free) Cloudflare account. From this folder:

```sh
npx wrangler login
npx wrangler d1 create dawnwalker-builds     # paste the id it prints into wrangler.toml
npx wrangler d1 execute dawnwalker-builds --remote --file=schema.sql
npx wrangler d1 execute dawnwalker-builds --remote --file=seed.sql   # optional, see below
```

Then the two secrets it needs. Any long random strings; keep the admin one:

```sh
npx wrangler secret put VOTE_SALT      # salts the voter fingerprint
npx wrangler secret put ADMIN_TOKEN    # lets you hide a build
npx wrangler deploy
```

`wrangler deploy` prints the Worker's URL. Put it in `data/community.json` at the
repository root and commit that — it is how the site finds this:

```json
{ "api": "https://dawnwalker-builds.<your-subdomain>.workers.dev" }
```

Check `ALLOWED_ORIGINS` in `wrangler.toml` matches where the planner is served
from. Add `http://localhost:8000` while working on it locally.

`seed.sql` carries the one build that was published while the list still lived on
the issue tracker (MLMariss/DawnWalker#17). Skip it on a fresh deployment that
wants an empty list.

## Turning on the human check

Optional, and off until you want it. Make a free
[Turnstile](https://dash.cloudflare.com/?to=/:account/turnstile) widget, then:

```sh
npx wrangler secret put TURNSTILE_SECRET
npx wrangler deploy
```

Put the matching **site** key (the public half) in `data/community.json` as
`turnstileSiteKey`. The planner loads the widget only when that key is set, and
only when the save dialog is opened. With no secret set, the Worker skips the
check and the daily cap is what holds.

## Moderating

There is no dashboard; there are four curl commands.

```sh
TOKEN=...   # the ADMIN_TOKEN you set
API=https://dawnwalker-builds.<your-subdomain>.workers.dev

curl -s $API/builds | python3 -m json.tool          # everything visible
curl -s -H "Authorization: Bearer $TOKEN" $API/admin/reported   # what players flagged
curl -s -X DELETE -H "Authorization: Bearer $TOKEN" $API/builds/12   # hide it
curl -s -X PATCH  -H "Authorization: Bearer $TOKEN" $API/builds/12   # put it back
```

Hiding is reversible and keeps the row — nothing here deletes anything, so a
mistake costs a second command.

## What stands in for a login

Publishing and voting are anonymous, which is the point of them and also what
makes abuse cheap. Three things push back, none of them unbeatable:

- **A voter fingerprint** — address and user agent, salted and hashed, never
  stored in the clear and not reversible to an address. The vote table's primary
  key dedupes on it, so one visitor is one vote per build. The user agent is in
  the hash so an office behind one address is not one single voter; the cost is
  that a browser update reads as a new voter, which is the direction to err in.
- **A daily cap** of five published builds per fingerprint.
- **Turnstile**, when configured.

The honest summary is that a determined person can still stuff the ballot. The
defence against that is `ADMIN_TOKEN` and two minutes of your time, which is the
right amount of engineering for a fan planner's upvote count.

## Costs and failure

If the Worker is down or the URL is wrong, the planner says the list would not
load and offers a retry; everything else — saving here, build codes, links —
keeps working, because none of it goes through here.
