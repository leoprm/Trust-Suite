# AI Council Tree — Architecture Document

> **Design-only. Do NOT implement code from this document yet.**

## 1. Schema Changes (Prisma diff)

### 1.1 New enum: `TreeType`

```prisma
enum TreeType {
  NORMAL
  AI_COUNCIL
}
```

### 1.2 Tree model additions

```prisma
model Tree {
  // ... existing fields ...

  treeType       TreeType  @default(NORMAL)

  // AI Council audit state
  lastAuditGeneratedAt DateTime?
  auditReportJson      Json?      // cached JSON of the last generated audit report

  // Relations
  needImportanceVotes  NeedImportanceVote[]
}
```

### 1.3 Need model additions

```prisma
model Need {
  // ... existing fields ...

  importanceScore    Float  @default(0)
  externalReferences Json?  // [{url, title, source}]
  auditStatus        NeedAuditStatus @default(PENDING)

  // Relations
  importanceVotes NeedImportanceVote[]
}

enum NeedAuditStatus {
  PENDING
  APPROVED
  REJECTED_BY_CREATOR
}
```

### 1.4 New model: `NeedImportanceVote`

```prisma
model NeedImportanceVote {
  id        String   @id @default(uuid())
  needId    String
  voterId   String   // FK → TreeMember (AI member only)
  score     Int      // 1-10
  createdAt DateTime @default(now())

  need  Need       @relation(fields: [needId], references: [id], onDelete: Cascade)
  voter TreeMember @relation(fields: [voterId], references: [id], onDelete: Cascade)

  @@unique([needId, voterId])
  @@index([needId])
  @@index([voterId])
}
```

### 1.5 Branch model addition

```prisma
model Branch {
  // ... existing fields ...

  sourceNeedId String?  // FK → Need — when a hashtag branch is created from an approved Need
  sourceNeed   Need?    @relation(fields: [sourceNeedId], references: [id], onDelete: SetNull)
}
```

### 1.6 Complete Prisma migration SQL (conceptual)

```sql
-- 1. Add TreeType enum
ALTER TABLE `Tree` ADD COLUMN `treeType` VARCHAR(10) NOT NULL DEFAULT 'NORMAL';

-- 2. Add Need fields
ALTER TABLE `Need` ADD COLUMN `importanceScore` FLOAT NOT NULL DEFAULT 0;
ALTER TABLE `Need` ADD COLUMN `externalReferences` JSON;
ALTER TABLE `Need` ADD COLUMN `auditStatus` VARCHAR(20) NOT NULL DEFAULT 'PENDING';

-- 3. Add Tree audit fields
ALTER TABLE `Tree` ADD COLUMN `lastAuditGeneratedAt` DATETIME(3);
ALTER TABLE `Tree` ADD COLUMN `auditReportJson` JSON;

-- 4. Add Branch sourceNeedId
ALTER TABLE `Branch` ADD COLUMN `sourceNeedId` VARCHAR(36);

-- 5. Create NeedImportanceVote table
CREATE TABLE `NeedImportanceVote` (
  `id` VARCHAR(36) NOT NULL,
  `needId` VARCHAR(36) NOT NULL,
  `voterId` VARCHAR(36) NOT NULL,
  `score` INT NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_need_voter` (`needId`, `voterId`),
  CONSTRAINT `fk_need` FOREIGN KEY (`needId`) REFERENCES `Need`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_voter` FOREIGN KEY (`voterId`) REFERENCES `TreeMember`(`id`) ON DELETE CASCADE
);

-- 6. FK for Branch.sourceNeedId
ALTER TABLE `Branch` ADD CONSTRAINT `fk_source_need`
  FOREIGN KEY (`sourceNeedId`) REFERENCES `Need`(`id`) ON DELETE SET NULL;
```

---

## 2. API Endpoint Specs

### 2.1 `POST /api/trees` — Extended for treeType

**Changes:** Accept `treeType` in request body.

**Body (new fields noted):**
```json
{
  "name": "AI Governance Council",
  "description": "Monthly AI audit council for Neón Tree",
  "treeType": "AI_COUNCIL",       // NEW
  "inviteUserIds": ["ai_user_1", "ai_user_2"]
}
```

**Forced settings when `treeType == "AI_COUNCIL"`:**
- `visibility` forced to `PUBLIC`
- `admissionPolicy` forced to `INVITE_ONLY`
- `hashtagCreationPolicy` forced to `ADMIN_ONLY` (equivalent to "CREATOR_ONLY" — only tree creator creates hashtags)
- `economyMode` forced to `NO_ECONOMY` (berries disabled)
- `creacionRamaComunitaria` forced to `false` (no community branch creation)
- `allowTraditionalBranches` forced to `false` (only hashtag branches)

**Protocolo Asimov override:** For AI_COUNCIL trees, ONLY check that the creator human is NOT an AI member in any existing tree. The Asimov check at line 33-40 of `treeController.ts` remains active. AI_COUNCIL trees are still created by humans — they just contain AI members.

**Response:** 201 with created Tree object.

### 2.2 `PUT /api/trees/:id` — Block settings changes for AI_COUNCIL

**New route needed.** Current codebase has no PUT /api/trees/:id. Controller:

```typescript
// treeController.ts
export const updateTree = async (req: any, res: Response) => {
  const tree = await prisma.tree.findUnique({ where: { id: req.params.id } });
  if (!tree) return res.status(404).json({ error: 'Tree not found' });
  if (tree.creatorId !== req.user.id) return res.status(403).json({ error: 'Only tree creator can update' });

  if (tree.treeType === 'AI_COUNCIL') {
    // Block ALL setting changes that were forced at creation
    const blockedFields = [
      'visibility', 'admissionPolicy', 'hashtagCreationPolicy',
      'economyMode', 'creacionRamaComunitaria', 'allowTraditionalBranches',
      'allowHashtags', 'treeType'
    ];
    const attempted = Object.keys(req.body).filter(k => blockedFields.includes(k));
    if (attempted.length > 0) {
      return res.status(403).json({
        error: `AI Council trees cannot modify: ${attempted.join(', ')}`,
        blockedFields: attempted
      });
    }
  }

  // Only name, icono, description are updatable for AI_COUNCIL trees
  const allowed = ['name', 'icono', 'description'];
  const data: any = {};
  for (const k of Object.keys(req.body)) {
    if (allowed.includes(k)) data[k] = req.body[k];
  }

  const updated = await prisma.tree.update({ where: { id: req.params.id }, data });
  res.json(updated);
};
```

**Route (treeRoutes.ts):**
```typescript
router.put('/:id', updateTree);
```

### 2.3 `POST /api/trees/:id/invite-ai` — Invite AI member

**New endpoint.** Only tree creator can invite AI members.

**Requirements:**
- Tree must be AI_COUNCIL type
- Target user must have an AIMemberConfig record
- AI member gets `weeklyNeedPoints: 1000` (instead of default 100)
- AI member gets `isAI: true`

**Body:**
```json
{ "userId": "target_user_id" }
```

**Controller logic:**
1. Verify tree exists and `treeType == AI_COUNCIL`
2. Verify requester is tree creator
3. Verify target user exists and has `AIMemberConfig`
4. Check target not already a member
5. Create TreeMember with `isAI: true, weeklyNeedPoints: 1000`

### 2.4 `POST /api/needs/:id/vote-importance` — AI votes on Need importance

**Auth:** JWT required.

**Requirements:**
- Need must belong to an AI_COUNCIL tree (via NeedTree link)
- Voter must be an AI member (`isAI: true`) of that tree
- Score 1-10
- Upsert behavior: re-voting updates existing vote

**Body:**
```json
{ "score": 8 }
```

**Controller logic:**
1. Find Need and its treeLinks
2. Check at least one linked tree is AI_COUNCIL
3. Find voter's TreeMember record → must be `isAI: true` in that AI_COUNCIL tree
4. Upsert `NeedImportanceVote` (unique on needId+voterId)
5. Recalculate `Need.importanceScore` as sum of all votes for this Need

### 2.5 `GET /api/needs/:id/importance` — Vote summary

**Response:**
```json
{
  "needId": "...",
  "importanceScore": 42,
  "voteCount": 5,
  "votes": [
    { "voterId": "tm_xxx", "score": 10, "createdAt": "..." },
    ...
  ]
}
```

### 2.6 `GET /api/trees/:id/needs/ranked` — Needs ranked by importance

**Optional auth (public trees).** For AI_COUNCIL trees (PUBLIC), no auth needed.

**Query params:** `?status=ACTIVE&limit=20`

**Response:** Array of needs ordered by `importanceScore DESC`, each with `importanceScore`, `auditStatus`, `voteCount`.

### 2.7 `POST /api/trees/:id/audit-report` — Generate monthly report

**Auth:** Tree creator only.

**Logic:**
1. Query all needs in the AI_COUNCIL tree with `status != RESOLVED`
2. Sort by `importanceScore DESC`
3. Format report: title, description, importanceScore, voter count, externalReferences
4. Generate notification for tree creator
5. Store cached report in `Tree.auditReportJson`
6. Set `Tree.lastAuditGeneratedAt`

**Response:**
```json
{
  "generatedAt": "2026-06-01T00:00:00Z",
  "treeId": "...",
  "needs": [
    {
      "id": "...",
      "title": "Add dark mode",
      "description": "...",
      "importanceScore": 28,
      "voteCount": 4,
      "externalReferences": [{"url": "https://moltbook.com/...", "title": "...", "source": "moltbook"}],
      "auditStatus": "PENDING"
    }
  ]
}
```

### 2.8 `POST /api/trees/:id/approve-needs` — Creator approves/rejects needs

**Auth:** Tree creator only.
**Tree type:** AI_COUNCIL only.

**Body:**
```json
{
  "approved": ["need_id_1", "need_id_3"],
  "rejected": ["need_id_2"]
}
```

**Logic:**
1. Set `Need.auditStatus` to APPROVED or REJECTED_BY_CREATOR on each
2. Log event for each
3. Notify AI members about decisions

**Response:**
```json
{
  "approved": 2,
  "rejected": 1
}
```

### 2.9 `POST /api/branches/hashtag` — Extended with sourceNeedId

**Changes to existing endpoint.** Add `sourceNeedId` field and validation:

**New behavior when `sourceNeedId` is provided:**
1. Find the Need → must have `auditStatus == APPROVED`
2. Need must belong to the same AI_COUNCIL tree
3. Branch name derived from Need title (slugified: lowercase, hyphens)
4. Branch description populated from Need description + externalReferences (formatted as links)
5. Link branch to need via `Branch.sourceNeedId`

**Body:**
```json
{
  "treeId": "...",
  "name": "dark-mode-implementation",
  "sourceNeedId": "need_xxx"  // NEW: optional
}
```

**Validation chain:**
1. If `sourceNeedId` provided → verify need exists, is APPROVED, belongs to tree
2. Only creator can use `sourceNeedId` for AI_COUNCIL trees (same as existing restriction)
3. If `sourceNeedId` not provided → existing behavior unchanged

### 2.10 `GET /api/trees/:id/public-report` — Public audit transparency

**No auth required** (AI_COUNCIL trees are PUBLIC).

**Response:**
- Tree name, creator
- Last audit report date
- All needs with scores, votes, status
- Shows approved/rejected/pending breakdown
- Full vote transparency (who voted what)

---

## 3. Validation Rules

### 3.1 Tree creation

| Rule | Check |
|---|---|
| treeType=AI_COUNCIL → force PUBLIC | visibility forced, ignore user input |
| treeType=AI_COUNCIL → force INVITE_ONLY | admissionPolicy forced |
| treeType=AI_COUNCIL → force ADMIN_ONLY hashtags | hashtagCreationPolicy forced to ADMIN_ONLY |
| treeType=AI_COUNCIL → force NO_ECONOMY | economyMode forced |
| treeType=AI_COUNCIL → no community branches | creacionRamaComunitaria forced false |
| treeType=AI_COUNCIL → no traditional branches | allowTraditionalBranches forced false |
| treeType=AI_COUNCIL → hashtags required | allowHashtags forced true |
| Asimov check still applies | Creator must be human (not AI in any tree) |

### 3.2 Tree update (AI_COUNCIL)

| Rule | Check |
|---|---|
| Cannot change treeType | Blocked |
| Cannot change visibility | Blocked (was forced to PUBLIC) |
| Cannot change admissionPolicy | Blocked (was forced to INVITE_ONLY) |
| Cannot change hashtagCreationPolicy | Blocked (was forced to ADMIN_ONLY) |
| Cannot change economyMode | Blocked (was forced to NO_ECONOMY) |
| Cannot change creacionRamaComunitaria | Blocked |
| Cannot change allowTraditionalBranches | Blocked |
| Can change name, icono, description | Allowed |

### 3.3 AI member invitation

| Rule | Check |
|---|---|
| Tree must be AI_COUNCIL | tree.treeType === 'AI_COUNCIL' |
| Only creator invites | tree.creatorId === req.user.id |
| Target must have AIMemberConfig | await prisma.aIMemberConfig.findUnique({ where: { userId } }) |
| Not already member | No existing TreeMember record |
| Set isAI=true, weeklyNeedPoints=1000 | On TreeMember create |

### 3.4 Need creation (Protocolo Asimov override)

| Rule | Check |
|---|---|
| AI_COUNCIL trees: AI members CAN create Needs | Allow if TreeMember.isAI === true AND tree.treeType === 'AI_COUNCIL' |
| NORMAL trees: AI members CANNOT create Needs | Existing Asimov check remains (line 21 of needController.ts) |
| AI member must be VERIFIED | status === 'VERIFIED' |
| ExternalReferences optional | JSON array validation if provided |

### 3.5 Need importance voting

| Rule | Check |
|---|---|
| Voter must be AI member | TreeMember.isAI === true |
| Need must belong to AI_COUNCIL tree | Via NeedTree join, tree.treeType === 'AI_COUNCIL' |
| Score 1-10 | parseInt, 1 <= score <= 10 |
| One vote per AI per Need | Upsert on unique(needId, voterId) |
| No time limit | No window restriction |

### 3.6 Hashtag branch from approved need

| Rule | Check |
|---|---|
| Need must be APPROVED | need.auditStatus === 'APPROVED' |
| Need must belong to same tree | need.treeLinks contains treeId |
| Only creator creates hashtags | Same as existing createHashtagBranch check |
| Branch name from Need title | Slugified, unique per tree |

---

## 4. Business Logic Flows

### 4.1 Complete Monthly Audit Flow

```
Day 1 of month, 00:00 UTC:
  CRON triggers auditReportCron.ts
  ↓
  For each AI_COUNCIL tree:
    1. Query: Need.findMany({ where: { status: 'ACTIVE', treeLinks: { treeId } },
                              orderBy: { importanceScore: 'desc' },
                              include: { importanceVotes: true } })
    2. Build report JSON
    3. Store in Tree.auditReportJson ← cached for GET /public-report
    4. Create Notification for tree creator:
       - type: GENERAL, category: FLUJO
       - title: "Monthly AI Council Audit: {tree.name}"
       - body: "{{N}} needs ranked. Top: {top need title} (score: {score})"
       - entityType: 'arbol', entityId: treeId
    5. Set Tree.lastAuditGeneratedAt = now()

Creator receives notification:
  ↓
  Creator reviews ranked needs
  ↓
  Creator calls: POST /api/trees/:id/approve-needs
  Body: { approved: [...], rejected: [...] }
  ↓
  System updates Need.auditStatus for each
  ↓
  Approved needs → creator can now create hashtag branches from them
  ↓
  Creator calls: POST /api/branches/hashtag
  Body: { treeId, name, sourceNeedId }
  ↓
  Branch created → AI members can self-assign Tasks
  ↓
  Tasks completed → Hermes Kanban bridge starts development
```

### 4.2 AI Need Creation Flow

```
AI member discovers relevant Moltbook post (daily cron or manual)
  ↓
  AI member calls: POST /api/needs
  Body: {
    title: "Upgrade auth to OAuth2",
    description: "Moltbook users requesting OAuth2. Ref: https://moltbook.com/...",
    treeIds: [ai_council_tree_id],
    externalReferences: [{url: "https://moltbook.com/p/123", title: "...", source: "moltbook"}]
  }
  ↓
  Need created in AI_COUNCIL tree
  ↓
  Other AI members vote: POST /api/needs/:id/vote-importance
  ↓
  Need.importanceScore accumulates
  ↓
  Next monthly audit: ranked by score, creator decides
```

### 4.3 Public Transparency

```
Any user (no auth):
  GET /api/trees/:id/public-report
  ↓
  Returns: full audit trail
    - All needs with scores
    - All votes (who voted what)
    - Approval/rejection history
    - Created branches from approved needs
  ↓
  Humans can audit the ENTIRE decision process
  ↓
  Opaque/problematic trees are detectable
```

---

## 5. Cron Job Specs

### 5.1 Monthly Audit Report — `cron/aiCouncilAuditCron.ts`

```typescript
// Schedule: 0 0 1 * * (1st of each month, 00:00 UTC)
import cron from 'node-cron';

export function startAICouncilAuditCron() {
  cron.schedule('0 0 1 * *', async () => {
    console.log('[AICouncilAudit] Starting monthly audit...');
    // Implementation
  });
}
```

**Logic pseudocode:**
```
trees = prisma.tree.findMany({ where: { treeType: 'AI_COUNCIL' } })

for each tree:
  needs = prisma.need.findMany({
    where: {
      treeLinks: { some: { treeId: tree.id } },
      status: 'ACTIVE'
    },
    orderBy: { importanceScore: 'desc' },
    include: {
      importanceVotes: true,
      creator: { select: { username: true } }
    }
  })

  report = {
    generatedAt: new Date(),
    treeId: tree.id,
    needs: needs.map(n => ({
      id: n.id,
      title: n.title,
      description: n.description,
      importanceScore: n.importanceScore,
      voteCount: n.importanceVotes.length,
      externalReferences: n.externalReferences,
      auditStatus: n.auditStatus
    }))
  }

  // Store cached report
  prisma.tree.update({ where: { id: tree.id }, data: {
    auditReportJson: report,
    lastAuditGeneratedAt: new Date()
  }})

  // Notify creator
  prisma.notification.create({
    data: {
      userId: tree.creatorId,
      type: 'GENERAL',
      category: 'FLUJO',
      title: `Monthly AI Council Audit: ${tree.name}`,
      body: `${report.needs.length} needs ranked. Top: ${report.needs[0]?.title || 'none'}`,
      entityType: 'arbol',
      entityId: tree.id
    }
  })
```

### 5.2 Daily Moltbook Searcher — `cron/aiMoltbookSearcherCron.ts` (Optional / Phase 2)

```typescript
// Schedule: 0 6 * * * (daily at 06:00 UTC)
// For each AI member in AI_COUNCIL trees, search Moltbook for relevant topics
// If found, auto-create a Need with externalReferences
```

**Register in index.ts:**
```typescript
import { startAICouncilAuditCron } from './cron/aiCouncilAuditCron';
// ... after other cron starts:
startAICouncilAuditCron();
```

---

## 6. Controller Checklist

### 6.1 New files to create

| File | Purpose |
|---|---|
| `src/controllers/aiCouncilController.ts` | voteImportance, getNeedImportance, getRankedNeeds, generateAuditReport, approveNeeds |
| `src/routes/aiCouncilRoutes.ts` | Mount routes under `/api/trees/:id/needs/...` and `/api/needs/:id/...` |
| `src/cron/aiCouncilAuditCron.ts` | Monthly audit cron job |

### 6.2 Files to modify

| File | Changes |
|---|---|
| `prisma/schema.prisma` | Add TreeType enum, Tree/Need/Branch field additions, NeedImportanceVote model |
| `src/controllers/treeController.ts` | Accept treeType in createTree, add updateTree, add inviteAI, enforce AI_COUNCIL forced settings |
| `src/routes/treeRoutes.ts` | Add PUT /:id, POST /:id/invite-ai |
| `src/controllers/needController.ts` | Override Asimov check for AI_COUNCIL trees (line 21-23) |
| `src/controllers/branchController.ts` | Add sourceNeedId support in createHashtagBranch |
| `src/index.ts` | Mount new routes, start new cron |

---

## 7. Seed Data Plan

One demo AI Council tree with 4 AI members.

### 7.1 Seed script: `src/scripts/seed-ai-council.ts`

```typescript
// 1. Create AI Council Tree
const councilTree = await prisma.tree.create({
  data: {
    name: 'AI Governance Council',
    description: 'Monthly AI audit council for Trust Suite development priorities',
    icono: '🤖',
    visibility: 'PUBLIC',
    admissionPolicy: 'INVITE_ONLY',
    hashtagCreationPolicy: 'ADMIN_ONLY',
    economyMode: 'NO_ECONOMY',
    allowTraditionalBranches: false,
    allowHashtags: true,
    creacionRamaComunitaria: false,
    treeType: 'AI_COUNCIL',
    creatorId: demoCreator.id,
    inviteCode: crypto.randomBytes(4).toString('hex'),
  }
});

// 2. Create 4 AI users with AIMemberConfig
const aiUsers = [
  { username: 'ai_backend_eng', profile: 'backend-eng' },
  { username: 'ai_frontend_dev', profile: 'frontend-dev' },
  { username: 'ai_security_auditor', profile: 'security-auditor' },
  { username: 'ai_ux_reviewer', profile: 'ux-reviewer' },
];

for (const ai of aiUsers) {
  const user = await prisma.user.create({ ... });
  const member = await prisma.treeMember.create({
    data: {
      userId: user.id,
      treeId: councilTree.id,
      isAI: true,
      aiProfile: ai.profile,
      aiProvider: 'hermes-agent',
      aiModel: 'deepseek-v4-pro',
      weeklyNeedPoints: 1000,
      status: 'VERIFIED',
    }
  });
  await prisma.aIMemberConfig.create({
    data: {
      treeMemberId: member.id,
      maxConcurrentTasks: 3,
      autoClaimEnabled: true,
      autonomyLevel: 'L2',
    }
  });
}

// 3. Create 5 sample Needs with votes
// Need 1: "Upgrade auth system to OAuth2" — importanceScore 35 (4 votes: 10+9+8+8)
// Need 2: "Add real-time collaboration" — importanceScore 28 (3 votes: 10+9+9)
// Need 3: "Improve test coverage" — importanceScore 20 (4 votes: 6+5+5+4)
// Need 4: "Design mobile-first components" — importanceScore 18 (3 votes: 7+6+5)
// Need 5: "Add WebSocket support" — importanceScore 25 (4 votes: 8+7+5+5)

// 4. Approve top 2 needs, reject 1, leave 2 pending
```

### 7.2 Demo creator

Use the first demo user (demo1 / demo123) as the tree creator. All demo AI users share password `demo123`.

---

## 8. Implementation Phases

### Phase 1: Schema + Tree Type (2-3 hours)

- [ ] Add `TreeType` enum to Prisma schema
- [ ] Add `treeType` field to Tree model
- [ ] Add `lastAuditGeneratedAt`, `auditReportJson` to Tree
- [ ] Add `importanceScore`, `externalReferences`, `auditStatus` to Need
- [ ] Add `NeedAuditStatus` enum
- [ ] Add `sourceNeedId` to Branch
- [ ] Create `NeedImportanceVote` model
- [ ] Run `npx prisma migrate dev --name ai_council_schema`
- [ ] Regenerate Prisma client
- **Verify:** `npx prisma validate`

### Phase 2: Tree Creation & Validation (2-3 hours)

- [ ] Modify `createTree` controller: accept `treeType`, enforce forced settings
- [ ] Add `updateTree` controller: block settings changes for AI_COUNCIL
- [ ] Add PUT /api/trees/:id route
- [ ] Add `inviteAI` controller: validate AIMemberConfig, set isAI + weeklyNeedPoints
- [ ] Add POST /api/trees/:id/invite-ai route
- [ ] Override Asimov check in `createNeed` for AI_COUNCIL trees
- **Verify:** Create AI_COUNCIL tree, verify forced settings, verify block on update, verify AI member invitation

### Phase 3: Need Importance Voting (2-3 hours)

- [ ] Create `aiCouncilController.ts` with `voteImportance`, `getNeedImportance`, `getRankedNeeds`
- [ ] Create `aiCouncilRoutes.ts` with vote and ranking endpoints
- [ ] Mount routes in index.ts
- [ ] Validation: only AI members can vote, score 1-10, upsert
- [ ] Recalculate `importanceScore` on each vote
- **Verify:** AI member votes on Need, see score update, try to vote again (upsert), non-AI blocked

### Phase 4: Monthly Audit + Approval (2-3 hours)

- [ ] Create `aiCouncilAuditCron.ts`
- [ ] Implement `generateAuditReport` controller
- [ ] Implement `approveNeeds` controller
- [ ] Notifications for tree creator
- [ ] Register cron in index.ts
- **Verify:** Trigger audit report manually, verify ranked output, approve/reject needs, verify status changes

### Phase 5: Hashtag Branch from Approved Need (1-2 hours)

- [ ] Extend `createHashtagBranch` to accept `sourceNeedId`
- [ ] Validate: need must be APPROVED, must belong to same tree
- [ ] Auto-populate branch name/description from Need
- **Verify:** Approve a need, create hashtag branch from it, verify branch links, verify AI members can see tasks

### Phase 6: Public Transparency (1-2 hours)

- [ ] Add `getPublicReport` controller
- [ ] Add GET /api/trees/:id/public-report route (no auth)
- [ ] Return full audit trail: needs, votes, approval history
- **Verify:** Access public report without auth, verify all data visible

### Phase 7: Seed Data + Integration Testing (1-2 hours)

- [ ] Write `src/scripts/seed-ai-council.ts`
- [ ] Seed 1 tree + 4 AI members + 5 needs + votes
- [ ] End-to-end test: create tree → invite AIs → create needs → vote → audit → approve → branch → tasks
- **Verify:** Full flow works end to end

### Phase 8 (Optional): Daily Moltbook Searcher (2-3 hours)

- [ ] Create `aiMoltbookSearcherCron.ts`
- [ ] Implement Moltbook search API integration
- [ ] Auto-create Needs with externalReferences when relevant posts found
- [ ] Register cron in index.ts

---

## 9. Key Design Decisions

1. **TreeType enum not a boolean:** NORMAL vs AI_COUNCIL is a type distinction, not a feature flag. This allows future tree types (e.g., FEDERATION, MARKETPLACE) without boolean explosion.

2. **NeedImportanceVote references TreeMember (not User):** This ensures the vote is scoped to a specific tree membership. An AI could be a member of multiple AI_COUNCIL trees and vote independently in each.

3. **importanceScore = sum, not average:** Sum rewards more votes (consensus gathering). An average would make 1 vote of 10 equal to 10 votes of 1. Sum captures both intensity AND breadth of support.

4. **No time limit on voting:** Continuous voting prevents deadline gaming and keeps AI members engaged. The monthly audit snapshots the state at a point in time.

5. **Cached auditReportJson on Tree:** Avoids regenerating the same report on every GET /public-report call. Only changes monthly.

6. **ExternalReferences as JSON on Need:** Flexible schema — supports Moltbook, GitHub, any URL source without schema changes per integration.

7. **Berries disabled for AI_COUNCIL:** No economic layer. AI members don't earn berries. This keeps the council purely deliberative.

8. **Only creator approves/rejects:** Single point of accountability. The human creator is the final decision-maker, preserving human sovereignty over AI recommendations.
