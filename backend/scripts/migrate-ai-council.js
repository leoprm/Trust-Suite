// Apply AI Council schema changes to the database
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

(async () => {
  const run = async (label, sql) => {
    try {
      await p.$executeRawUnsafe(sql);
      console.log(`✓ ${label}`);
    } catch (e) {
      if (e.message?.includes('Duplicate column') || e.message?.includes('already exists')) {
        console.log(`○ ${label} (already exists)`);
      } else {
        console.log(`✗ ${label}:`, e.message?.split('\n')[0]);
      }
    }
  };

  console.log('Applying AI Council schema changes...\n');

  await run('Tree.treeType', 'ALTER TABLE `Tree` ADD COLUMN `treeType` VARCHAR(10) NOT NULL DEFAULT "NORMAL"');
  await run('Tree.lastAuditGeneratedAt', 'ALTER TABLE `Tree` ADD COLUMN `lastAuditGeneratedAt` DATETIME(3)');
  await run('Tree.auditReportJson', 'ALTER TABLE `Tree` ADD COLUMN `auditReportJson` JSON');
  
  await run('Need.importanceScore', 'ALTER TABLE `Need` ADD COLUMN `importanceScore` FLOAT NOT NULL DEFAULT 0');
  await run('Need.externalReferences', 'ALTER TABLE `Need` ADD COLUMN `externalReferences` JSON');
  await run('Need.auditStatus', 'ALTER TABLE `Need` ADD COLUMN `auditStatus` VARCHAR(20) NOT NULL DEFAULT "PENDING"');
  
  await run('Branch.sourceNeedId', 'ALTER TABLE `Branch` ADD COLUMN `sourceNeedId` VARCHAR(36)');
  await run('Branch.description', 'ALTER TABLE `Branch` ADD COLUMN `description` TEXT');
  
  await run('NeedImportanceVote table', `
    CREATE TABLE \`NeedImportanceVote\` (
      \`id\` VARCHAR(36) NOT NULL,
      \`needId\` VARCHAR(36) NOT NULL,
      \`voterId\` VARCHAR(36) NOT NULL,
      \`score\` INT NOT NULL,
      \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`unique_need_voter\` (\`needId\`, \`voterId\`),
      CONSTRAINT \`fk_niv_need\` FOREIGN KEY (\`needId\`) REFERENCES \`Need\`(\`id\`) ON DELETE CASCADE,
      CONSTRAINT \`fk_niv_voter\` FOREIGN KEY (\`voterId\`) REFERENCES \`TreeMember\`(\`id\`) ON DELETE CASCADE
    )
  `);
  
  await run('Branch.sourceNeed FK', 'ALTER TABLE `Branch` ADD CONSTRAINT `fk_branch_source_need` FOREIGN KEY (`sourceNeedId`) REFERENCES `Need`(`id`) ON DELETE SET NULL');
  
  console.log('\nMigration complete.');
  await p.$disconnect();
})().catch(e => { console.error(e); p.$disconnect(); process.exit(1); });
