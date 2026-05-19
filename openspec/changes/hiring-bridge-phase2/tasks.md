# Tasks — Puente de Contratación Fase 2

## 1. Extender hiring-request

- [ ] 1.1 Modificar hiringBridge.ts: hiring-request.json ahora incluye startDate, endDate, location (además de los 3 mínimos existentes). Pasar los 6 datos al support agent.

## 2. Actualizar evaluador

- [ ] 2.1 Modificar /home/support/hiring-evaluator.py: leer los 6 campos. Filtrar candidatos que cumplen TODOS los mínimos. Enviar DM vía bot a cada candidato con: detalles del trabajo, fechas, ubicación, y botón inline "Postular".
- [ ] 2.2 Agregar callback `postular_{taskId}` en bot/index.ts: al presionar, registra al usuario en HiringApplicant (nueva tabla o JSON en hiring-request). Responde "Postulación registrada. Resultados el {endDate}."

## 3. Generar resultado

- [ ] 3.1 Al llegar endDate (o deadline configurable), hiring-evaluator.py cierra postulaciones, rankea top 3 entre postulantes, genera hiring-result.json con { applicants: [...], recommendedTop3: [...] }. Guarda en sandbox.

## 4. Ari Skill

- [ ] 4.1 Actualizar skill trust-maker: Ari ahora incluye startDate, endDate, location en hiring-request. Espera hiring-result.json con lista de postulantes.

## 5. Integration Test

- [ ] 5.1 Crear hiring-request con 6 campos → ejecutar evaluador → verificar DM enviados a candidatos → candidatos postulan → deadline vence → hiring-result.json generado con lista de postulantes + top 3.
