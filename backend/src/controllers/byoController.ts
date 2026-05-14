import { Request, Response } from 'express';
import { prisma } from '../index';
import { encrypt, decrypt } from '../utils/crypto';

// ── POST /api/byo/keys ────────────────────────────────────────────────────
// Body: { name?, provider, apiKey, costPerToken?, maxParallel? }
export const createKey = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { name, provider, apiKey, costPerToken, maxParallel } = req.body;

    if (!provider || typeof provider !== 'string' || !provider.trim()) {
      return res.status(400).json({ error: 'provider (string) is required' });
    }
    if (!apiKey || typeof apiKey !== 'string' || !apiKey.trim()) {
      return res.status(400).json({ error: 'apiKey (string) is required' });
    }

    const encrypted = encrypt(apiKey.trim());

    const key = await prisma.byoApiKey.create({
      data: {
        userId,
        name: name?.trim() || 'My Key',
        provider: provider.trim(),
        apiKey: encrypted,
        costPerToken: typeof costPerToken === 'number' && costPerToken > 0 ? costPerToken : 0,
        maxParallel: typeof maxParallel === 'number' && maxParallel >= 1 ? Math.floor(maxParallel) : 5,
      },
      select: {
        id: true,
        name: true,
        provider: true,
        costPerToken: true,
        maxParallel: true,
        createdAt: true,
      },
    });

    res.status(201).json(key);
  } catch (err: any) {
    console.error('[byo:createKey]', err.message || err);
    res.status(500).json({ error: 'Failed to create BYO API key' });
  }
};

// ── GET /api/byo/keys ─────────────────────────────────────────────────────
// Returns all keys for the authenticated user (apiKey partially masked).
export const listKeys = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;

    const keys = await prisma.byoApiKey.findMany({
      where: { userId },
      select: {
        id: true,
        name: true,
        provider: true,
        apiKey: true,
        costPerToken: true,
        maxParallel: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const masked = keys.map(k => {
      let maskedKey = '****';
      try {
        const decrypted = decrypt(k.apiKey);
        if (decrypted.length > 4) {
          maskedKey = decrypted.slice(0, 4) + '••••' + decrypted.slice(-2);
        }
      } catch {
        // If decryption fails, keep it fully masked
      }
      return {
        ...k,
        apiKey: maskedKey,
      };
    });

    res.json(masked);
  } catch (err: any) {
    console.error('[byo:listKeys]', err.message || err);
    res.status(500).json({ error: 'Failed to list BYO API keys' });
  }
};

// ── DELETE /api/byo/keys/:id ──────────────────────────────────────────────
export const deleteKey = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const id = req.params.id as string;

    const key = await prisma.byoApiKey.findUnique({
      where: { id },
      select: { userId: true },
    });

    if (!key) {
      return res.status(404).json({ error: 'Key not found' });
    }
    if (key.userId !== userId) {
      return res.status(403).json({ error: 'Not your key' });
    }

    await prisma.byoApiKey.delete({ where: { id } });
    res.json({ deleted: id });
  } catch (err: any) {
    console.error('[byo:deleteKey]', err.message || err);
    res.status(500).json({ error: 'Failed to delete BYO API key' });
  }
};

// ── POST /api/byo/register ─────────────────────────────────────────────────
// Body: { name, provider, model, description?, byoKeyId? }
// Registers a BYO AI model: creates Agent (type EXTERNAL) + AgentProfile.
export const register = async (req: Request, res: Response) => {
  let agentName = '';
  try {
    const userId = req.user!.id;
    const { name, provider, model, description, byoKeyId } = req.body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'name (string) is required' });
    }
    if (!provider || typeof provider !== 'string' || !provider.trim()) {
      return res.status(400).json({ error: 'provider (string) is required' });
    }
    if (!model || typeof model !== 'string' || !model.trim()) {
      return res.status(400).json({ error: 'model (string) is required' });
    }

    agentName = name.trim();

    // Create Agent entry with type EXTERNAL
    const agent = await prisma.agent.create({
      data: {
        name: agentName,
        description: description?.trim() || `BYO: ${provider.trim()}/${model.trim()}`,
        type: 'EXTERNAL',
      },
    });

    // Create AgentProfile with explorationEligible = true (enters exploration pool)
    const profile = await prisma.agentProfile.create({
      data: {
        agentId: agent.id,
        explorationEligible: true,
      },
    });

    res.status(201).json({
      agentId: agent.id,
      name: agent.name,
      type: agent.type,
      description: agent.description,
      profile: {
        explorationEligible: profile.explorationEligible,
        totalRatings: profile.totalRatings,
        avgStars: profile.avgStars,
        confidenceScore: profile.confidenceScore,
      },
    });
  } catch (err: any) {
    console.error('[byo:register]', err.message || err);
    // Unique constraint on Agent.name
    if (err.code === 'P2002') {
      return res.status(409).json({ error: `An agent named "${agentName}" already exists` });
    }
    res.status(500).json({ error: 'Failed to register BYO model' });
  }
};

// ── GET /api/byo/keys/:id/decrypt ─────────────────────────────────────────
// Returns the full decrypted API key (one-time sensitive read).
export const decryptKey = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const id = req.params.id as string;

    const key = await prisma.byoApiKey.findUnique({
      where: { id },
      select: { userId: true, apiKey: true },
    });

    if (!key) {
      return res.status(404).json({ error: 'Key not found' });
    }
    if (key.userId !== userId) {
      return res.status(403).json({ error: 'Not your key' });
    }

    const decrypted = decrypt(key.apiKey);
    res.json({ apiKey: decrypted });
  } catch (err: any) {
    console.error('[byo:decryptKey]', err.message || err);
    res.status(500).json({ error: 'Failed to decrypt BYO API key' });
  }
};
