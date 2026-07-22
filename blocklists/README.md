# Blocklists

The extension fetches these public lists from the default branch and caches the last complete successful refresh.

- `keywords.txt`: high-confidence adult-solicitation phrases. A match adds enough detector score to hide the post and queue its author for X's native Block flow. The popup also includes these terms when syncing X muted words.
- `accounts.txt`: confirmed spam-author handles. Exact handle matches are immediate block candidates.
- `protected-accounts.txt`: owner-reviewed accounts that community aggregation must never add.

Format rules:

- One entry per line.
- Empty lines and lines beginning with `#` are ignored.
- Account entries may be `@handle`, bare handles, or full `x.com`/`twitter.com` profile URLs.
- Keep keyword entries specific. Broad words create false positives for every extension user.
