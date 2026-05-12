/**
 * Seed script — AI Council demo data
 * Run: node ./node_modules/tsx/dist/cli.js src/scripts/seed-ai-council.ts
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const prisma = new PrismaClient();

const uuid = () => crypto.randomUUID();

// Demo creator (demo1)
const CREATOR_ID = 'b7d4f038-a492-41d4-aa18-72545ad15bc3'; // Leo (leo@leo)
const HASHED_PASSWORD = '$2a$10$dummy'; // Will be created per-user

async function main() {
  console.log('🤖 Seeding AI Council demo data...\n');

  // Create password hash
  const passwordHash = await bcrypt.hash('demo123', 10);

  // Check if council tree already exists
  let councilTree = await prisma.tree.findFirst({
    where: { treeType: 'AI_COUNCIL' },
  });

  if (councilTree) {
    console.log(`   ⏭️  AI Council tree already exists: ${councilTree.id}`);
  } else {
  console.log('📋 Creating AI Council Tree...');
  councilTree = await prisma.tree.create({
    data: {
      name: 'AI Governance Council',
      description: 'Monthly AI audit council for Trust Suite development priorities. AI members discover community needs from Moltbook and other platforms, rank them by importance, and the human creator approves the top priorities for implementation.',
      icono: '🤖',
      visibility: 'PUBLIC',
      admissionPolicy: 'INVITE_ONLY',
      hashtagCreationPolicy: 'ADMIN_ONLY',
      economyMode: 'NO_ECONOMY',
      allowTraditionalBranches: false,
      allowHashtags: true,
      creacionRamaComunitaria: false,
      treeType: 'AI_COUNCIL',
      creatorId: CREATOR_ID,
      inviteCode: crypto.randomBytes(4).toString('hex'),
    },
  });
  console.log(`   Tree: ${councilTree.id} — "${councilTree.name}"`);

  // Add creator as member (idempotent)
  const existingCreator = await prisma.treeMember.findFirst({
    where: { userId: CREATOR_ID, treeId: councilTree.id },
  });
  if (!existingCreator) {
    await prisma.treeMember.create({
      data: {
        userId: CREATOR_ID,
        treeId: councilTree.id,
        status: 'VERIFIED',
        role: 'ADMIN',
      },
    });
  }
  } // end else (new tree creation)

  // 2. Create 4 AI users and TreeMembers
  console.log('\n👥 Creating AI members...');
  const aiProfiles = [
    { username: 'ai_backend_eng', profile: 'backend-eng', provider: 'hermes-agent', model: 'deepseek-v4-pro' },
    { username: 'ai_frontend_dev', profile: 'frontend-dev', provider: 'hermes-agent', model: 'deepseek-v4-pro' },
    { username: 'ai_security_auditor', profile: 'security-auditor', provider: 'hermes-agent', model: 'deepseek-v4-pro' },
    { username: 'ai_ux_reviewer', profile: 'ux-reviewer', provider: 'hermes-agent', model: 'deepseek-v4-pro' },
  ];

  const aiMembers: any[] = [];

  for (const ai of aiProfiles) {
    // Check if user already exists
    let user = await prisma.user.findUnique({ where: { username: ai.username } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          username: ai.username,
          email: `${ai.username}@trustsuite.ai`,
          password: passwordHash,
          is_onboarded: true,
        },
      });
    }
    const userId = user.id;

    // Check if already a member
    const existingMember = await prisma.treeMember.findFirst({
      where: { userId, treeId: councilTree.id },
    });
    if (existingMember) {
      console.log(`   ⏭️  ${ai.profile} already a member, skipping`);
      aiMembers.push(existingMember);
      continue;
    }

    const member = await prisma.treeMember.create({
      data: {
        userId,
        treeId: councilTree.id,
        isAI: true,
        aiProfile: ai.profile,
        aiProvider: ai.provider,
        aiModel: ai.model,
        needPointsPool: 1000,
        availableNeedPoints: 1000,
        status: 'VERIFIED',
        aiStatus: 'IDLE',
      },
    });

    // Use raw SQL — AIMemberConfig has Prisma/MySQL schema drift
    // (autonomyLevel, aiFailCount, etc. in Prisma but NOT in MySQL)
    await prisma.$executeRawUnsafe(
      `INSERT INTO AIMemberConfig (id, treeMemberId, maxConcurrentTasks, autoClaimEnabled, allowedPhases, skillOverrides, createdAt) VALUES (?, ?, ?, ?, ?, ?, NOW())`,
      uuid(), member.id, 3, true, JSON.stringify([]), JSON.stringify({})
    );

    aiMembers.push(member);
    console.log(`   ${ai.username} (${ai.profile}) — memberId: ${member.id}`);
  }

  // 3. Create 5 sample Needs with votes
  console.log('\n📝 Creating Needs and votes...');

  const needData = [
    {
      title: 'Upgrade auth system to OAuth2',
      description: 'Moltbook users are requesting OAuth2 support for third-party integrations. Current JWT-only auth limits Trust Suite ecosystem growth.',
      externalReferences: [
        { url: 'https://www.moltbook.com/p/87debd00', title: 'Philosophy critique of Trust system', source: 'moltbook' },
      ],
      votes: [10, 9, 8, 8], // total: 35
    },
    {
      title: 'Add real-time collaboration features',
      description: 'Multiple tree members need to work on the same need simultaneously. Real-time sync would dramatically improve coordination.',
      externalReferences: [],
      votes: [10, 9, 9], // total: 28
    },
    {
      title: 'Implement WebSocket support for live updates',
      description: 'The polling-based approach to notifications is inefficient. WebSocket connections would enable instant updates across the platform.',
      externalReferences: [],
      votes: [8, 7, 5, 5], // total: 25
    },
    {
      title: 'Improve test coverage to 80%',
      description: 'Current test coverage is at 45%. Critical paths in tree creation and need funding need comprehensive tests.',
      externalReferences: [],
      votes: [6, 5, 5, 4], // total: 20
    },
    {
      title: 'Design mobile-first component library',
      description: 'Trust Suite needs a responsive component library optimized for mobile-first workflows. Current desktop-only design limits field deployment.',
      externalReferences: [],
      votes: [7, 6, 5], // total: 18
    },
  ];

  const createdNeeds: any[] = [];

  for (const nd of needData) {
    const needId = uuid();
    const need = await (prisma as any).need.create({
      data: {
        id: needId,
        title: nd.title,
        description: nd.description,
        creatorId: aiMembers[0].userId, // First AI member creates all needs
        externalReferences: nd.externalReferences.length > 0 ? nd.externalReferences : undefined,
        importanceScore: nd.votes.reduce((a: number, b: number) => a + b, 0),
      },
    });

    // Link need to tree
    await prisma.needTree.create({
      data: { needId: need.id, treeId: councilTree.id },
    });

    // Add votes from AI members
    for (let i = 0; i < nd.votes.length; i++) {
      await prisma.needImportanceVote.create({
        data: {
          needId: need.id,
          voterId: aiMembers[i].id,
          score: nd.votes[i],
        },
      });
    }

    createdNeeds.push(need);
    console.log(`   Need: "${nd.title}" — score: ${nd.votes.reduce((a: number, b: number) => a + b, 0)} (${nd.votes.length} votes)`);
  }

  // 4. Approve top 2 needs, reject 1, leave 2 pending
  console.log('\n✅ Approving/rejecting needs...');

  // Approve top 2 (index 0 and 1)
  await prisma.need.updateMany({
    where: { id: { in: [createdNeeds[0].id, createdNeeds[1].id] } },
    data: { auditStatus: 'APPROVED' },
  });
  console.log(`   APPROVED: "${needData[0].title}"`);
  console.log(`   APPROVED: "${needData[1].title}"`);

  // Reject 1 (index 3 — test coverage)
  await prisma.need.update({
    where: { id: createdNeeds[3].id },
    data: { auditStatus: 'REJECTED_BY_CREATOR' },
  });
  console.log(`   REJECTED: "${needData[3].title}"`);

  // Index 2 and 4 remain PENDING
  console.log(`   PENDING: "${needData[2].title}"`);
  console.log(`   PENDING: "${needData[4].title}"`);

  // 5. Generate initial audit report
  console.log('\n📊 Generating initial audit report...');
  const needs = await prisma.need.findMany({
    where: {
      treeLinks: { some: { treeId: councilTree.id } },
      status: { not: 'RESOLVED' },
    },
    orderBy: { importanceScore: 'desc' },
    include: { importanceVotes: true },
  });

  const report = {
    generatedAt: new Date().toISOString(),
    treeId: councilTree.id,
    treeName: councilTree.name,
    needs: needs.map((n: any) => ({
      id: n.id,
      title: n.title,
      description: n.description,
      importanceScore: n.importanceScore,
      voteCount: n.importanceVotes.length,
      externalReferences: n.externalReferences,
      auditStatus: n.auditStatus,
      status: n.status,
    })),
  };

  await prisma.tree.update({
    where: { id: councilTree.id },
    data: {
      auditReportJson: report as any,
      lastAuditGeneratedAt: new Date(),
    },
  });

  console.log(`   Report cached with ${needs.length} needs`);

  console.log('\n🎉 AI Council seed complete!');
  console.log(`   Tree ID: ${councilTree.id}`);
  console.log(`   AI Members: ${aiMembers.length}`);
  console.log(`   Needs: ${createdNeeds.length} (2 approved, 1 rejected, 2 pending)`);
  console.log(`\n   Login: demo1 / demo123 (tree creator)`);
  console.log(`   AI logins: ai_backend_eng, ai_frontend_dev, ai_security_auditor, ai_ux_reviewer (all: demo123)`);
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
