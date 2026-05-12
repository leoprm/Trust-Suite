// Migration: needPointsPool overhaul — column changes
// Run: node src/scripts/migrate-need-points.js
const mysql = require('mysql2/promise');
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

async function main() {
  const conn = await mysql.createConnection(
    process.env.DATABASE_URL + (process.env.DATABASE_URL.includes('?') ? '&' : '?') + 'multipleStatements=true'
  );
  console.log('Connected.');

  // 1. TreeMember: add needPointsPool + availableNeedPoints, drop weeklyNeedPoints
  try {
    await conn.query('ALTER TABLE TreeMember ADD COLUMN needPointsPool INT NOT NULL DEFAULT 1000');
    console.log('  ✓ TreeMember.needPointsPool added');
  } catch (e) { console.log('  (already exists)'); }
  
  try {
    await conn.query('ALTER TABLE TreeMember ADD COLUMN availableNeedPoints INT NOT NULL DEFAULT 1000');
    console.log('  ✓ TreeMember.availableNeedPoints added');
  } catch (e) { console.log('  (already exists)'); }

  // Initialize availableNeedPoints = needPointsPool
  await conn.query('UPDATE TreeMember SET availableNeedPoints = needPointsPool');
  console.log('  ✓ availableNeedPoints initialized');

  try {
    await conn.query('ALTER TABLE TreeMember DROP COLUMN weeklyNeedPoints');
    console.log('  ✓ TreeMember.weeklyNeedPoints dropped');
  } catch (e) { console.log('  (already dropped)'); }

  // 2. Need: add pointsAllocated
  try {
    await conn.query('ALTER TABLE Need ADD COLUMN pointsAllocated INT NOT NULL DEFAULT 0');
    console.log('  ✓ Need.pointsAllocated added');
  } catch (e) { console.log('  (already exists)'); }

  // 3. NeedStatus: add SEDIMENTED
  await conn.query("ALTER TABLE Need MODIFY COLUMN status ENUM('ACTIVE','IN_PROGRESS','SEDIMENTED','RESOLVED') NOT NULL DEFAULT 'ACTIVE'");
  console.log('  ✓ NeedStatus +SEDIMENTED');

  console.log('Migration complete.');
  await conn.end();
}

main().catch(e => { console.error(e); process.exit(1); });
