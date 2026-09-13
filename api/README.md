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

On a database that already exists, apply any migrations instead of `schema.sql`:

```sh
npx wrangler d1 execute dawnwalker-builds --remote --file=migrations/001_owner_hash.sql
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

## Who can take a build down

Whoever published it, and you.

Publishing mints a random delete key, returns it exactly once, and stores only
its SHA-256. The planner keeps the key in the browser that published the build,
which is what makes a Delete button appear on that build and on no other. The key
is not in the list, not in the row, and no endpoint will tell anyone what it was —
so the database cannot hand out the ability to delete, and neither can a leaked
backup of it.

The cost is that the key lives in one browser. Clear your site data, or move to
another device, and you can no longer remove your own build; the admin token
still can. Builds published before `migrations/001_owner_hash.sql` ran have no
key at all and are admin-only, because an empty hash deliberately matches
nothing rather than matching an empty key.

Deleting hides the row rather than dropping it. A mis-click costs one `PATCH` to
undo, and the votes stay attached to the build they were cast for.

## Moderating

There is no dashboard; there are five curl commands.

```sh
TOKEN=...   # the ADMIN_TOKEN you set
API=https://dawnwalker-builds.<your-subdomain>.workers.dev

curl -s $API/builds | python3 -m json.tool          # everything visible
curl -s -H "Authorization: Bearer $TOKEN" $API/admin/reported   # what players flagged
curl -s -X DELETE -H "Authorization: Bearer $TOKEN" $API/builds/12   # hide it
curl -s -X PATCH  -H "Authorization: Bearer $TOKEN" $API/builds/12   # put it back
```

A player's own delete goes through the same route with the key instead of the
token, which is what the planner's Delete button sends:

```sh
curl -s -X DELETE -H "X-Build-Key: <the key publishing returned>" $API/builds/12
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
  The same fingerprint is what `DELETE /builds/:id/vote` matches on, so a voter
  can take back their own vote and no one else's. When it matches nothing the
  answer is `absent: true` rather than an error — that is the honest reply both
  to a second un-vote and to a fingerprint that has since drifted, and it leaves
  the caller free to vote again.
- **A daily cap** of five published builds per fingerprint.
- **Turnstile**, when configured.

The honest summary is that a determined person can still stuff the ballot. The
defence against that is `ADMIN_TOKEN` and two minutes of your time, which is the
right amount of engineering for a fan planner's upvote count.

## Costs and failure

If the Worker is down or the URL is wrong, the planner says the list would not
load and offers a retry; everything else — saving here, build codes, links —
keeps working, because none of it goes through here.
