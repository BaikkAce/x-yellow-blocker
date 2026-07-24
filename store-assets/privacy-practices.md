# Chrome Web Store Privacy Practices

## Single purpose

Identify adult-solicitation spam on X, hide matching content, and help users block the associated accounts through X's visible interface.

## Permission justifications

- `storage`: stores user settings, local statistics, protection lists, sync progress, remote-list cache, and opt-in pending community handles.
- `https://x.com/*`, `https://twitter.com/*`, mobile variants: reads visible post/account elements and operates X's visible block and muted-word interfaces.
- `https://raw.githubusercontent.com/*`: downloads the public keyword and account data files. It does not download executable code.
- `https://*.workers.dev/*`: sends anonymous community reports (only @handles + detection score) to a Cloudflare Worker for aggregation. No tweet text, images, or user identity are transmitted.

## Data declarations

- Website content: processed locally to detect spam; not transmitted or retained as post content.
- User identifiers: X handles are stored locally after successful blocks. When community sharing is enabled, blocked handles are automatically and anonymously reported to a Cloudflare Worker (no user identity, no tweet content) and immediately published to the public GitHub blocklist (1-person sync). Any user may dispute a shared handle; 3+ independent disputes remove it from the shared list (self-healing), after which 2 independent re-reports are required to re-add it.
- Web history: not collected.
- Authentication information: not collected.
- Personal communications: not collected or transmitted.

## Certifications

- Data is not sold or transferred for unrelated purposes.
- Data is not used for advertising, creditworthiness, lending, or other prohibited purposes.
- Human review is limited to public GitHub reports submitted by users for abuse prevention and list correction.
- All remote transmission uses HTTPS.
