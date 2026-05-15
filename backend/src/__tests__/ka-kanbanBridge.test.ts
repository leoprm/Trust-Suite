/**
 * KA: Kanban Bridge — unit tests.
 *
 * Verifica que createKanbanTask:
 *  1. Construye el comando hermes kanban create correctamente
 *  2. Parsea el task ID del stdout
 *  3. Persiste en BotKanbanTask
 *  4. Retorna null en fallos (exec error, stdout vacío, sin regex match)
 *
 * Mockea child_process.exec para no depender del CLI real.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as child_process from 'child_process';
import { PrismaClient } from '@prisma/client';

// Mock exec antes de importar el módulo bajo prueba
vi.mock('child_process', () => ({
  exec: vi.fn(),
}));

// Re-import after mock
const { createKanbanTask } = await import('../bot/kanbanBridge');

describe('Kanban Bridge', () => {
  let prisma: any;

  beforeEach(() => {
    // Mock PrismaClient — solo necesitamos botKanbanTask.create
    prisma = {
      botKanbanTask: {
        create: vi.fn().mockResolvedValue({ id: 'db-1' }),
      },
    };
    vi.clearAllMocks();
  });

  // ── Escenario: Task creada exitosamente ───────────────────────────────
  it('creates kanban task and returns task ID (instala Docker)', async () => {
    const mockStdout = 'Task created: t_abc123def456\nAssignee: backend-eng';
    (child_process.exec as any).mockImplementation(
      (_cmd: string, _opts: any, cb: Function) => {
        cb(null, mockStdout, '');
      },
    );

    const taskId = await createKanbanTask(
      prisma,
      'instala Docker en mi servidor',
      'tree-uuid-123',
      'chat-456',
    );

    expect(taskId).toBe('t_abc123def456');

    // Verificar que se llamó a exec con el comando correcto
    const execCalls = (child_process.exec as any).mock.calls;
    expect(execCalls.length).toBe(1);
    const command: string = execCalls[0][0];
    expect(command).toContain('hermes kanban create');
    expect(command).toContain('Consulta: instala Docker en mi servidor');
    expect(command).toContain('--assignee backend-eng');
    expect(command).toContain('**Tree:** tree-uuid-123');
    expect(command).toContain('**Chat:** chat-456');
    expect(command).toContain('> instala Docker en mi servidor');

    // Verificar que persistió en DB
    expect(prisma.botKanbanTask.create).toHaveBeenCalledWith({
      data: {
        kanbanTaskId: 't_abc123def456',
        chatId: 'chat-456',
        status: 'running',
      },
    });
  });

  // ── Escenario: Exec falla → null (fallback a concierge) ─────────────────
  it('returns null on exec error (fallback to concierge)', async () => {
    (child_process.exec as any).mockImplementation(
      (_cmd: string, _opts: any, cb: Function) => {
        cb(new Error('command not found'), '', 'command not found');
      },
    );

    const taskId = await createKanbanTask(
      prisma,
      'deploy the app',
      'tree-1',
      'chat-1',
    );

    expect(taskId).toBeNull();
    expect(prisma.botKanbanTask.create).not.toHaveBeenCalled();
  });

  // ── Escenario: Stdout sin task ID → null ─────────────────────────────
  it('returns null when stdout has no task ID regex match', async () => {
    (child_process.exec as any).mockImplementation(
      (_cmd: string, _opts: any, cb: Function) => {
        cb(null, 'Something went wrong', '');
      },
    );

    const taskId = await createKanbanTask(
      prisma,
      'build the project',
      'tree-2',
      'chat-2',
    );

    expect(taskId).toBeNull();
  });

  // ── Escenario: DB write falla → aún retorna task ID ──────────────────
  it('returns task ID even when DB write fails (task exists in kanban)', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    prisma.botKanbanTask.create.mockRejectedValue(new Error('DB down'));

    (child_process.exec as any).mockImplementation(
      (_cmd: string, _opts: any, cb: Function) => {
        cb(null, 'Created t_deadbeef\n', '');
      },
    );

    const taskId = await createKanbanTask(
      prisma,
      'configurar en el servidor',
      'tree-3',
      'chat-3',
    );

    expect(taskId).toBe('t_deadbeef');
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  // ── Title truncation at 80 chars ─────────────────────────────────────
  it('truncates title to 80 chars', async () => {
    const longMessage = 'A'.repeat(200);

    (child_process.exec as any).mockImplementation(
      (_cmd: string, _opts: any, cb: Function) => {
        cb(null, 'Created t_short1\n', '');
      },
    );

    await createKanbanTask(prisma, longMessage, 'tree-4', 'chat-4');

    const execCalls = (child_process.exec as any).mock.calls;
    const command: string = execCalls[0][0];
    // Title should be "Consulta: " + 80 chars max of message
    const titlePart = command.match(/'Consulta: (.+?)'/);
    expect(titlePart).not.toBeNull();
    expect(titlePart![1].length).toBeLessThanOrEqual(80);
  });
});
