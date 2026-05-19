# Inter-Tree Bridge + Sub-Tree Read Access — Propuesta

**Status:** Draft  
**Autor:** Leo + Hermes  
**Fecha:** 2026-05-18  

## Problema

Los árboles son silos aislados. Las IAs no pueden comunicarse entre sí. Un sub-árbol no puede acceder a datos del padre. Leo tiene que saltar entre grupos para hablar con cada IA.

## Solución

Dos sistemas:

### A. Inter-Tree Bridge (grupo Telegram)
Un **grupo único "🌉 Trust Bridge"** donde el Bridge Manager enruta mensajes de Leo a las IAs relevantes usando keywords. Las IAs responden identificándose con el nombre de su árbol.

### B. Sub-Tree Read Access
Un sub-árbol obtiene acceso de **solo lectura** a TODO el sandbox del árbol padre: obsidian, media, conversaciones, archivos.

## Principios

1. **Bridge enruta, IAs responden** — el Bridge tiene las keywords, no las IAs
2. **Solo lectura para sub-árboles** — leen todo del padre, no pueden escribir
3. **Identificación obligatoria** — toda respuesta comienza con "🌳 NombreÁrbol:"
4. **Aislamiento preservado** — las IAs no pueden iniciar comunicación entre ellas
5. **Keywords del objetivo** — derivadas de la descripción inicial del árbol

## Componentes nuevos

1. **Bridge Manager** — servicio en `/home/support/bridge/` que enruta mensajes
2. **Keyword registry** — por árbol, extraídas de su objetivo/descripción
3. **Sandbox read bridge** — API que permite a un sub-árbol leer archivos del padre
4. **Grupo Telegram** — configuración del grupo Trust Bridge
5. **Formato de respuesta** — prefijo obligatorio + enrutamiento de vuelta

## Tareas estimadas

6 tareas Kanban (~250-300 LOC)
