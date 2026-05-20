# Tasks: Sandbox isolation + system prompt hardening

## Tarea 1: Instalar bubblewrap ✅ DONE
- [x] `sudo apt install -y bubblewrap`
- [x] Verificar: `bwrap --version`

## Tarea 2: Permisos cross-user ✅ DONE
- [x] `/home/leo` → 700 (owner only)
- [x] `/home/support` → 750, owner=support, leo en grupo support
- [x] `/home/trustmaker` → 750, owner=trustmaker, leo+support en grupo trustmaker
- [x] Matriz verificada: trustmaker no lee leo ni support

## Tarea 3: Modificar sandboxController.ts para usar bwrap
- [ ] Agregar función `execBwrap(command: string, treeId: string)`
- [ ] Modificar `POST /api/trees/:treeId/sandbox/exec` para usar `execBwrap`
- [ ] Timeout 30s, working directory `/sandbox`
- [ ] Sin `--unshare-net` (permitir internet)
- [ ] Verificar: comando dentro de bwrap no puede leer otros árboles
- **Kanban ID:** t_1f76bb8f

## Tarea 4: Hardening buildSystemPrompt
- [ ] Agregar sección "REGLAS DE SEGURIDAD REFORZADAS" en hermesBridge.ts
- [ ] Prohibir open(), os.system(), subprocess, pathlib fuera del sandbox
- [ ] Prohibir acceso a /home/trustmaker/.hermes/ y /home/leo/
- [ ] Reforzar API REST como única vía de filesystem
- [ ] Verificar: Ari respeta restricciones al preguntarle
- **Kanban ID:** t_05485ee3

## Tarea 5: Commit y push
- [ ] `git add -A && git commit -m "feat: bubblewrap sandbox isolation + system prompt security hardening + cross-user permissions"`
- [ ] `git push origin trust-maker`
- [ ] Reiniciar trust-backend.service
