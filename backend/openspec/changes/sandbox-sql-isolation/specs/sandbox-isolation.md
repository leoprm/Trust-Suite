# Spec: Sandbox SQL Isolation

## SQL Query Endpoint

### POST /api/trees/:treeId/sandbox/query

**Auth:** JWT required. Caller must be tree member.

**Request body:**
```json
{
  "sql": "SELECT name, level FROM WorkerSkill WHERE level > 5"
}
```

**Behavior:**
1. Validate JWT — user must be member of `:treeId`
2. Parse SQL — only `SELECT` statements allowed (reject INSERT/UPDATE/DELETE/DROP/ALTER/CREATE)
3. Auto-inject `WHERE treeId = ':treeId'` into the WHERE clause:
   - If query has existing WHERE: append `AND treeId = ':treeId'`
   - If query has no WHERE: append `WHERE treeId = ':treeId'`
4. Execute against MySQL with read-only credentials
5. Return JSON array of rows

**Rate limit:** 10 queries per minute per tree

**Response:**
```json
{
  "rows": [{"name": "python", "level": 8}, ...],
  "count": 5
}
```

### iptables Rule

Script `/home/trustmaker/scripts/isolate-sandbox.sh`:
- Blocks outbound TCP to 127.0.0.1:3306 and ::1:3306 for user `trustmaker`
- Idempotent (checks if rule exists before adding)
- Called on backend startup

### System Prompt Update

In `hermesBridge.ts` `buildTreeSystemPrompt()`:
- Add explicit prohibition: "NUNCA uses mysql, mysqldump, ni ningún cliente MySQL directamente."
- Add: "Para consultas SQL, usa exclusivamente POST /api/trees/:treeId/sandbox/query"
- Add pitfall note: "Intentar acceder a MySQL directamente es una violación de seguridad cross-tree."
