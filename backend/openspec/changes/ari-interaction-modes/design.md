# Design: Ari Interaction Modes

## Schema

```prisma
enum InteractionMode {
  MAXIMUM
  MEDIUM
  MINIMUM
}

model Tree {
  // ...existing fields...
  interactionMode  InteractionMode  @default(MAXIMUM)
}
```

## Gate Logic (bot/index.ts ~línea 1747)

```typescript
// Read tree's interaction mode
const tree = await findTreeByChat(prisma, chatId!);
const mode = tree?.interactionMode || "MAXIMUM";

// MINIMUM: skip name-based detection and conversation window
if (mode === "MINIMUM") {
  // Only reply and @tag pass through
  if (!isReplyToBot && !isTagged) {
    cmdText = null; // block
  }
}

// MEDIUM: skip conversation window and shouldAriRespond
if (mode === "MEDIUM") {
  // Name detection (+ reply + tag) still works
  // But skip conversation window entirely
  // (the HERMES_BRIDGE_ENABLED block below is skipped for MEDIUM)
}

// MAXIMUM: full behavior (no changes needed)
```

## Command: /modo

```typescript
// Solo admin puede cambiar
if (cmdText?.startsWith("/modo")) {
  const arg = cmdText.split(/\s+/)[1]?.toLowerCase();
  const modes: Record<string, string> = {
    "maxima": "MAXIMUM", "máxima": "MAXIMUM", "maximum": "MAXIMUM",
    "media": "MEDIUM", "medium": "MEDIUM",
    "minima": "MÍNIMA", "mínima": "MINIMUM", "minimum": "MINIMUM",
  };
  const newMode = modes[arg];
  if (!newMode) return ctx.reply("Modos: máxima, media, mínima");
  
  await prisma.tree.update({
    where: { id: tree.id },
    data: { interactionMode: newMode },
  });
  await ctx.reply(`Modo cambiado a: ${newMode}`);
}
```

## System Prompt (hermesBridge.ts)

Agregar a `buildSystemPrompt()`:

```typescript
if (tree.interactionMode === "MEDIUM") {
  lines.push("## Interaction Mode: MEDIUM");
  lines.push("You only respond when directly mentioned (@tag), replied to, or named. Do not proactively join conversations.");
}
if (tree.interactionMode === "MINIMUM") {
  lines.push("## Interaction Mode: MINIMUM");
  lines.push("You ONLY respond when tagged (@TrustMakerBot) or when someone replies to your messages. Stay silent otherwise.");
}
```
