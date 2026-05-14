import { prisma } from '../index';
import { assignAgentToTreeSlot } from './agentProfileService';
import https from 'https';

interface TreeForGenesis {
  id: string;
  name: string;
  telegramChatId?: string | null;
}

const GENESIS_TITLE = '¿Qué debe lograr este árbol primero?';
const TELEGRAM_MESSAGE =
  '🌳 ¡Árbol activado! Ya tienes agentes trabajando. Menciona @TrustMakerBot para interactuar.';

/**
 * onTreeCreated — auto-provisioning hook called every time a new tree is created.
 *
 * 1. Assigns 3 agents (analyst, researcher, implementer) via assignAgentToTreeSlot().
 * 2. Creates a genesis need so the tree has its first collective goal.
 * 3. If the tree has telegramChatId, sends a welcome message to the group.
 *
 * All steps are individually try/caught — a failure in one never blocks the others.
 * Callers should invoke this as fire-and-forget with .catch() for the top-level
 * promise handler.
 */
export async function onTreeCreated(tree: TreeForGenesis): Promise<void> {
  const roles = ['ANALYST', 'RESEARCHER', 'IMPLEMENTER'] as const;

  // ── 1. Assign agents ────────────────────────────────────────────────────
  for (const role of roles) {
    try {
      const agentId = await assignAgentToTreeSlot(tree.id, role);
      if (agentId) {
        console.log(
          `[genesisService] ${role} assigned: ${agentId.slice(0, 8)}… → tree ${tree.id.slice(0, 8)}…`,
        );
      } else {
        console.warn(
          `[genesisService] No ${role} available for tree ${tree.id.slice(0, 8)}…`,
        );
      }
    } catch (err: any) {
      console.error(
        `[genesisService] Error assigning ${role} to tree ${tree.id.slice(0, 8)}…:`,
        err?.message || err,
      );
    }
  }

  // ── 2. Create genesis need ──────────────────────────────────────────────
  try {
    await prisma.need.create({
      data: {
        treeId: tree.id,
        creatorId: 'system',
        title: GENESIS_TITLE,
        description: `Necesidad inicial del árbol «${tree.name}». Define la primera meta colectiva.`,
      },
    });
    console.log(
      `[genesisService] Genesis need created for tree ${tree.id.slice(0, 8)}…`,
    );
  } catch (err: any) {
    console.error(
      `[genesisService] Error creating genesis need for tree ${tree.id.slice(0, 8)}…:`,
      err?.message || err,
    );
  }

  // ── 3. Telegram welcome message ─────────────────────────────────────────
  if (tree.telegramChatId) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
      console.warn(
        `[genesisService] Tree ${tree.id.slice(0, 8)}… has telegramChatId but TELEGRAM_BOT_TOKEN is not set.`,
      );
      return;
    }

    try {
      await sendTelegramMessage(token, tree.telegramChatId, TELEGRAM_MESSAGE);
      console.log(
        `[genesisService] Welcome message sent to chat ${tree.telegramChatId}`,
      );
    } catch (err: any) {
      console.error(
        `[genesisService] Error sending Telegram message to ${tree.telegramChatId}:`,
        err?.message || err,
      );
    }
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function sendTelegramMessage(
  token: string,
  chatId: string,
  text: string,
): Promise<void> {
  const body = JSON.stringify({ chat_id: chatId, text });

  return new Promise((resolve, reject) => {
    const req = https.request(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        family: 4,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf-8');
          try {
            const data = JSON.parse(raw);
            if (!data.ok) {
              reject(
                new Error(
                  `Telegram API error ${data.error_code}: ${data.description}`,
                ),
              );
            } else {
              resolve();
            }
          } catch {
            reject(new Error(`Telegram API non-JSON response: ${raw.slice(0, 200)}`));
          }
        });
      },
    );

    req.on('error', reject);
    req.setTimeout(10_000, () => {
      req.destroy(new Error('Telegram API timeout (10s)'));
    });
    req.end(body);
  });
}
