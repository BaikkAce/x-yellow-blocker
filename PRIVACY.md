# Privacy Policy for X Yellow Blocker

Last updated: August 3, 2026

X Yellow Blocker identifies likely adult-solicitation spam in replies under an opened X post. It can locally hide matching replies, use X's visible interface to block their authors, and add muted words at the user's request.

## Local processing

The extension locally processes visible handles, display names, reply text, links, reply context, avatars, and X sensitive-content labels needed for detection. It stores settings, statistics, successfully blocked handles, limited public profile details for locally blocked accounts, diagnostic events, remote-rule cache data, and muted-word synchronization progress in `chrome.storage.local`.

The extension does not read direct messages, cookies, passwords, browsing history, or unrelated page content.

## Remote recognition data

The extension downloads two public inert-data files over HTTPS from `BaikkAce/x-yellow-blocker`:

- `blocklists/keywords.txt`
- `blocklists/lure-samples.json`

These files contain keywords and sanitized language examples only. They do not contain account blocklists and cannot provide JavaScript, HTML, regular expressions, WebAssembly, selectors, thresholds, or executable code. GitHub may receive ordinary request metadata under GitHub's privacy policy.

## No account sharing or uploads

Version 0.12.0 does not upload blocked accounts, handles, display names, avatars, reply text, browsing activity, cookies, installation identifiers, or diagnostic logs. It does not call the former community-reporting Worker.

## User control and retention

Local data remains until the user clears extension data or removes the extension. Users can disable detection, disable automatic blocking, add local whitelist entries, remove locally recorded blocked handles, clear statistics, and clear diagnostic logs.

No personal data is sold, used for advertising, or used for credit, insurance, employment, or lending decisions.

## Security and limited use

All remote communication initiated by the extension uses HTTPS. The extension contains no GitHub write token and does not execute remotely hosted code. Use of Chrome API information follows the Chrome Web Store User Data Policy, including Limited Use requirements.

Contact: <https://github.com/BaikkAce/x-yellow-blocker/issues>
