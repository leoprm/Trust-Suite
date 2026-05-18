# Human-in-the-Loop: Árbol Primero + Votación — Tasks

## V1: Schema + Ari group announcement

- [ ] Modelo Candidate (userId, taskId, status ENUM: PENDING/ACCEPTED/REJECTED)
- [ ] Modelo CancelledPlan (titulo, descripcion, skills, budget, motivo, treeId, createdAt)
- [ ] Migracion Prisma
- [ ] System prompt Ari: flujo arbol-primero (preguntar en grupo, recolectar, encuesta)
- [ ] Ari publica anuncio en grupo al detectar human-worker task

## V2: Boton candidato + timer + encuesta

- [ ] Boton "Yo puedo" en mensaje de Ari → registra Candidate
- [ ] Timer 4h: al crearse tarea human-worker, programar cierre
- [ ] Recordatorio 20 min antes: "nadie mas?"
- [ ] Al cerrar ventana: crear encuesta anonima Telegram con candidatos + externo + cancelar
- [ ] Parsear resultado de encuesta → decidir ganador

## V3: Cancelacion + plan guardado + alternativas

- [ ] Si gana "Cancelar tarea": Ari propone 2-3 soluciones alternativas
- [ ] Guardar CancelledPlan con todos los datos para reusar
- [ ] Si gana interno: asignar y notificar
- [ ] Si gana externo: crear ExternalTask via @AriSuperManagerBot
- [ ] i18n strings nuevas en es.json + en.json

## V4: Integracion + test E2E

- [ ] Test E2E: tarea human-worker → anuncio → candidatos → encuesta → ganador
- [ ] Test cancelacion con alternativas
- [ ] Verificar CancelledPlan se guarda para reuso
- [ ] Commit + restart backend
