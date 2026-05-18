# Ari Obsidian Vaults — Propuesta

**Status:** Draft  
**Autor:** Leo + Hermes  
**Fecha:** 2026-05-18  

## Problema

Ari no tiene memoria estructurada de los archivos y decisiones del árbol. Cada vez que le preguntan algo, responde "de memoria" sin poder consultar contexto histórico. Las conversaciones se guardan pero como texto plano difícil de navegar.

## Solución

Una **vault Obsidian por sandbox** — no la aplicación, sino el formato: archivos `.md` con frontmatter YAML y `[[wikilinks]]` entre notas. Ari escribe notas cada vez que se crea/modifica un archivo o se toma una decisión, y las consulta para responder con contexto.

Workers sin árbol tienen su propia vault con historial de tareas, evaluaciones y skills.

## Principios

1. **Formato, no aplicación** — `.md` + YAML + `[[links]]`. Cero instalación.
2. **Sandbox-native** — cada vault vive en `<sandbox>/obsidian/`, accesible vía API existente
3. **Auto-generado por Ari** — el humano no escribe notas, Ari lo hace al observar eventos
4. **Graph-ready** — si un humano abre la vault en Obsidian app, ve el grafo de relaciones

## Componentes nuevos

1. **Vault scaffold** — estructura `obsidian/` + `.obsidian/` config al crear sandbox
2. **Ari note-taking** — system prompt update para que Ari escriba notas al observar archivos
3. **Ari note-searching** — antes de responder, Ari busca en su vault para contexto

## Tareas estimadas

4-5 tareas Kanban (~80 LOC + system prompt changes)
