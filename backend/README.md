# Retired community-reporting Worker

Starting with extension v0.11.0, account sharing and account-list synchronization are removed.

The Worker remains deployed only to give older extension versions an explicit response:

- `GET /api/health`: service status and `accountSharing: false`
- `GET /api/stats`: zero/deprecated compatibility response
- `/api/report` and `/api/dispute`: `410 Gone`

The Worker has no D1 binding, does not read GitHub, and does not need `GITHUB_TOKEN` or `GITHUB_REPO`.

The old `schema.sql` is retained only as an archive. Deploying this Worker does not delete the existing D1 database.
