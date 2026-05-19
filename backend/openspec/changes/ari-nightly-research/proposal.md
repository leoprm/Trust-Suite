# Ari Nightly Research Agent — Propuesta

**Status:** Draft  
**Autor:** Leo + Hermes  
**Fecha:** 2026-05-18  

## Problema

Los árboles acumulan conversaciones valiosas que no se analizan. Oportunidades, riesgos y referencias externas quedan enterradas en el chat. No hay investigación proactiva que conecte lo que se habla con información del mundo real.

## Solución

Un **agente Kanban nocturno** que cada medianoche:
1. Lee la conversación guardada del árbol (últimos 90 días)
2. Extrae términos clave relacionados con el objetivo del árbol
3. Busca referencias en internet para cada término
4. Escribe notas en `obsidian/research/` con: definición, referencia web, cita del chat, archivos cercanos
5. Genera resumen de oportunidades, riesgos y soluciones → `obsidian/decisions/`

## Principios

1. **Sandbox-native** — todo dentro del sandbox del árbol, sin acceso externo
2. **Cita textual** — cada nota incluye timestamp + contexto del chat original
3. **Archivos cercanos** — ventana de ±5 min alrededor de cada mención, referenciados en la nota
4. **Investigación web** — búsqueda real de términos en internet para enriquecer
5. **Resumen accionable** — al final: oportunidades, riesgos, soluciones

## Componentes nuevos

1. **Keyword extractor** — extrae términos del chat relacionados con el objetivo del árbol
2. **Web researcher** — busca cada término en internet, guarda resultados
3. **Note writer** — escribe notas en formato Obsidian con citas y referencias
4. **Summary generator** — consolida hallazgos en resumen diario
5. **Cron job** — dispara el pipeline cada medianoche por árbol

## Tareas estimadas

5 tareas Kanban (~200 LOC)
