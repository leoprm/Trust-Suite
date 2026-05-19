# Design: Sandbox SQL Isolation

## Decision: iptables over MySQL user isolation

**Chosen:** iptables rule blocking port 3306
**Rejected:** Per-tree MySQL users with row-level security

**Why:** MySQL doesn't have native row-level security. Views with `WHERE treeId = ...` would require one view per tree — unscalable. iptables is one rule, zero MySQL config changes, instantly effective.

## Decision: WHERE injection over query allowlist

**Chosen:** Parse SQL, inject `WHERE treeId = :treeId`
**Rejected:** Pre-defined query templates only

**Why:** Templates are too rigid — trees have different schemas (WorkerSkill, SatisfactionScore, etc.). WHERE injection is flexible while guaranteeing isolation. SQL parsing is simple regex-based (extract existing WHERE clause position).

## Decision: Read-only MySQL credentials

**Chosen:** New MySQL user `trust_sandbox_ro` with SELECT-only grants
**Why:** Even if iptables fails or is bypassed, credentials available to the endpoint are read-only. Defense in depth.

## Architecture

```
Ari (Hermes Agent)
    │
    ├─ terminal: mysql → BLOCKED by iptables (127.0.0.1:3306 DROP)
    │
    └─ HTTP: POST /api/trees/:treeId/sandbox/query
           │
           ▼
        sandboxController.querySql()
           │
           ├─ Validate JWT + tree membership
           ├─ Parse SQL, reject non-SELECT
           ├─ Inject WHERE treeId = :treeId
           │
           ▼
        MySQL (trust_sandbox_ro@localhost)
           └─ SELECT-only grants
```

## Files to modify

| File | Change |
|------|--------|
| `src/controllers/sandboxController.ts` | Add `querySql` handler |
| `src/routes/sandboxRoutes.ts` | Add `POST /query` route |
| `src/bot/hermesBridge.ts` | Update system prompt |
| `src/index.ts` | Call isolate script on startup |
| `scripts/isolate-sandbox.sh` | New — iptables rule |
| `scripts/setup-sandbox-db-user.sql` | New — create trust_sandbox_ro |
