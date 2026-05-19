# Design: Inter-Tree Bridge + Sub-Tree Read Access

## Arquitectura simplificada

Cuando un árbol se declara sub-árbol, su grupo de Telegram YA incluye a todos los padres. El grupo mismo es el bridge — no se necesita un grupo separado ni un Bridge Manager.

```
┌──────────────────────────────────────────────────────┐
│            Grupo Telegram "Roble Jr."                 │
│                                                      │
│  Participantes:                                       │
│    - Miembros humanos de Roble Jr.                    │
│    - Leo                                              │
│    - Ari de Roble Jr. (sub-árbol)                     │
│    - Ari de Roble (padre)                             │
│    - Ari de Sauce (abuelo, si aplica)                 │
│                                                      │
│  Leo: "@Roble ¿cómo va el presupuesto?"               │
│       ↓                                              │
│  Ari-Roble recibe el mensaje en el grupo              │
│       ↓                                              │
│  Evalúa: ¿es para mí? → sí (mención directa)          │
│       ↓                                              │
│  Responde: "🌳 Roble: $450K de $1M, 3 activas"       │
│                                                      │
│  Leo: "¿qué features nuevos hay?"                     │
│       ↓                                              │
│  Keyword "features" → Ari-Roble Jr. + Ari-Roble       │
│       ↓                                              │
│  "🌳 Roble: 2 features en roadmap"                    │
│  "🌿 Roble Jr.: 1 feature de diseño pendiente"        │
└──────────────────────────────────────────────────────┘
```

## Reglas del grupo multi-IA

1. **Prefijo obligatorio** — toda respuesta comienza con `"🌳 NombreÁrbol:"` o `"🌿 Nombre (sub):"`
2. **Solo responder si es relevante** — cada IA evalúa si el mensaje la menciona o toca su objetivo
3. **Una IA por árbol** — Ari representa a su árbol, no hay múltiples IAs por árbol
4. **Herencia de visibilidad** — sub-árbol ve mensajes dirigidos al padre, y viceversa

## Sub-Tree Read Access

El sub-árbol tiene acceso de **solo lectura** a TODO el sandbox del padre:

```
POST /api/trees/:childTreeId/sandbox/parent/read
  Body: { path: "obsidian/decisions/2026-05-01.md" }
  → Lee archivo del sandbox del padre
  → Solo lectura, no write/delete
```

Implementación:
```typescript
export const readParentSandbox = async (req, res) => {
  const childTree = await prisma.tree.findUnique({ 
    where: { id: req.params.treeId },
    select: { parentTreeId: true }
  });
  if (!childTree?.parentTreeId) {
    return res.status(400).json({ error: "No es sub-árbol" });
  }
  
  const parentSandbox = path.join(SANDBOX_BASE, childTree.parentTreeId);
  const filePath = path.join(parentSandbox, req.body.path);
  
  // Security: no escapar del sandbox del padre
  if (!filePath.startsWith(parentSandbox)) {
    return res.status(403).json({ error: "Path fuera del sandbox del padre" });
  }
  
  const content = fs.readFileSync(filePath, 'utf-8');
  res.json({ path: req.body.path, content });
};
```

## System prompt update (hermesBridge.ts)

Cada Ari debe saber:
```markdown
## Árboles relacionados

Eres la IA del árbol "{treeName}". 
- Tu árbol padre es: "{parentTreeName}" (sandbox legible en /parent-sandbox/)
- Tus sub-árboles: [lista]

En este grupo también están las IAs de tus árboles padre/abuelo.
- Al responder, SIEMPRE comienza con "🌳 {treeName}:" o "🌿 {treeName} (sub):"
- Responde solo si el mensaje te menciona (@{treeName}) o contiene keywords de tu objetivo
- Puedes consultar el sandbox del padre vía la API para contexto adicional
```

## Formato de respuesta

```
"🌳 Roble: Nuestro presupuesto está en $450K de $1M."

"🌿 Roble Jr. (sub): En el sub-árbol tenemos 2 tareas activas de diseño."

"🌳 Sauce: Desde el árbol abuelo, la prioridad sigue siendo branding."
```

## Gatillos de respuesta

Cada IA evalúa:
1. **Mención directa**: `@NombreDelÁrbol` → responde siempre
2. **Keyword match**: el mensaje contiene palabras clave del objetivo del árbol
3. **Contexto heredado**: si el padre responde algo relevante al sub-árbol
4. **Silencio**: si no aplica ninguna, no responde

## API endpoints nuevos

```
POST /api/trees/:treeId/sandbox/parent/read
  → Sub-árbol lee archivo del sandbox del padre
  
GET  /api/trees/:treeId/sandbox/read
  → Ya existe, se usa para leer archivos propios
```

## Seguridad

- Solo lectura para sub-árboles (no write/delete en sandbox padre)
- Verificación de parentTreeId antes de permitir lectura
- Path traversal protection: el archivo leído debe estar dentro del sandbox del padre
- Sin acceso a árboles que no sean ancestros directos
