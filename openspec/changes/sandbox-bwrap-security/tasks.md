# Tasks: Sandbox isolation + system prompt hardening

## Tarea 1: Instalar bubblewrap
- [ ] `sudo apt install -y bubblewrap`
- [ ] Verificar: `bwrap --version`

## Tarea 2: Modificar sandboxController.ts para usar bwrap
- [ ] Agregar función `execBwrap(command: string, treeId: string)`
- [ ] Modificar `POST /api/trees/:treeId/sandbox/exec` para usar `execBwrap`
- [ ] Timeout 30s, working directory `/sandbox`
- [ ] Sin `--unshare-net` (permitir internet)
- [ ] Verificar: comando dentro de bwrap no puede leer otros árboles

## Tarea 3: Hardening buildSystemPrompt
- [ ] Agregar sección "REGLAS DE SEGURIDAD REFORZADAS" en hermesBridge.ts
- [ ] Prohibir open(), os.system(), subprocess, pathlib fuera del sandbox
- [ ] Prohibir acceso a /home/trustmaker/.hermes/
- [ ] Reforzar API REST como única vía de filesystem
- [ ] Verificar: Ari respeta restricciones al preguntarle

## Tarea 4: Commit y push
- [ ] `git add -A && git commit -m "feat: bubblewrap sandbox isolation + system prompt security hardening"`
- [ ] `git push origin trust-maker`
- [ ] Reiniciar trust-backend.service
