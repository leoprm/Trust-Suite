# Design: Bridge-Driven Sub-Tree Onboarding

## Architecture

```
my_chat_member (bot added to group)
  │
  ├─ NEW: "¿Es un sub-árbol?" [Sí] [No]
  │     ├─ Sí → "Selecciona el árbol padre:" [🌳 Tree A] [🌳 Tree B] ...
  │     │        └─ callback onboarding:parent_select:<treeId>
  │     │              ├─ tree.update({ parentTreeId })
  │     │              ├─ notify parent chat via Bridge
  │     │              └─ continue → selector de idioma
  │     └─ No → selector de idioma (normal)
  │
  └─ Selector de idioma → Step 1 (objetivos) → Step 2 (pago) → Step 3 (WhatsApp)
     (Step sub-árbol y Step código padre ELIMINADOS del onboarding tradicional)
```

## Schema Changes

Ninguno. `Tree.parentTreeId` ya existe. `TreeMember` ya existe.

## API Endpoint (NEW)

### `GET /api/users/:telegramUserId/trees`
Devuelve árboles donde el usuario es miembro ACTIVO.

```typescript
// Response
{
  trees: [
    { id: "uuid", name: "TrustMaker", icono: "🤖", memberCount: 5 },
    { id: "uuid", name: "Cocina", icono: "🍳", memberCount: 3 },
  ]
}
```

**Controller**: `treeController.ts` → nueva función `getUserTrees`
**Route**: `treeRoutes.ts` → `router.get('/users/:telegramUserId/trees', getUserTrees)`

## Onboarding Flow Changes

### my_chat_member handler (bot/index.ts ~línea 965)

Después de crear el árbol pero antes del selector de idioma:

```typescript
// NEW: Ask sub-tree question BEFORE language selector
const subtreeMsg = await ctx.api.sendMessage(chatId,
  "¿Es este un sub-árbol de otro grupo TrustMaker?",
  {
    reply_markup: {
      inline_keyboard: [[
        { text: "✅ Sí, es un sub-árbol", callback_data: "onboarding:subtree_early_yes" },
        { text: "❌ No, es independiente", callback_data: "onboarding:subtree_early_no" },
      ]]
    }
  }
);
```

### Callback: onboarding:subtree_early_yes

```typescript
if (data === "onboarding:subtree_early_yes") {
  const tgUserId = BigInt(ctx.from!.id);
  const user = await prisma.user.findUnique({ where: { telegramUserId: tgUserId } });
  if (!user) { /* error */ return; }

  // Get user's active tree memberships (excluding this new tree)
  const memberships = await prisma.treeMember.findMany({
    where: { userId: user.id, status: "ACTIVE", treeId: { not: session.onboardingTreeId } },
    include: { tree: { select: { id: true, name: true, icono: true } } },
  });

  // Build inline keyboard
  const buttons = memberships.map(m => [{
    text: `${m.tree.icono || "🌳"} ${m.tree.name}`,
    callback_data: `onboarding:parent_select:${m.tree.id}`,
  }]);

  await ctx.editMessageText("Selecciona el árbol padre:", {
    reply_markup: { inline_keyboard: buttons },
  });
}
```

### Callback: onboarding:parent_select:<treeId>

```typescript
if (data.startsWith("onboarding:parent_select:")) {
  const parentTreeId = data.split(":")[2];

  // Verify user is member of parent tree
  const membership = await prisma.treeMember.findFirst({
    where: { userId: user.id, treeId: parentTreeId, status: "ACTIVE" },
  });
  if (!membership) { /* error */ return; }

  // Link as sub-tree
  await prisma.tree.update({
    where: { id: session.onboardingTreeId },
    data: { parentTreeId },
  });

  // Get parent tree info for notification
  const parentTree = await prisma.tree.findUnique({
    where: { id: parentTreeId },
    select: { id: true, name: true, telegramChatId: true },
  });

  // Notify parent tree chat via Bridge
  if (parentTree?.telegramChatId) {
    const childTree = await prisma.tree.findUnique({
      where: { id: session.onboardingTreeId },
      select: { name: true, icono: true },
    });
    await ctx.api.sendMessage(parentTree.telegramChatId,
      `🌿 *Nuevo sub-árbol vinculado:* ${childTree?.icono || "🌳"} ${childTree?.name}\n` +
      `Ahora las IAs de ambos árboles pueden colaborar.`,
      { parse_mode: "Markdown" }
    );
  }

  // Continue to language selector
  // ...existing lang_group: flow...
}
```

## System Prompt Enhancement (hermesBridge.ts)

Agregar a `buildSystemPrompt()`:

```typescript
// Parent tree context
if (parentTree) {
  lines.push(`## Parent Tree Context`);
  lines.push(`You are a sub-tree of **${parentTree.icono || "🌳"} ${parentTree.name}**.`);
  lines.push(`Your parent tree's Ari may share context and tasks with you.`);
  lines.push(`Introduce yourself to the group as a new sub-tree of ${parentTree.name}.`);
  lines.push(``);
}
```

## Tree Prefix in Messages (hermesBridge.ts)

En `routeToHermes()`, después de recibir respuesta:

```typescript
// Check if this chat has multiple trees (parent + sub-trees)
const treeCount = await prisma.tree.count({
  where: { telegramChatId: chatId },
});
const tree = await prisma.tree.findUnique({ where: { id: treeId } });

if (treeCount > 1 && tree) {
  const prefix = `${tree.icono || ""} ${tree.name}`;
  response.text = `- ${prefix}:\n\n${response.text}`;
}
```

Esto produce:
```
- 🤖 TrustMaker:

Los datos muestran que...
```

## E2E Test

`e2e-subtree-onboarding.test.ts`:
1. Crear árbol padre (user A)
2. Agregar Ari a grupo nuevo (user A)
3. Seleccionar "Sí, es sub-árbol"
4. Seleccionar árbol padre del keyboard
5. Verificar `parentTreeId` en DB
6. Verificar notificación en chat padre
7. Verificar system prompt incluye parentTree context
