# Tasks — Skills Cross-Árbol Automáticas

## 1. Schema + Migración

- [ ] 1.1 Agregar modelo TreeSkill a schema.prisma: id, treeId, userId, skill, xp, level, updatedAt. @unique([userId, treeId, skill]). Migración + push.

## 2. Cron Aggregator

- [ ] 2.1 Crear crossTreeSkillAggregator.ts: leer TreeSkill, agrupar por (userId, skill), promediar level/xp solo árboles donde existe, upsert WorkerSkill. Ejecutar diario a medianoche.

## 3. Ari Skill Update

- [ ] 3.1 Actualizar skill trust-maker: Ari debe guardar TreeSkill cuando evalúa interacciones del usuario (al detectar habilidades demostradas).

## 4. Eliminar Registro Manual

- [ ] 4.1 Quitar o deshabilitar comando /skills del bot de soporte que pide declaración manual. Reemplazar por lectura de WorkerSkill.

## 5. Integration Test

- [ ] 5.1 Verificar: crear TreeSkill para 2 árboles → correr aggregator → WorkerSkill actualizado con promedios correctos. Skill ausente en un árbol no divide el promedio.
