/**
 * KA: Messages routing — integration tests.
 *
 * Verifica el flujo completo de enrutamiento en handleNaturalMessage:
 *  1. Consulta simple → concierge inmediato
 *  2. Consulta compleja → kanban task con respuesta "⏳ t_xxx"
 *  3. Fallback a concierge si kanban falla
 *  4. Sin mención → null
 *  5. Sin árbol → mensaje de error
 *
 * Mockea fetch (concierge) y child_process.exec (kanbanBridge).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mock child_process.exec ──
vi.mock('child_process', () => ({
  exec: vi.fn(),
}));

// ── Mock global fetch ──
const mockFetch = vi.fn();

const { handleNaturalMessage } = await import('../bot/messages');

// ── Helpers ──────────────────────────────────────────────────────────────

function makeCtx(text: string, chatId = '123456') {
  return {
    message: { text },
    chat: { id: parseInt(chatId), type: 'group' },
    from: { id: 99999 },
    replyWithChatAction: vi.fn().mockResolvedValue(undefined),
  } as any;
}

function makePrisma(tree: any | null) {
  const mockTree = tree
    ? {
        ...tree,
        _count: { members: 10, needs: 5, ratings: 20 },
      }
    : null;

  return {
    tree: {
      findFirst: vi.fn().mockResolvedValue(mockTree),
      findUnique: vi.fn().mockResolvedValue(mockTree),
    },
    treeMember: {
      findUnique: vi.fn(),
    },
    need: {
      count: vi.fn().mockResolvedValue(3),
    },
    needIdea: {
      count: vi.fn().mockResolvedValue(7),
    },
    botKanbanTask: {
      create: vi.fn().mockResolvedValue({ id: 'db-1' }),
    },
  } as any;
}

const MOCK_TREE = {
  id: 'tree-uuid-test',
  name: 'Test Tree',
  telegramChatId: '123456',
  icono: '🌳',
  admissionPolicy: 'OPEN',
};

describe('Messages — Natural Message Routing', () => {
  let prisma: any;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-15T12:00:00Z'));
    vi.stubGlobal('fetch', mockFetch);
    prisma = makePrisma(MOCK_TREE);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  // ── Test 1: Simple query "cuántos miembros" → concierge inmediato ────
  it('routes "cuántos miembros" to concierge (simple query)', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ reply: '🌳 Este árbol tiene 42 miembros activos.' }),
    });

    const ctx = makeCtx('@TrustMakerBot cuántos miembros hay en este árbol');
    const result = await handleNaturalMessage(prisma, ctx);

    expect(result).not.toBeNull();
    expect(result!.text).toContain('42 miembros');

    // Verificar que se llamó al concierge
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3100/api/concierge',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('cuántos miembros'),
      }),
    );
  });

  // ── Test 2: Complex query "instala Docker" → kanban ──────────────────
  it('routes "instala Docker en mi servidor" to kanban (complex query)', async () => {
    const { exec } = await import('child_process');
    (exec as any).mockImplementation(
      (_cmd: string, _opts: any, cb: Function) => {
        cb(null, 'Task created: t_a1b2c3d4e5f6\nAssignee: backend-eng', '');
      },
    );

    const ctx = makeCtx('@TrustMakerBot instala Docker en mi servidor');
    const result = await handleNaturalMessage(prisma, ctx);

    expect(result).not.toBeNull();
    expect(result!.text).toContain('⏳');
    expect(result!.text).toContain('Estoy trabajando en esto');
    expect(result!.text).toContain('Te mantengo al tanto cada 2:30 min');
    expect(result!.text).toContain('t_a1b2c3d4e5f6');

    // No debería haber llamado al concierge
    expect(mockFetch).not.toHaveBeenCalled();
  });

  // ── Test 3: Kanban falla → fallback a concierge ──────────────────────
  it('falls back to concierge when kanban creation fails', async () => {
    const { exec } = await import('child_process');
    (exec as any).mockImplementation(
      (_cmd: string, _opts: any, cb: Function) => {
        cb(new Error('hermes not found'), '', '');
      },
    );

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ reply: 'Puedo ayudarte con la instalación de Docker...' }),
    });

    const ctx = makeCtx('@TrustMakerBot instala Docker en mi servidor');
    const result = await handleNaturalMessage(prisma, ctx);

    // Should have fallen through to concierge
    expect(result).not.toBeNull();
    expect(result!.text).toContain('Puedo ayudarte');
    expect(mockFetch).toHaveBeenCalled();
  });

  // ── Test 4: Sin mención → null ──────────────────────────────────────
  it('returns null when message does not mention the bot', async () => {
    const ctx = makeCtx('hola a todos');
    const result = await handleNaturalMessage(prisma, ctx);
    expect(result).toBeNull();
  });

  // ── Test 5: Sin árbol → mensaje de error ────────────────────────────
  it('returns error message when no tree is associated with chat', async () => {
    const noTreePrisma = makePrisma(null);
    const ctx = makeCtx('@TrustMakerBot hola');

    const result = await handleNaturalMessage(noTreePrisma, ctx);

    expect(result).not.toBeNull();
    expect(result!.text).toContain('no tiene un árbol');
  });

  // ── Test 6: Concierge timeout → mensaje amigable ────────────────────
  it('handles concierge timeout gracefully', async () => {
    const abortError = new Error('The operation was aborted');
    abortError.name = 'AbortError';
    mockFetch.mockRejectedValue(abortError);

    const ctx = makeCtx('@TrustMakerBot cuántos miembros hay');
    const result = await handleNaturalMessage(prisma, ctx);

    expect(result).not.toBeNull();
    expect(result!.text).toContain('pensando');
  });

  // ── Test 7: Concierge API down → mensaje de error ───────────────────
  it('handles concierge connection refused gracefully', async () => {
    mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));

    const ctx = makeCtx('@TrustMakerBot cuántos miembros hay');
    const result = await handleNaturalMessage(prisma, ctx);

    expect(result).not.toBeNull();
    expect(result!.text).toContain('no estoy disponible');
  });

  // ── Test 8: Concierge returns empty reply → fallback message ────────
  it('handles empty concierge reply gracefully', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ reply: '' }),
    });

    const ctx = makeCtx('@TrustMakerBot cuántos miembros hay');
    const result = await handleNaturalMessage(prisma, ctx);

    expect(result).not.toBeNull();
    expect(result!.text).toContain('no estoy disponible');
  });

  // ── Test 9: Deploy → kanban (hex task ID) ───────────────────────────
  it('routes "deploy the app" to kanban (keyword match)', async () => {
    const { exec } = await import('child_process');
    (exec as any).mockImplementation(
      (_cmd: string, _opts: any, cb: Function) => {
        cb(null, 'Task created: t_deadbeef0001\n', '');
      },
    );

    const ctx = makeCtx('@TrustMakerBot deploy the app to production');
    const result = await handleNaturalMessage(prisma, ctx);

    expect(result).not.toBeNull();
    expect(result!.text).toContain('⏳');
    expect(result!.text).toContain('t_deadbeef0001');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  // ── Test 10: SSH keyword → kanban ───────────────────────────────────
  it('routes SSH queries to kanban', async () => {
    const { exec } = await import('child_process');
    (exec as any).mockImplementation(
      (_cmd: string, _opts: any, cb: Function) => {
        cb(null, 'Task created: t_abc123def456\n', '');
      },
    );

    const ctx = makeCtx('@TrustMakerBot necesito acceso SSH al servidor');
    const result = await handleNaturalMessage(prisma, ctx);

    expect(result).not.toBeNull();
    expect(result!.text).toContain('⏳');
  });
});
