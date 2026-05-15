/**
 * KA: Kanban Watchdog — unit tests.
 *
 * Verifica que checkSingleTask:
 *  1. Detecta status change (running → done) y notifica
 *  2. Re-notifica running tasks cada ~5 min (2 ciclos)
 *  3. Auto-limpieza cuando la tarea ya no existe en kanban
 *  4. No notifica si nada cambió y no pasaron 2 ciclos
 *  5. Maneja errores de exec (hermes no disponible)
 *
 * Mockea child_process.execFile para no depender del CLI real.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock execFileAsync
const mockExecFile = vi.fn();
vi.mock('child_process', () => ({
  execFile: vi.fn(),
}));
vi.mock('util', () => ({
  promisify: () => mockExecFile,
}));

const { checkSingleTask, runWatchdogCycle, startKanbanWatchdog, stopKanbanWatchdog } =
  await import('../bot/kanbanWatchdog');

describe('Kanban Watchdog — checkSingleTask', () => {
  let prisma: any;

  beforeEach(() => {
    vi.clearAllMocks();
    // Fake Date.now
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-15T12:00:00Z'));
    prisma = {
      botKanbanTask: {
        findMany: vi.fn().mockResolvedValue([]),
        update: vi.fn().mockResolvedValue({}),
      },
    };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── Escenario 1: Status change running→done → notifica ✅ ─────────────
  it('notifies on status change: running → done', async () => {
    mockExecFile.mockResolvedValue({
      stdout: JSON.stringify({
        task: { id: 't_abc123', status: 'done', title: 'Instalar Docker' },
        runs: [
          {
            outcome: 'completed',
            summary: 'Docker instalado en el servidor',
            error: null,
            started_at: Date.now() - 300000,
            ended_at: Date.now(),
          },
        ],
      }),
    });

    const tracked = {
      id: 'db-row-1',
      kanbanTaskId: 't_abc123',
      chatId: 'chat-456',
      status: 'running',
      lastNotifiedAt: new Date(Date.now() - 120_000),
      createdAt: new Date(Date.now() - 600_000),
    };

    const result = await checkSingleTask(prisma, tracked);

    expect(result).not.toBeNull();
    expect(result!.newStatus).toBe('done');
    expect(result!.message).toContain('✅');
    expect(result!.message).toContain('t_abc123');
    expect(result!.message).toContain('Docker instalado');
  });

  // ── Escenario 2: Re-notify running cada 2 ciclos (~5 min) ───────────
  it('re-notifies running tasks after 2+ cycles (~5 min)', async () => {
    mockExecFile.mockResolvedValue({
      stdout: JSON.stringify({
        task: { id: 't_abc123', status: 'running' },
        runs: [],
      }),
    });

    const tracked = {
      id: 'db-row-1',
      kanbanTaskId: 't_abc123',
      chatId: 'chat-456',
      status: 'running',
      lastNotifiedAt: new Date(Date.now() - 400_000), // >5 min ago
      createdAt: new Date(Date.now() - 600_000),
    };

    const result = await checkSingleTask(prisma, tracked);

    expect(result).not.toBeNull();
    expect(result!.newStatus).toBe('running');
    expect(result!.message).toContain('⏳');
    expect(result!.message).toContain('t_abc123');
    expect(result!.message).toContain('sigue trabajando');
  });

  // ── Escenario 3: No notifica si nada cambió ──────────────────────────
  it('does NOT notify when status unchanged and <2 cycles', async () => {
    mockExecFile.mockResolvedValue({
      stdout: JSON.stringify({
        task: { id: 't_abc123', status: 'running' },
        runs: [],
      }),
    });

    const tracked = {
      id: 'db-row-1',
      kanbanTaskId: 't_abc123',
      chatId: 'chat-456',
      status: 'running',
      lastNotifiedAt: new Date(Date.now() - 60_000), // only 1 min ago
      createdAt: new Date(Date.now() - 600_000),
    };

    const result = await checkSingleTask(prisma, tracked);

    expect(result).toBeNull();
  });

  // ── Escenario 4: Auto-limpieza — task no longer exists ───────────────
  it('auto-cleans when task no longer exists (no such task)', async () => {
    mockExecFile.mockResolvedValue({
      stdout: 'Error: no such task "t_gone"',
    });

    const tracked = {
      id: 'db-row-1',
      kanbanTaskId: 't_gone',
      chatId: 'chat-456',
      status: 'running',
      lastNotifiedAt: new Date(Date.now() - 120_000),
      createdAt: new Date(Date.now() - 600_000),
    };

    const result = await checkSingleTask(prisma, tracked);

    expect(result).not.toBeNull();
    expect(result!.newStatus).toBe('done');
    expect(result!.message).toBe(''); // no notification for auto-clean
  });

  // ── Escenario 5: Status blocked → notifica ⚠️ ───────────────────────
  it('notifies when task is blocked', async () => {
    mockExecFile.mockResolvedValue({
      stdout: JSON.stringify({
        task: { id: 't_abc123', status: 'blocked' },
        runs: [
          {
            outcome: 'blocked',
            summary: null,
            error: 'needs SSH credentials',
            started_at: Date.now() - 300000,
            ended_at: Date.now(),
          },
        ],
      }),
    });

    const tracked = {
      id: 'db-row-1',
      kanbanTaskId: 't_abc123',
      chatId: 'chat-456',
      status: 'running',
      lastNotifiedAt: new Date(Date.now() - 120_000),
      createdAt: new Date(Date.now() - 600_000),
    };

    const result = await checkSingleTask(prisma, tracked);

    expect(result).not.toBeNull();
    expect(result!.newStatus).toBe('blocked');
    expect(result!.message).toContain('⚠️');
    expect(result!.message).toContain('bloqueada');
    expect(result!.message).toContain('SSH credentials');
  });

  // ── Escenario 6: Hermes exec falla → no notifica ────────────────────
  it('returns null when hermes exec fails (skip cycle)', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    mockExecFile.mockRejectedValue(new Error('ECONNREFUSED'));

    const tracked = {
      id: 'db-row-1',
      kanbanTaskId: 't_abc123',
      chatId: 'chat-456',
      status: 'running',
      lastNotifiedAt: new Date(Date.now() - 400_000),
      createdAt: new Date(Date.now() - 600_000),
    };

    const result = await checkSingleTask(prisma, tracked);

    expect(result).toBeNull();
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  // ── Escenario 7: JSON parse falla → no notifica ─────────────────────
  it('returns null when kanban show returns invalid JSON', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    mockExecFile.mockResolvedValue({
      stdout: 'not valid json {{{',
    });

    const tracked = {
      id: 'db-row-1',
      kanbanTaskId: 't_abc123',
      chatId: 'chat-456',
      status: 'running',
      lastNotifiedAt: new Date(Date.now() - 400_000),
      createdAt: new Date(Date.now() - 600_000),
    };

    const result = await checkSingleTask(prisma, tracked);

    expect(result).toBeNull();
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });
});

describe('Kanban Watchdog — runWatchdogCycle', () => {
  let prisma: any;
  let bot: any;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma = {
      botKanbanTask: {
        findMany: vi.fn(),
        update: vi.fn().mockResolvedValue({}),
      },
    };
    bot = {
      api: {
        sendMessage: vi.fn().mockResolvedValue({}),
      },
    };
  });

  it('sends notification and updates DB on status change', async () => {
    // Mock findMany returns one tracked task
    prisma.botKanbanTask.findMany.mockResolvedValue([
      {
        id: 'db-1',
        kanbanTaskId: 't_test123',
        chatId: 'chat-789',
        status: 'running',
        lastNotifiedAt: new Date(Date.now() - 120_000),
        createdAt: new Date(Date.now() - 600_000),
      },
    ]);

    // Mock hermes response: task completed
    mockExecFile.mockResolvedValue({
      stdout: JSON.stringify({
        task: { id: 't_test123', status: 'done' },
        runs: [
          {
            outcome: 'completed',
            summary: 'Tarea completada exitosamente',
            error: null,
            started_at: Date.now() - 300_000,
            ended_at: Date.now(),
          },
        ],
      }),
    });

    await runWatchdogCycle(prisma, bot as any);

    // Should have sent a Telegram message
    expect(bot.api.sendMessage).toHaveBeenCalledWith(
      'chat-789',
      expect.stringContaining('✅'),
      { parse_mode: 'Markdown' },
    );

    // Should have updated DB with new status
    expect(prisma.botKanbanTask.update).toHaveBeenCalled();
  });

  it('handles 403 chat unavailable gracefully', async () => {
    prisma.botKanbanTask.findMany.mockResolvedValue([
      {
        id: 'db-1',
        kanbanTaskId: 't_test123',
        chatId: 'chat-gone',
        status: 'running',
        lastNotifiedAt: new Date(Date.now() - 400_000),
        createdAt: new Date(Date.now() - 600_000),
      },
    ]);

    mockExecFile.mockResolvedValue({
      stdout: JSON.stringify({
        task: { id: 't_test123', status: 'running' },
        runs: [],
      }),
    });

    bot.api.sendMessage.mockRejectedValue({ error_code: 403 });

    await runWatchdogCycle(prisma, bot as any);

    // Should mark as done when chat is unavailable
    expect(prisma.botKanbanTask.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'db-1' },
        data: { status: 'done' },
      }),
    );
  });

  it('handles empty tracked tasks', async () => {
    prisma.botKanbanTask.findMany.mockResolvedValue([]);

    await runWatchdogCycle(prisma, bot as any);

    // No calls to hermes or Telegram
    expect(mockExecFile).not.toHaveBeenCalled();
    expect(bot.api.sendMessage).not.toHaveBeenCalled();
  });
});
