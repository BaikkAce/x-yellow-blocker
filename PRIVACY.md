# Privacy Policy for X Yellow Blocker

Last updated: July 23, 2026

X Yellow Blocker is a browser extension that identifies likely adult-solicitation spam on X and can use X's visible interface to hide content, block accounts, and add muted words.

## Data processed locally

While the extension is enabled on X, it processes the visible account handle, display name, post text, link destinations, reply context, and X sensitive-content labels needed to evaluate posts. This processing occurs locally in the browser. Post text, display names, link destinations, and browsing history are not sent to the developer or retained by the extension.

The extension stores settings, statistics, protected handles, successfully blocked handles, remote-list cache data, and muted-word synchronization progress in `chrome.storage.local` on the user's device.

## Remote blocklists

The extension downloads public keyword and account blocklists over HTTPS from the `BaikkAce/x-yellow-blocker` GitHub repository. GitHub may receive ordinary network metadata such as the request IP address and user agent under GitHub's own privacy policy. The extension does not attach X page content or a persistent extension identifier to these requests.

## Optional community contributions

Community sharing is disabled by default and requires the user to enable it. After X confirms a block, the extension sends only the normalized X `@handle` together with an anonymous, per-install client identifier to a Cloudflare Worker over HTTPS. It does not transmit post text, display name, profile data, URLs, images, or browsing history.

A single such report immediately publishes the handle to the public GitHub shared blocklist. Any user may dispute a shared handle from the extension popup; three independent disputes from distinct clients remove the handle from the shared list (self-healing), after which two independent re-reports are required to re-add it. The resulting public blocklist entries reside in the GitHub repository and are processed under GitHub's privacy policy.

## Use, sharing, and retention

Data is used only to provide the extension's spam detection, blocking, muted-word synchronization, settings, and optional shared-blocklist features. It is not sold, used for advertising, or used for credit, insurance, employment, or lending decisions.

Local data remains in the browser until the user clears extension data or removes the extension. Anonymous handle reports are aggregated by the Cloudflare Worker and published to the public GitHub shared blocklist; those entries remain in the repository history unless removed after a correction request.

## User control

Users can keep community sharing disabled, clear extension data through Chrome, add false positives to the local whitelist, and dispute any shared handle directly from the popup (which triggers the self-healing removal once enough independent disputes accumulate). Requests to remove a public shared-list entry can also be filed in the GitHub repository.

## Security and limited use

All remote communication initiated by the extension uses HTTPS. The extension does not contain a GitHub write token, does not execute remotely hosted code, and requests only permissions needed for its user-facing functions.

The use of information received from Chrome APIs adheres to the Chrome Web Store User Data Policy, including the Limited Use requirements.

## Contact

Privacy and correction requests: <https://github.com/BaikkAce/x-yellow-blocker/issues>
