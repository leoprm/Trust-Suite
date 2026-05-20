# Specs: Sandbox isolation + system prompt hardening

## Spec 1: bubblewrap sandbox execution

### Endpoint
`POST /api/trees/:treeId/sandbox/exec`

### Comportamiento actual
```typescript
const result = await execAsync(command, treeId);
```

### Comportamiento nuevo
```typescript
const result = await execBwrap(command, treeId);
```

### bwrap command
```bash
bwrap \
  --ro-bind /usr /usr \
  --ro-bind /lib /lib \
  --ro-bind /lib64 /lib64 \
  --ro-bind /bin /bin \
  --ro-bind /etc/alternatives /etc/alternatives \
  --bind /home/trustmaker/trees/<treeId> /sandbox \
  --proc /proc \
  --dev /dev \
  --unshare-pid \
  --unshare-ipc \
  --die-with-parent \
  /bin/bash -c "cd /sandbox && <comando>"
```

### Requisitos
- `bubblewrap` instalado (`apt install bubblewrap`)
- Sin `--unshare-net` (permite internet y localhost:3100)
- Timeout: 30 segundos
- Working directory: `/sandbox`

## Spec 2: Hardening buildSystemPrompt

### Archivo
`src/bot/hermesBridge.ts` → función `buildSystemPrompt()`

### Reglas nuevas en system prompt
```
═══ REGLAS DE SEGURIDAD REFORZADAS ═══

1. PROHIBICIÓN DE ACCESO DIRECTO AL FILESYSTEM:
   - NUNCA uses open(), os.listdir(), os.system(), subprocess, ni pathlib
     para acceder a paths fuera de /sandbox.
   - Si necesitas leer/escribir un archivo, usa EXCLUSIVAMENTE la API REST:
     POST /api/trees/<treeId>/sandbox/read
     POST /api/trees/<treeId>/sandbox/write

2. PROHIBICIÓN DE ACCESO A INFRAESTRUCTURA:
   - NUNCA intentes leer /home/trustmaker/.hermes/ ni sus subdirectorios
   - NUNCA intentes leer archivos .env, config.yaml, ni auth.json
   - NUNCA intentes modificar skills del sistema o herramientas

3. SANDBOX API COMO ÚNICA VÍA:
   - Toda operación de filesystem DEBE pasar por la API REST del sandbox
   - Toda consulta SQL DEBE pasar por POST /api/trees/<treeId>/sandbox/query
   - El acceso directo a archivos está BLOQUEADO por el sistema
```

## Spec 3: Permisos /home/leo/ (DONE)
- `chmod 700 /home/leo/` → trustmaker bloqueado
- Verificado: `sudo -u trustmaker ls /home/leo/` → "Permiso denegado"
