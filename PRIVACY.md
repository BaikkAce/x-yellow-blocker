# Privacy Policy for X Yellow Blocker

Last updated: July 23, 2026

X Yellow Blocker is a browser extension that identifies likely adult-solicitation spam on X and can use X's visible interface to hide content, block accounts, and add muted words.

## Data processed locally

While the extension is enabled on X, it processes the visible account handle, display name, post text, link destinations, reply context, and X sensitive-content labels needed to evaluate posts. This processing occurs locally in the browser. Post text, display names, link destinations, and browsing history are not sent to the developer or retained by the extension.

The extension stores settings, statistics, protected handles, successfully blocked handles, remote-list cache data, and muted-word synchronization progress in `chrome.storage.local` on the user's device.

## Remote blocklists

The extension downloads public keyword and account blocklists over HTTPS from the `BaikkAce/x-yellow-blocker` GitHub repository. GitHub may receive ordinary network metadata such as the request IP address and user agent under GitHub's own privacy policy. The extension does not attach X page content or a persistent extension identifier to these requests.

## Optional community contributions

Community sharing is disabled by default and requires the user to enable it. After X confirms a block, the extension can place only the normalized X `@handle` in a local pending queue. It does not queue the post text, display name, profile data, URL, or browsing history.

When the user clicks **Submit to GitHub**, the extension copies a batch of pending X handles to the clipboard and opens a public GitHub Issue form. The handles are not placed in URL query parameters. The user must paste, review, and submit the report while signed in to GitHub. The resulting Issue, reported handles, and GitHub contributor identity are public and are processed under GitHub's privacy policy.

## Use, sharing, and retention

Data is used only to provide the extension's spam detection, blocking, muted-word synchronization, settings, and optional shared-blocklist features. It is not sold, used for advertising, or used for credit, insurance, employment, or lending decisions.

Local data remains in the browser until the user clears extension data or removes the extension. Public GitHub reports and shared blocklist entries remain in the repository history unless removed by the repository owner after a correction request.

## User control

Users can keep community sharing disabled, clear extension data through Chrome, remove pending reports by removing the extension data, and add false positives to the local whitelist. Requests to remove a public shared-list entry can be filed in the GitHub repository.

## Security and limited use

All remote communication initiated by the extension uses HTTPS. The extension does not contain a GitHub write token, does not execute remotely hosted code, and requests only permissions needed for its user-facing functions.

The use of information received from Chrome APIs adheres to the Chrome Web Store User Data Policy, including the Limited Use requirements.

## Contact

Privacy and correction requests: <https://github.com/BaikkAce/x-yellow-blocker/issues>
