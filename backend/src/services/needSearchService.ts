import { prisma } from '../index';

export interface NeedSearchResult {
  id: string;
  name: string;
  description: string;
  score: number;
  treeName: string;
  phase: string; // Need status (ACTIVE | IN_PROGRESS | RESOLVED)
}

/**
 * Sanitize user query for MySQL FULLTEXT MATCH AGAINST.
 * Strips special characters that have meaning in boolean mode.
 */
function sanitizeFtsQuery(raw: string): string {
  return raw
    .replace(/[+\-><()~*"@]/g, ' ')  // strip FTS operators
    .replace(/\s+/g, ' ')            // collapse whitespace
    .trim();
}

/**
 * Build a boolean-mode FTS query: each word gets a * suffix for prefix matching.
 * Uses OR mode (no + prefix) for broader semantic matching.
 * Example: "logo negocio" → "logo* negocio*"
 */
function buildFtsQuery(raw: string): string {
  const sanitized = sanitizeFtsQuery(raw);
  const words = sanitized.split(/\s+/).filter(w => w.length > 0);
  if (words.length === 0) return '';
  return words.map(w => `${w}*`).join(' ');
}

/**
 * Check if a query term matches any of the tree's capacidades (skill tags).
 * capacidades is a JSON array like ["design", "programming", "logo"].
 */
function matchTags(query: string, capacidadesJson: string): boolean {
  try {
    const tags: string[] = JSON.parse(capacidadesJson);
    const lowerQ = query.toLowerCase();
    return tags.some(tag => tag.toLowerCase().includes(lowerQ) || lowerQ.includes(tag.toLowerCase()));
  } catch {
    return false;
  }
}

/**
 * Check if query matches the need's status/phase.
 */
function matchPhase(query: string, status: string): boolean {
  const q = query.toLowerCase();
  const phaseMap: Record<string, string[]> = {
    ACTIVE: ['active', 'activo', 'activa', 'abierto', 'abierta'],
    IN_PROGRESS: ['in_progress', 'in progress', 'en progreso', 'progreso', 'en curso'],
    RESOLVED: ['resolved', 'resuelto', 'resuelta', 'cerrado', 'cerrada'],
  };
  const aliases = phaseMap[status] || [];
  return aliases.some(a => q.includes(a));
}

/**
 * Search Needs using MySQL FULLTEXT + tag/phase fallback.
 *
 * Ranking (composite, max wins):
 *   - exact title match → 1.0
 *   - FTS relevance (normalized 0.1–0.9) → weighted by MySQL score
 *   - tag match (tree capacidades) → 0.5
 *   - phase/status match → 0.3
 *
 * Returns top 5 results sorted by score desc.
 */
export async function searchNeeds(query: string): Promise<NeedSearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const ftsQuery = buildFtsQuery(trimmed);
  const likePattern = `%${trimmed.replace(/%/g, '\\%').replace(/_/g, '\\_')}%`;

  // FTS search + LIKE fallback combined in one query
  // Use boolean mode for FTS to require all words; fall back to LIKE for partial matches
  const rows: any[] = await (prisma as any).$queryRawUnsafe(
    `SELECT
       n.id, n.title, n.description, n.status,
       MATCH(n.title, n.description) AGAINST(? IN BOOLEAN MODE) AS fts_score,
       t.id AS treeId, t.name AS treeName, t.capacidades
     FROM Need n
     JOIN NeedTree nt ON n.id = nt.needId
     JOIN Tree t ON nt.treeId = t.id
     WHERE MATCH(n.title, n.description) AGAINST(? IN BOOLEAN MODE)
        OR n.title LIKE ?
        OR n.description LIKE ?
     ORDER BY fts_score DESC
     LIMIT 30`,
    ftsQuery,
    ftsQuery,
    likePattern,
    likePattern,
  );

  if (rows.length === 0) return [];

  // Normalize FTS scores
  const maxFts = Math.max(...rows.map((r: any) => Number(r.fts_score) || 0), 0.01);
  const qLower = trimmed.toLowerCase();

  // Build scored results
  const scored = rows.map((row: any) => {
    const title = row.title as string;
    const description = (row.description as string) || '';
    const status = row.status as string;
    const capacidades = (row.capacidades as string) || '[]';

    // Exact title match
    const exactMatch = title.toLowerCase().includes(qLower) ? 1.0 : 0;

    // FTS score normalized to 0–0.9
    const ftsRaw = Number(row.fts_score) || 0;
    const ftsScore = maxFts > 0 ? (ftsRaw / maxFts) * 0.9 : 0;

    // Tag match
    const tagScore = matchTags(trimmed, capacidades) ? 0.5 : 0;

    // Phase match
    const phaseScore = matchPhase(trimmed, status) ? 0.3 : 0;

    // Composite: max of all dimensions
    const score = Math.max(exactMatch, ftsScore, tagScore, phaseScore);

    return {
      id: row.id as string,
      name: title,
      description,
      score: Math.round(score * 100) / 100,
      treeName: (row.treeName as string) || 'Unknown',
      phase: status,
    };
  });

  // Deduplicate by need id (keep highest score), then sort, then take top 5
  const seen = new Map<string, NeedSearchResult>();
  for (const item of scored) {
    const existing = seen.get(item.id);
    if (!existing || item.score > existing.score) {
      seen.set(item.id, item);
    }
  }

  return Array.from(seen.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}
