# Trust export v0.1

Trust Suite exposes a basic JSON export layer for portability and auditability.

## Endpoints

- `GET /api/exports/me/profile`
  - Authenticated.
  - Exports the authenticated user's own Profile / Trace data.
- `GET /api/exports/tree/:treeId`
  - Authenticated.
  - Requires global `ADMINISTRATOR`, Tree creator, or Tree member role `ADMIN`.
  - Exports basic Tree data.

Both endpoints return:

```json
{
  "exportType": "PROFILE",
  "schemaVersion": "trust-export-v0.1",
  "generatedAt": "2026-05-03T12:00:00.000Z",
  "generatedBy": {
    "userId": "user-id",
    "role": "PERSON"
  },
  "data": {},
  "warnings": [],
  "omitted": ["rawEvidenceFiles", "passwordHash", "tokens"]
}
```

## Included

Profile exports include user basics, Trace/public settings, privacy settings,
Tree memberships, XP/levels, skill XP, completed tasks, audits performed and
received, evidence metadata/checksums, and recent sanitized EventLogs.

Tree exports include Tree basics/settings/modules, member summaries, Needs,
Ideas, Branches, Tasks, audits, evidence metadata/checksums, fiat transaction
summaries, Berry summaries, bonus pools, privacy summary, and recent sanitized
EventLogs.

## Always omitted

Exports never include passwords, tokens, secrets, environment variables, absolute
filesystem paths, raw evidence files, raw receipts, or `storagePath`.

EventLog stores only export metadata and counts. It does not store the generated
JSON export payload.

## Future work

- Import pipeline.
- Optional raw evidence export under explicit permissions.
- Cryptographic signatures.
- Encrypted exports.
- Trust Maker compatibility.
- Full server-to-server portability.
