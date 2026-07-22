# Spec: X Yellow Blocker

## Objective
Build a local Chrome/Chromium Manifest V3 extension that detects pornographic or adult-solicitation tweets/replies on X, hides or labels them, and can add high-confidence authors to the user's X block list through X's visible UI.

The first version optimizes for safety over recall:
- Detect explicit adult solicitation, contact bait, bio-link bait, adult platform mentions, and NSFW emoji templates.
- Detect adult-lure display names in replies even when the reply body is only short obfuscated letters or symbols.
- Detect reply-body adult descriptor lures that mention another account for traffic redirection.
- Never use `@handle` shape as a spam signal.
- Never auto-block followed or whitelisted users.
- Auto-block is enabled by default and uses X's visible Block menu, not a private API.

## Tech Stack
- Browser extension: Chrome/Chromium Manifest V3
- Runtime: plain JavaScript content scripts and popup scripts
- Storage: `chrome.storage.local`
- Tests: Node built-in `node:test`
- Dependencies: none

## Commands
- Test: `npm test`
- Syntax check: `npm run check`
- Package locally: `npm run package`

## Project Structure
- `manifest.json` -> extension manifest
- `src/defaults.js` -> shared default settings
- `src/detector.js` -> pure local scoring engine
- `src/content.js` -> X DOM scanner, UI marking, and block queue
- `src/mute-words.js` -> shared mute-word list and resumable sync state
- `src/remote-lists.js` -> public list parsing, account normalization, and remote fetch contract
- `src/background.js` -> GitHub list refresh and last-known-good cache
- `src/styles.css` -> in-page styling for hidden/flagged tweets
- `popup/` -> extension action popup
- `tests/` -> Node unit tests for detection logic
- `docs/` -> specification and notes

## Code Style
Use small functions and explicit data objects. Prefer readable rules over opaque clever regex bundles.

```js
const verdict = XybDetector.evaluateTweet(tweet, settings);
if (verdict.shouldHide) {
  markTweet(article, tweet, verdict);
}
```

## Testing Strategy
- Unit test all scoring behavior in `tests/detector.test.js`.
- Syntax-check extension scripts with `node --check`.
- Manual verification requires loading the unpacked extension and testing on `https://x.com`; this cannot be fully automated without a logged-in X session.

## Boundaries
- Always: use X's visible Block flow for blocking, store data locally, throttle block attempts.
- Ask first: adding AI providers, calling private X GraphQL APIs, publishing to a browser store.
- Never: collect telemetry, send tweets off-device by default, bypass X account safeguards, auto-block whitelisted/followed accounts.

## Success Criteria
- The detector flags clear Chinese and English adult-solicitation examples.
- The detector flags adult-lure reply display names such as same-city/date lures and vulgar euphemisms even when the body is low-information text.
- The detector flags adult descriptor reply spam such as repeated `骚/sao`, `第一骚`, offline adult goods, mature-teacher contrast lures, and profile masturbation lures when paired with an @ mention.
- Normal tweets and suspicious-looking handles without matching content do not trigger blocking.
- The extension scans dynamically loaded X tweets and reply/comment articles via `MutationObserver`.
- Detected authors enter a deduplicated X Block queue once they meet the recognition threshold.
- Block attempts use the visible X menu and confirmation dialog, with delay and failure tracking.
- The popup can sync the bundled high-confidence mute words through X's visible settings form without private APIs.
- Remote keyword and account lists are fetched by the extension service worker and cached atomically in `chrome.storage.local`.
- Community sharing is opt-in. After X confirms a block, the extension queues only the normalized `@handle` locally; it never uploads tweet text or browsing history.
- A user contribution copies a bounded handle batch to the clipboard and opens a public GitHub Issue form without putting handles in URL parameters. The user pastes and confirms while signed in to GitHub. No GitHub token is embedded in the extension.
- Repository automation counts each GitHub author once per handle. A handle needs reports from at least three distinct authors and must not be owner-protected before it is appended to the shared account list.
- Tests and syntax checks pass.

## Open Questions
- X UI strings/selectors change over time; live testing may require selector updates.
- The exact desired false-positive tolerance can be tuned by changing thresholds in the popup.
- Fully unattended anonymous uploads require a separately operated intake service. The GitHub-only design intentionally retains visible user consent and GitHub authentication.
