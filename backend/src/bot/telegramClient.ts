import { PrismaClient } from "@prisma/client";
import { spawn } from "child_process";
import path from "path";

const prisma = new PrismaClient();

export interface TgParticipant {
  id: number;
  username: string;
  first_name: string;
  is_bot: boolean;
}

/**
 * Sync all human members of a Telegram group into the TrustMaker DB.
 *
 * Spawns `lib/tg_members.py` (from the backend root) which uses the
 * Telethon MTProto API to list every participant.  Bots are skipped;
 * each human gets a User row (keyed on telegramUserId) and a TreeMember
 * row linked to `treeId`.  The caller (`adderId`) receives the ADMIN role;
 * all other synced members get MEMBER.
 *
 * @returns number of members that were synced (upserted).
 */
export async function syncAllMembers(
  chatId: number,
  treeId: string,
  adderId: number,
): Promise<number> {
  const apiId = process.env.TELEGRAM_API_ID;
  const apiHash = process.env.TELEGRAM_API_HASH;
  const botToken = process.env.TELEGRAM_BOT_TOKEN;

  if (!apiId || !apiHash) {
    throw new Error(
      "TELEGRAM_API_ID / TELEGRAM_API_HASH not set in environment",
    );
  }
  if (!botToken) {
    throw new Error("TELEGRAM_BOT_TOKEN not set in environment");
  }

  const script = path.resolve(__dirname, "../../lib/tg_members.py");
  const input = JSON.stringify({
    api_id: Number(apiId),
    api_hash: apiHash,
    chat_id: chatId,
    bot_token: botToken,
  });

  const participants = await new Promise<TgParticipant[]>((resolve, reject) => {
    const child = spawn("python3", [script], {
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 40_000, // 30 s script timeout + 10 s grace
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf-8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf-8");
    });

    child.on("error", (err) => {
      reject(new Error(`Failed to spawn tg_members.py: ${err.message}`));
    });

    child.on("close", (code) => {
      if (code !== 0) {
        reject(
          new Error(
            `tg_members.py exited ${code}: ${stderr.slice(0, 500)}`,
          ),
        );
        return;
      }
      try {
        resolve(JSON.parse(stdout) as TgParticipant[]);
      } catch {
        reject(new Error(`tg_members.py returned invalid JSON: ${stdout.slice(0, 200)}`));
      }
    });

    child.stdin.write(input);
    child.stdin.end();
  });

  let synced = 0;

  for (const p of participants) {
    if (p.is_bot) continue;

    try {
      // --- upsert User (keyed by telegramUserId) ---
      // BigInt is serialised as a regular number so we cast to BigInt.
      const tgId = BigInt(p.id);

      let user = await prisma.user.findUnique({
        where: { telegramUserId: tgId },
      });

      if (!user) {
        user = await prisma.user.create({
          data: {
            username: p.username || `tg${p.id}`,
            firstName: p.first_name || null,
            telegramUserId: tgId,
          },
        });
      } else if (p.username && user.username !== p.username) {
        // Keep username in sync if Telegram provides one and ours is stale.
        // Only update if the existing name looks auto-generated.
        if (user.username.startsWith("tg")) {
          await prisma.user.update({
            where: { id: user.id },
            data: { username: p.username },
          });
        }
      }
      // Always update firstName if provided and different
      if (p.first_name && user.firstName !== p.first_name) {
        await prisma.user.update({
          where: { id: user.id },
          data: { firstName: p.first_name },
        });
      }

      // --- upsert TreeMember ---
      const isAdder = p.id === adderId;

      await prisma.treeMember.upsert({
        where: {
          userId_treeId: { userId: user.id, treeId },
        },
        create: {
          userId: user.id,
          treeId,
          role: isAdder ? "ADMIN" : "MEMBER",
          status: "ACTIVE",
        },
        update: {
          // If the member existed but was INACTIVE, reactivate.
          status: "ACTIVE",
          // Only promote to ADMIN if this participant is the adder;
          // never demote an existing ADMIN.
          ...(isAdder ? { role: "ADMIN" as const } : {}),
        },
      });

      synced++;
    } catch (err) {
      console.error(
        `[telegramClient] Failed to sync participant ${p.id} (${p.username || p.first_name}):`,
        err,
      );
      // Don't stop the whole batch on one failure.
    }
  }

  return synced;
}
