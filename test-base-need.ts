/**
 * Test Suite: Protocolo Necesidad Base
 * Ejecuta los 7 tests de verificación del diseño.
 *
 * Ejecutar con:
 *   npx tsx test-base-need.ts
 *
 * NO COMMIT NI PUSH
 */

const BASE = 'http://localhost:3100/api';

interface ApiResponse {
  status: number;
  body: any;
}

async function api(
  method: string,
  path: string,
  token?: string,
  data?: any
): Promise<ApiResponse> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const url = `${BASE}${path}`;
  const opts: any = { method, headers };
  if (data) opts.body = JSON.stringify(data);

  const res = await fetch(url, opts);
  const body = res.headers.get('content-type')?.includes('json')
    ? await res.json()
    : await res.text();
  return { status: res.status, body };
}

interface TestUser {
  id: string;
  username: string;
  email: string;
  token: string;
  role: string;
}

async function login(email: string, password: string): Promise<{ token: string; user: any } | null> {
  const r = await api('POST', '/auth/login', undefined, { email, password });
  if (r.status !== 200) return null;
  return { token: r.body.accessToken, user: r.body.user };
}

async function register(
  username: string,
  email: string,
  password: string
): Promise<{ token: string; user: any } | null> {
  const r = await api('POST', '/auth/register', undefined, { username, email, password });
  if (r.status === 201) {
    return login(email, password);
  }
  return null;
}

// ─── Results collector ───────────────────────────────────────────────────────
const results: { test: string; passed: boolean; details: string }[] = [];

function record(test: string, passed: boolean, details: string) {
  results.push({ test, passed, details });
  const icon = passed ? '✅' : '❌';
  console.log(`${icon} ${test}: ${details}`);
}

// ─── Main test runner ────────────────────────────────────────────────────────
async function main() {
  console.log('═══════════════════════════════════════════════════');
  console.log('  PROTOCOLO NECESIDAD BASE — TEST SUITE');
  console.log('═══════════════════════════════════════════════════\n');

  // ── Auth ────────────────────────────────────────────────────────────────
  let adminToken: string;
  let adminUser: any;

  // Try existing admin
  const adminLogin = await login('admin@trust.com', 'admin123');
  if (adminLogin) {
    adminToken = adminLogin.token;
    adminUser = adminLogin.user;
    console.log(`👤 Admin logueado: ${adminUser.username} (${adminUser.role})`);
  } else {
    console.log('⚠️ Admin login falló, creando...');
    const reg = await register('admin_test', 'admin_test@trust.com', 'admin123');
    if (!reg) throw new Error('No se pudo crear admin');
    adminToken = reg.token;
    adminUser = reg.user;
    console.log(`👤 Admin creado: ${adminUser.username}`);
  }

  // Get trees for admin
  const treesRes = await api('GET', '/trees', adminToken);
  const trees = Array.isArray(treesRes.body) ? treesRes.body : [];
  console.log(`🌳 Árboles disponibles: ${trees.length}`);

  let treeId: string;
  if (trees.length > 0) {
    treeId = trees[0].id;
    console.log(`📌 Usando árbol: ${trees[0].name || treeId}`);
  } else {
    // Create a tree
    const cr = await api('POST', '/trees', adminToken, {
      name: 'Test Base Need Tree',
      description: 'Árbol de prueba para protocolo Base Need',
      isPublic: true,
    });
    if (cr.status !== 201) throw new Error(`No se pudo crear árbol: ${JSON.stringify(cr.body)}`);
    treeId = cr.body.id;
    console.log(`📌 Árbol creado: ${treeId}`);
  }

  // ── Setup: Find or create a normal user ─────────────────────────────────
  const normalLogin = await login('user_test@trust.com', 'user123');
  let normalToken: string;
  let normalUserId: string;

  if (normalLogin) {
    normalToken = normalLogin.token;
    normalUserId = normalLogin.user.id;
    console.log(`👤 Usuario normal: ${normalLogin.user.username}`);
  } else {
    const reg = await register('user_test', 'user_test@trust.com', 'user123');
    if (!reg) throw new Error('No se pudo crear usuario normal');
    normalToken = reg.token;
    normalUserId = reg.user.id;
    console.log(`👤 Usuario normal creado: ${normalUserId}`);
  }

  // Join tree as VERIFIED member
  const joinRes = await api('POST', `/trees/${treeId}/join`, normalToken, {});
  console.log(`👥 Join tree: ${joinRes.status}`);

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 1: Sedimentación — need con 12 meses → POST sediment → isBase=true
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n── TEST 1: Sedimentación a 12 meses ──');

  // Create a need with createdAt 12+ months ago
  const twelveMonthsAgo = new Date();
  twelveMonthsAgo.setFullYear(twelveMonthsAgo.getFullYear() - 2); // 2 years ago

  // Usamos el endpoint crear need directamente si existe
  // Probamos con el endpoint estándar
  const needData = {
    title: 'Test Need — Base Sedimentation',
    description: 'Need with 12+ months for sedimentation testing',
    treeIds: [treeId],
    relevanceThresholdMet: true,
  };

  let needId: string;
  const crNeed = await api('POST', '/needs', adminToken, {
    ...needData,
    // Forzamos createdAt manualmente via admin override si existe
    createdAt: twelveMonthsAgo.toISOString(),
  });

  if (crNeed.status === 201 || crNeed.status === 200) {
    needId = crNeed.body.id || crNeed.body.need?.id;
    console.log(`Need creada: ${needId}`);
  } else {
    console.log(`Need creation response: ${crNeed.status} ${JSON.stringify(crNeed.body).slice(0, 200)}`);
    // Try alternative — buscar needs existentes con 12+ meses
    const needsRes = await api('GET', `/needs?treeId=${treeId}`, adminToken);
    const existingNeeds = Array.isArray(needsRes.body) ? needsRes.body : [];
    const oldNeed = existingNeeds.find((n: any) => {
      const created = new Date(n.createdAt);
      return created < twelveMonthsAgo;
    });

    if (oldNeed) {
      needId = oldNeed.id;
      console.log(`Usando need existente antigua: ${needId} (${oldNeed.title})`);
    } else {
      // Create need directly via DB manipulation? No, let's force the createdAt
      // Try creating with a different approach
      record('Test 1: Sedimentación', false, `No se pudo crear/obtener need antigua: ${crNeed.status}`);
    }
  }

  // If we have a needId, update its createdAt and relevanceThresholdMet
  if (needId) {
    // Verificar elegibilidad primero
    const eligRes = await api('GET', `/needs/${needId}/base-status`, adminToken);
    console.log(`Base status: ${eligRes.status} — ${JSON.stringify(eligRes.body).slice(0, 300)}`);

    // Force createdAt to be old enough if possible
    // Try to sediment
    const sedRes = await api('POST', `/needs/${needId}/sediment`, adminToken);
    console.log(`Sediment response: ${sedRes.status}`);

    if (sedRes.status === 200 && sedRes.body?.isBase) {
      record('Test 1: Sedimentación', true, `Need ${needId} sedimentada: isBase=true, sedimentedAt=${sedRes.body.sedimentedAt}`);
    } else if (sedRes.status === 400 && sedRes.body?.error?.includes('days remaining')) {
      // Need too young — record partial
      const statusRes = await api('GET', `/needs/${needId}/base-status`, adminToken);
      const daysUntil = statusRes.body?.daysUntilEligible;
      record('Test 1: Sedimentación', false,
        `Need demasiado joven (${daysUntil} días restantes). Se requiere manipular createdAt en DB o crear need con fecha antigua.`);
    } else {
      record('Test 1: Sedimentación', false, `Error: ${JSON.stringify(sedRes.body)}`);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 2: Evidence gate — task sin evidence → 0 XP
  // TEST 3: Evidence gate — task con evidence aprobado → XP normal
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n── TEST 2+3: Evidence Gate ──');

  // Need a task under a BASE need to test this
  if (needId) {
    // Get branches for this need
    const ideasRes = await api('GET', `/needs/${needId}`, adminToken);
    console.log(`Need detail: ${ideasRes.status}`);

    // ... More tests will follow
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SUMMARY
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════════');
  console.log('  RESULTADOS');
  console.log('═══════════════════════════════════════════════════');
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  console.log(`✅ ${passed} passed | ❌ ${failed} failed | Total: ${results.length}`);
  results.forEach(r => {
    console.log(`  ${r.passed ? '✅' : '❌'} ${r.test}: ${r.details}`);
  });
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
