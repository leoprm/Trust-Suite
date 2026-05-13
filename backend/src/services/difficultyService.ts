// ── DifficultyService ────────────────────────────────────────────────────────
// Calls the local Hermes Agent API to evaluate task difficulty on a 1-10 scale.
// Same pattern as conciergeController: AbortController + 30s timeout,
// X-Hermes-Session-Key for session isolation, strict prompt for number-only output.

const HERMES_API = 'http://127.0.0.1:8642/v1/chat/completions';
const TIMEOUT_MS = 30_000;
const MAX_RETRIES = 2;

/**
 * Evaluate task difficulty (1-10) by asking the Hermes Agent.
 * Returns a number 1-10, or null if the agent is unreachable.
 */
export async function evaluateDifficulty(
  title: string,
  description: string,
  treeId: string,
): Promise<number | null> {
  const prompt = [
    'You are a Task Difficulty Evaluator for a software engineering community.',
    'Given a task title and description, evaluate its difficulty on a scale of 1 (trivial) to 10 (requires deep expertise).',
    '',
    'Consider:',
    '- Technical complexity of the problem',
    '- Breadth of knowledge required',
    '- Risk and ambiguity',
    '- Implementation effort',
    '',
    'Respond with ONLY a single integer between 1 and 10. No explanation, no punctuation.',
    '',
    `Task title: ${title}`,
    `Task description: ${description}`,
  ].join('\n');

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const response = await fetch(HERMES_API, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Hermes-Session-Key': `difficulty-evaluator-${treeId}`,
        },
        body: JSON.stringify({
          messages: [
            { role: 'user', content: prompt },
          ],
          stream: false,
          temperature: 0.2,
          max_tokens: 10,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        console.error(
          `[difficultyService] Hermes API returned ${response.status} (attempt ${attempt + 1})`,
        );
        if (attempt < MAX_RETRIES) continue;
        return null;
      }

      const data = (await response.json()) as any;
      const raw =
        data?.choices?.[0]?.message?.content ??
        data?.choices?.[0]?.text ??
        data?.content ??
        '';

      // Extract the first integer from the response
      const match = String(raw).match(/\b(\d{1,2})\b/);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num >= 1 && num <= 10) return num;
        // Clamp out-of-range values
        if (num < 1) return 1;
        if (num > 10) return 10;
        return num;
      }

      console.warn(
        `[difficultyService] Could not parse difficulty from: "${String(raw).slice(0, 100)}"`,
      );
      if (attempt < MAX_RETRIES) continue;
      return null;

    } catch (error: any) {
      clearTimeout(timeoutId);
      if (
        error.name === 'AbortError' ||
        error.code === 'ETIMEDOUT' ||
        error.code === 'ECONNABORTED'
      ) {
        console.error('[difficultyService] Hermes API timed out');
        if (attempt < MAX_RETRIES) continue;
        return null;
      }
      console.error('[difficultyService] Unexpected error:', error.message || error);
      if (attempt < MAX_RETRIES) continue;
      return null;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  return null;
}
