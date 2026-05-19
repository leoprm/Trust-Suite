# Tasks — Clasificación de Árboles + Motor de Contratación

## 1. Clasificación de Árbol

- [ ] 1.1 Al crear árbol, Ari analiza descripción y genera tree-classification.json en sandbox: { type: "gremio"|"academia"|"empresa", skills: ["skill1","skill2"] }.
- [ ] 1.2 Crear treeClassifier.ts: cron diario que lee tree-classification.json de cada sandbox y sync a Tree.classification (JSON en DB).
- [ ] 1.3 Agregar campo classification (JSON) al modelo Tree en schema.prisma.

## 2. Puente de Contratación

- [ ] 2.1 Ari genera hiring-request-{taskId}.json en sandbox con { minSkillLevel, minSatisfactionPersonal, minSatisfactionGrupal }.
- [ ] 2.2 Puente de contratación: POST solo esos 3 datos al Hermes Agent de /home/support/. Sin exponer lista de candidatos.

## 3. Evaluador de Soporte

- [ ] 3.1 Script /home/support/hiring-evaluator.py: recibe los 3 mínimos, filtra candidatos de DB que los superen, pondera 4 factores (skill + satPersonal + satGrupal + volumen), genera top 3.
- [ ] 3.2 Resultado: hiring-result-{taskId}.json se escribe en el sandbox del árbol.

## 4. Skill de Ari

- [ ] 4.1 Actualizar skill trust-maker: agregar workflow "Clasificación de árbol" y "Solicitud de contratación".

## 5. Integration Test

- [ ] 5.1 Crear árbol con descripción → verificar tree-classification.json generado → sync a DB. Simular contratación: Ari genera request → Support Agent evalúa → resultado en sandbox.
