/**
 * KPN: Status Query + Watchdog Aggregation + Rate Limiting — unit tests.
 *
 * Tests for the Kanban Progress Notifications feature:
 *  1. Natural status query "cómo van las tareas" → formatted ✓ ● ☐
 *  2. Watchdog aggregated summary (not individual task notifications)
 *  3. Rate limiting — max 1 notification per minute per chat
 *  4. Auto-claim on task creation → mapping stored in bridge
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mock i18n (depends on filesystem) ──
vi.mock('../bot/i18n', () => ({
  t: (key: string) => {
    const translations: Record<string, string> = {
      'kanban:no_tasks': '📋 No hay tareas pendientes en este chat.',
      'kanban:status_header': '📋 *Estado de tareas:*',
      'errors:generic': 'Ocurrió un error.',
    };
    return translations[key] ?? key;
  },
  initI18n: vi.fn(),
  resolveUserLanguage: vi.fn(),
}));

// ── Mock child_process ──
vi.mock('child_process', () => ({
  exec: vi.fn(),
  execFile: vi.fn(),
}));

// ── Mock promisify ──
const mockExecFileAsync = vi.fn();
vi.mock('util', () => ({
  promisify: () => mockExecFileAsync,
}));

// ── Imports after mocks ──
const { detectNaturalStatusQuery, handleStatusQuery } =
  await import('../bot/messages');
const { createKanbanTask, getTasksForChat } = await import(
  '../bot/kanbanBridge'
);
const { notifyProgress, rateLimitGate, resetRateLimits } = await import(
  '../bot/kanbanWatchdog'
);

// ═══════════════════════════════════════════════════════════════════════════
// 1. Status Query Detection (pure function, no I/O)
// ═══════════════════════════════════════════════════════════════════════════

describe('KPN — Status Query Detection', () => {
  it('detects "cómo van las tareas" as status query', () => {
    expect(detectNaturalStatusQuery('cómo van las tareas')).toBe(true);
  });

  it('detects "cómo vas" as status query', () => {
    expect(detectNaturalStatusQuery('cómo vas')).toBe(true);
  });

  it('detects "cómo va" as status query', () => {
    expect(detectNaturalStatusQuery('cómo va')).toBe(true);
  });

  it('detects "cómo vamos" as status query', () => {
    expect(detectNaturalStatusQuery('cómo vamos')).toBe(true);
  });

  it('detects "progreso" as status query', () => {
    expect(detectNaturalStatusQuery('qué progreso hay')).toBe(true);
  });

  it('detects "/status" as status query', () => {
    expect(detectNaturalStatusQuery('/status')).toBe(true);
  });

  it('detects "cómo va el progreso" as status query', () => {
    expect(
      detectNaturalStatusQuery('cómo va el progreso de las tareas'),
    ).toBe(true);
  });

  it('detects "estado de las tareas" as status query', () => {
    expect(detectNaturalStatusQuery('estado de las tareas')).toBe(true);
  });

  it('does NOT detect regular questions as status query', () => {
    expect(detectNaturalStatusQuery('cuántos miembros hay')).toBe(false);
    expect(detectNaturalStatusQuery('necesito ayuda con algo')).toBe(false);
    expect(detectNaturalStatusQuery('hola')).toBe(false);
  });

  it('is case insensitive', () => {
    expect(detectNaturalStatusQuery('CÓMO VAN LAS TAREAS')).toBe(true);
    expect(detectNaturalStatusQuery('Cómo Vas')).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. Status Query Handler — formatted ✓ ● ☐ ⚠
// ═══════════════════════════════════════════════════════════════════════════

describe('KPN — Status Query Handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('formats tasks with ✓ for done, ● for running, ☐ for ready, ⚠ for blocked', async () => {
    const { exec } = await import('child_process');

    // Build mock responses per task ID
    const mockCalls = new Map<string, { status: string; title: string }>([
      ['t_aaa000000001', { status: 'done', title: 'Schema + i18n' }],
      ['t_bbb000000002', { status: 'done', title: 'Locales JSON' }],
      ['t_ccc000000003', { status: 'running', title: 'Migrar textos' }],
      ['t_ddd000000004', { status: 'ready', title: 'Selector idioma' }],
      ['t_eee000000005', { status: 'blocked', title: 'Tests finales' }],
    ]);

    (exec as any).mockImplementation(
      (cmd: string, _opts: any, cb: Function) => {
        const match = cmd.match(/t_[a-f0-9]+/);
        const taskId = match ? match[0] : '';
        const info = mockCalls.get(taskId);
        if (info) {
          cb(
            null,
            JSON.stringify({
              task: { id: taskId, status: info.status, title: info.title },
            }),
            '',
          );
        } else {
          cb(new Error('no such task'), '', '');
        }
      },
    );

    const prisma = {
      botKanbanTask: {
        findMany: vi.fn().mockResolvedValue([
          { kanbanTaskId: 't_aaa000000001' },
          { kanbanTaskId: 't_bbb000000002' },
          { kanbanTaskId: 't_ccc000000003' },
          { kanbanTaskId: 't_ddd000000004' },
          { kanbanTaskId: 't_eee000000005' },
        ]),
      },
    } as any;

    const ctx = {
      chat: { id: 123456, type: 'group' },
      from: { id: 99999 },
    } as any;

    const result = await handleStatusQuery(prisma, ctx, 'es');

    expect(result).toContain('✓');
    expect(result).toContain('●');
    expect(result).toContain('☐');
    expect(result).toContain('⚠');
    expect(result).toContain('Schema + i18n');
    expect(result).toContain('Locales JSON');
    expect(result).toContain('Migrar textos');
    expect(result).toContain('Selector idioma');
    expect(result).toContain('Tests finales');
    expect(result).toContain('done');
    expect(result).toContain('running');
  });

  it('returns "no tasks" message when chat has no tracked kanban tasks', async () => {
    const prisma = {
      botKanbanTask: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    } as any;

    const ctx = {
      chat: { id: 999, type: 'group' },
      from: { id: 1 },
    } as any;

    const result = await handleStatusQuery(prisma, ctx, 'es');
    expect(result).toContain('No hay tareas');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. Watchdog Aggregated Summary (notifyProgress)
// ═══════════════════════════════════════════════════════════════════════════

describe('KPN — Watchdog Aggregated Summary', () => {
  let prisma: any;
  let bot: any;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-15T12:00:00Z'));
    resetRateLimits();

    prisma = {
      botKanbanTask: {
        findMany: vi.fn().mockResolvedValue([]),
        update: vi.fn().mockResolvedValue({}),
      },
    };

    bot = {
      api: {
        sendMessage: vi.fn().mockResolvedValue({}),
      },
    };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('sends aggregated progress: 📊 ✓ X/Y tareas | ● corriendo: T1 | ◻ pendientes: T2', async () => {
    // getTasksForChat returns active tasks for the chat
    prisma.botKanbanTask.findMany.mockResolvedValue([
      { kanbanTaskId: 't_aaa000000001' },
      { kanbanTaskId: 't_bbb000000002' },
      { kanbanTaskId: 't_ccc000000003' },
    ]);

    // Mock hermes kanban list response
    mockExecFileAsync.mockResolvedValue({
      stdout: JSON.stringify([
        { id: 't_aaa000000001', title: 'Tarea A', status: 'done' },
        { id: 't_bbb000000002', title: 'Tarea B', status: 'running' },
        {
          id: 't_ccc000000003',
          title: 'Tarea C larga con nombre muy extenso',
          status: 'ready',
        },
      ]),
    });

    const chatIds = new Set(['chat-789']);
    await notifyProgress(prisma, bot as any, chatIds);

    const sendCalls = bot.api.sendMessage.mock.calls;
    expect(sendCalls.length).toBe(1);

    const message: string = sendCalls[0][1];
    expect(message).toContain('📊');
    expect(message).toContain('✓ 1/3');
    expect(message).toContain('● corriendo:');
    expect(message).toContain('Tarea B');
    expect(message).toContain('◻ pendientes:');
  });

  it('handles ALL tasks completed (no running/pending/blocked)', async () => {
    // getTasksForChat returns active tasks — both are still "active" (running)
    // even if they're now done in kanban, they're still tracked with status != 'done'
    prisma.botKanbanTask.findMany.mockResolvedValue([
      { kanbanTaskId: 't_d0ne00000001' },
      { kanbanTaskId: 't_d0ne00000002' },
    ]);

    mockExecFileAsync.mockResolvedValue({
      stdout: JSON.stringify([
        { id: 't_d0ne00000001', title: 'Task 1', status: 'done' },
        { id: 't_d0ne00000002', title: 'Task 2', status: 'done' },
      ]),
    });

    const chatIds = new Set(['chat-all-done']);
    await notifyProgress(prisma, bot as any, chatIds);

    const sendCalls = bot.api.sendMessage.mock.calls;
    expect(sendCalls.length).toBe(1);
    expect(sendCalls[0][1]).toContain('✓ 2/2');
    // No running or pending lines
    expect(sendCalls[0][1]).not.toContain('● corriendo');
    expect(sendCalls[0][1]).not.toContain('◻ pendientes');
  });

  it('handles blocked tasks with ⊗ emoji', async () => {
    prisma.botKanbanTask.findMany.mockResolvedValue([
      { kanbanTaskId: 't_b10c00000001' },
    ]);

    mockExecFileAsync.mockResolvedValue({
      stdout: JSON.stringify([
        { id: 't_b10c00000001', title: 'Tarea Bloqueada', status: 'blocked' },
      ]),
    });

    const chatIds = new Set(['chat-blocked-test']);
    await notifyProgress(prisma, bot as any, chatIds);

    const sendCalls = bot.api.sendMessage.mock.calls;
    expect(sendCalls.length).toBe(1);
    expect(sendCalls[0][1]).toContain('⊗ bloqueadas');
    expect(sendCalls[0][1]).toContain('Tarea Bloqueada');
  });

  it('sends separate summaries when multiple chats have changes', async () => {
    // getTasksForChat called per chat — filter by chatId
    prisma.botKanbanTask.findMany.mockImplementation((args: any) => {
      const chatId = args?.where?.chatId;
      if (chatId === 'chat-A') {
        return Promise.resolve([{ kanbanTaskId: 't_a00000000001' }]);
      }
      if (chatId === 'chat-B') {
        return Promise.resolve([{ kanbanTaskId: 't_b00000000001' }]);
      }
      return Promise.resolve([]);
    });

    mockExecFileAsync.mockResolvedValue({
      stdout: JSON.stringify([
        { id: 't_a00000000001', title: 'Task A1', status: 'done' },
        { id: 't_b00000000001', title: 'Task B1', status: 'running' },
      ]),
    });

    const chatIds = new Set(['chat-A', 'chat-B']);
    await notifyProgress(prisma, bot as any, chatIds);

    const sendCalls = bot.api.sendMessage.mock.calls;
    expect(sendCalls.length).toBe(2);
    expect(sendCalls[0][0]).toBe('chat-A');
    expect(sendCalls[1][0]).toBe('chat-B');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. Rate Limiting
// ═══════════════════════════════════════════════════════════════════════════

describe('KPN — Rate Limiting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-15T12:00:00Z'));
    resetRateLimits();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows first notification through', () => {
    expect(rateLimitGate('chat-123')).toBe(true);
  });

  it('blocks second notification within 60 seconds', () => {
    rateLimitGate('chat-123'); // first — passes
    expect(rateLimitGate('chat-123')).toBe(false);
  });

  it('allows notification after 60 seconds have passed', () => {
    rateLimitGate('chat-123'); // first — passes
    vi.advanceTimersByTime(61_000);
    expect(rateLimitGate('chat-123')).toBe(true);
  });

  it('tracks rate limits per chat independently', () => {
    rateLimitGate('chat-A'); // first for A — passes
    rateLimitGate('chat-B'); // first for B — passes
    expect(rateLimitGate('chat-A')).toBe(false);
    expect(rateLimitGate('chat-B')).toBe(false);

    vi.advanceTimersByTime(61_000);

    expect(rateLimitGate('chat-A')).toBe(true);
    expect(rateLimitGate('chat-B')).toBe(true);
  });

  it('rate limiting integrated with notifyProgress (skips chat within 60s)', async () => {
    const prisma = {
      botKanbanTask: {
        findMany: vi.fn(),
      },
    } as any;

    const bot = {
      api: { sendMessage: vi.fn().mockResolvedValue({}) },
    } as any;

    prisma.botKanbanTask.findMany.mockResolvedValue([
      { kanbanTaskId: 't_7e5700000001' },
    ]);

    mockExecFileAsync.mockResolvedValue({
      stdout: JSON.stringify([
        { id: 't_7e5700000001', title: 'Test', status: 'done' },
      ]),
    });

    const chatIds = new Set(['chat-rt-integ-test']);

    // First call — goes through
    await notifyProgress(prisma, bot, chatIds);
    expect(bot.api.sendMessage).toHaveBeenCalledTimes(1);

    // Reset mock
    bot.api.sendMessage.mockClear();

    // Second call within 60s — rate limited
    await notifyProgress(prisma, bot, chatIds);
    expect(bot.api.sendMessage).toHaveBeenCalledTimes(0);

    // Advance time past 60s
    vi.advanceTimersByTime(61_000);

    // Third call — allowed again
    mockExecFileAsync.mockResolvedValue({
      stdout: JSON.stringify([
        { id: 't_7e5700000001', title: 'Test', status: 'done' },
      ]),
    });
    await notifyProgress(prisma, bot, chatIds);
    expect(bot.api.sendMessage).toHaveBeenCalledTimes(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. Auto-Claim on Task Creation
// ═══════════════════════════════════════════════════════════════════════════

describe('KPN — Auto-Claim', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates kanban task with assignee and stores mapping in bridge', async () => {
    const { exec } = await import('child_process');
    (exec as any).mockImplementation(
      (_cmd: string, _opts: any, cb: Function) => {
        cb(null, 'Task created: t_abc123def456\nAssignee: backend-eng', '');
      },
    );

    const prisma = {
      botKanbanTask: {
        create: vi.fn().mockResolvedValue({ id: 'db-1' }),
      },
    } as any;

    const taskId = await createKanbanTask(
      prisma,
      'instalar Docker en mi servidor',
      'tree-uuid-123',
      'chat-456',
    );

    expect(taskId).toBe('t_abc123def456');

    // Verify the command includes --assignee backend-eng
    // createKanbanTask now calls exec twice: kanban create + auto-claim
    const execCalls = (exec as any).mock.calls;
    expect(execCalls.length).toBeGreaterThanOrEqual(1);
    const command: string = execCalls[0][0];
    expect(command).toContain('--assignee backend-eng');

    // Verify mapping is stored in bridge
    expect(prisma.botKanbanTask.create).toHaveBeenCalledWith({
      data: {
        kanbanTaskId: 't_abc123def456',
        chatId: 'chat-456',
        status: 'running',
      },
    });
  });

  it('returns null when exec fails (mapping NOT created)', async () => {
    const { exec } = await import('child_process');
    (exec as any).mockImplementation(
      (_cmd: string, _opts: any, cb: Function) => {
        cb(new Error('command not found'), '', 'command not found');
      },
    );

    const prisma = {
      botKanbanTask: {
        create: vi.fn(),
      },
    } as any;

    const taskId = await createKanbanTask(
      prisma,
      'deploy the app',
      'tree-1',
      'chat-1',
    );

    expect(taskId).toBeNull();
    expect(prisma.botKanbanTask.create).not.toHaveBeenCalled();
  });

  it('getTasksForChat returns task IDs for a chat', async () => {
    const prisma = {
      botKanbanTask: {
        findMany: vi.fn().mockResolvedValue([
          { kanbanTaskId: 't_aaa000000001' },
          { kanbanTaskId: 't_bbb000000002' },
        ]),
      },
    } as any;

    const taskIds = await getTasksForChat(prisma, 'chat-456');
    expect(taskIds).toEqual(['t_aaa000000001', 't_bbb000000002']);
    expect(prisma.botKanbanTask.findMany).toHaveBeenCalledWith({
      where: { chatId: 'chat-456', status: { not: 'done' } },
      select: { kanbanTaskId: true },
    });
  });
});
