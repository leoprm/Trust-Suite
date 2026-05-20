# Sandbox isolation + system prompt hardening

## Problema
Ari puede acceder vía `execute_code` a paths fuera de su sandbox: otros árboles, `.hermes/`, `/home/leo/`.

## Solución (3 frentes)

### 1. bubblewrap sandbox
Ejecutar comandos dentro de `bwrap` en `POST /api/trees/:id/sandbox/exec`:
- Solo ve `/home/trustmaker/trees/<treeId>/` y `/usr` (read-only)
- Sin acceso a otros árboles, `.hermes/`, ni `/home/leo/`
- Con acceso a internet (sin `--unshare-net`)

### 2. Hardening buildSystemPrompt
- Prohibir `open()`, `os.system()`, `subprocess`, `pathlib` en paths fuera del sandbox
- Reforzar uso exclusivo de API REST para filesystem
- Prohibir acceso a `/home/trustmaker/.hermes/`

### 3. Permisos /home/leo/
- Ya aplicado: `chmod 700 /home/leo/` (trustmaker bloqueado)

## Verificación
- Ari no puede listar otros árboles con `os.listdir("/home/trustmaker/trees/")`
- Ari no puede leer `/home/trustmaker/.hermes/.env`
- Cada sandbox está aislado
