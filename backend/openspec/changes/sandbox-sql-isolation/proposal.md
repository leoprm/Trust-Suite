# Proposal: Sandbox SQL Isolation

**Status:** proposed
**Created:** 2026-05-19
**Author:** Hermes (Leo)

## Problem

Ari (Hermes Agent del árbol Trust) pudo consultar directamente MySQL (`mysql -u trust_suite -proot -e "SELECT id, name, telegramChatId FROM trust_web.Tree WHERE telegramChatId = '-5066010052'"`) desde la terminal del agente, obteniendo datos de árboles ajenos a su sandbox.

El sandbox actual solo aísla **filesystem** (rutas bajo `/home/trustmaker/trees/<treeId>/`). MySQL está en `localhost:3306` y el agente tiene acceso completo a terminal → puede ejecutar queries arbitrarias a cualquier tabla.

Esto es una brecha de seguridad cross-tree. Cualquier Ari puede leer/escribir datos de cualquier árbol, usuario, o configuración del sistema.

## Solution

Dos capas de defensa:

1. **Network isolation (iptables):** Bloquear tráfico al puerto MySQL (3306) desde el usuario que ejecuta el agente Hermes. Esto es la defensa técnica primaria — ni siquiera con credenciales el agente puede conectarse.

2. **Sandbox SQL API endpoint:** Exponer `POST /api/trees/:treeId/sandbox/query` que reciba una query SQL y automáticamente inyecte `WHERE treeId = :treeId` en el WHERE clause. Solo queries `SELECT`. Rate-limited.

3. **System prompt hardening:** Actualizar `hermesBridge.ts` para mencionar explícitamente la prohibición de acceso directo a MySQL y redirigir al endpoint sandbox/query.

## Scope

- Backend: nuevo endpoint + iptables rule script + system prompt update
- No requiere cambios en frontend ni bot
- No rompe funcionalidad existente
