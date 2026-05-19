# Tasks: Inter-Tree Bridge + Sub-Tree Read Access

- [ ] **B1: Sub-Tree Read Access — endpoint para leer sandbox del padre**
  - Nuevo endpoint: POST /api/trees/:treeId/sandbox/parent/read
  - Verificar que el árbol tiene parentTreeId
  - Path traversal protection: el archivo debe estar dentro del sandbox del padre
  - Solo lectura (readFileSync, no write/delete)
  - ~30 LOC

- [ ] **B2: System Prompt Update — reglas de multi-IA en grupo**
  - Actualizar hermesBridge.ts: agregar sección "Árboles relacionados"
  - Incluir: parentTreeName, lista de sub-árboles
  - Reglas: prefijo obligatorio "🌳 Nombre:" o "🌿 Nombre (sub):"
  - Gatillos: @mención directa, keyword match, silencio si no aplica
  - ~40 LOC

- [ ] **B3: IA Identification Prefix — asegurar que toda respuesta tenga prefijo**
  - Agregar al system prompt: "SIEMPRE comienza tu respuesta con el nombre de tu árbol"
  - Validar en hermesBridge.ts: si respuesta no tiene prefijo, agregarlo automáticamente
  - ~20 LOC

- [ ] **B4: Parent Sandbox Visibility — Ari puede consultar archivos del padre**
  - Agregar instrucción en system prompt: "Puedes leer archivos del árbol padre con POST /api/trees/{tu-id}/sandbox/parent/read"
  - Ari usa este endpoint para obtener contexto adicional al responder
  - ~15 LOC

- [ ] **B5: Tree Declaration Update — al declararse sub-árbol, heredar keywords**
  - Cuando un árbol setea parentTreeId, el grupo YA tiene a los padres
  - Actualizar objective/keywords del sub-árbol para incluir las del padre
  - Notificar a los padres que tienen un nuevo sub-árbol
  - ~30 LOC

- [ ] **B6: Integración + E2E — test de flujo completo**
  - Crear árbol padre + sub-árbol
  - Verificar: sub-árbol puede leer sandbox del padre
  - Verificar: ambas IAs responden en el grupo con prefijo correcto
  - Verificar: @mención funciona, keyword match funciona, silencio funciona
  - ~40 LOC
