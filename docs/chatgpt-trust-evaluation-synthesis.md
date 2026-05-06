# Síntesis de conversación previa — Evaluación y evolución de Trust Suite

Fuente: ChatGPT-Evaluación sistema Trust  
Propósito: convertir la conversación previa con otra IA en contexto técnico accionable para el desarrollo de **Trust Suite**.

> Este documento no reemplaza `trust-adn-implementation-context.md`. Ese archivo resume la visión constitucional de Trust ADN. Este resume la evolución práctica/producto discutida en la conversación: qué quedó vigente, qué quedó obsoleto, qué módulos se definieron y qué falta implementar/verificar.

---

## 1. Lectura general

La conversación funciona como un historial versionado de Trust:

1. **Trust ADN**: visión socioeconómica completa.
2. **Estrategia V5**: enfoque defensivo/resiliente, con Hybrid Bridge, anonimato, fundación, sucesión y despliegue largo.
3. **Trust Lite**: primera simplificación ejecutable.
4. **Trust Suite**: evolución modular práctica, centrada en tres PWAs iniciales.
5. **V6**: versión más madura para pilotos: seguridad, privacidad, ledger fiat, autosustento, necesidades externas, exportabilidad y flujos comerciales.

La línea de evolución es clara:

> **Trust deja de presentarse como civilización alternativa y pasa a presentarse como una suite útil que convierte necesidades en trabajo verificable, reputación y coordinación confiable.**

La frase central que resume el producto:

> **Trust Suite transforma necesidades en tareas, tareas en evidencia, evidencia en reputación, reputación en oportunidades, y necesidades persistentes no resueltas en señales para atraer soluciones externas sin entregar el control del sistema.**

---

## 2. Decisiones vigentes

### 2.1 Trust Suite parte con tres PWAs

La suite inicial vigente es:

- **Trust Lite**: capa comunitaria/política.
- **Branch OS**: capa operativa/comercial.
- **Trace Lite**: capa reputacional.

Apps futuras:

- **Trust Wallet**: Berries y economía interna.
- **Trust Insight**: señales agregadas de necesidades persistentes no resueltas.
- **Trust Maker**: constructor de implementaciones modulares de Trust.
- **Trust Pro**: versión avanzada que reintroduce módulos pesados del Trust ADN.

### 2.2 Ciclo mínimo del MVP

El flujo que debe funcionar antes de pilotos:

```text
Necesidad → Rama → Tarea → Evidencia → Auditoría → XP → Trace básico
```

Y para casos comerciales:

```text
Cliente externo → Necesidad Externa → Puntos de Alcance → Soluciones → Presupuesto → Aprobación → Tareas → Evidencia → Auditoría → Entrega → Pago → XP → Trace Lite
```

### 2.3 Trust Core API como columna vertebral

La conversación sugiere que las tres PWAs no deben ser apps aisladas, sino vistas/modos sobre un núcleo común:

- identidad;
- permisos;
- Trees;
- necesidades;
- ramas;
- tareas;
- evidencia;
- auditorías;
- XP;
- Trace;
- privacidad;
- EventLog;
- exportabilidad;
- economía separada.

### 2.4 Narrativa pública vigente

No presentar Trust como revolución total.

Narrativa recomendada:

> **Tres PWAs funcionando para convertir necesidades comunitarias y externas en tareas verificables, presupuestos, reputación y coordinación confiable.**

La novela, la Caja del Esfuerzo, Turtle completo, Gaia, Nutrients y protocolos civilizatorios quedan como horizonte/lore/futuro, no como pitch inicial.

---

## 3. Decisiones obsoletas o desplazadas

Estas ideas no necesariamente se eliminan, pero ya no son el centro del desarrollo actual:

### 3.1 Estrategia V5 como eje principal

V5 se evaluó como potente pero demasiado defensiva. Quedan desplazados como centro:

- anonimato permanente;
- heartbeat criptográfico;
- dead-man switch;
- legal firewall como narrativa principal;
- cronograma de 20-40 años;
- lógica de “protocolo perseguido”.

La estrategia actual debe ser más sobria: utilidad, pilotos, seguridad, legalidad, comunidad y modularidad.

### 3.2 Proto-Turtle / Turtle pesado en el MVP

El MVP no debe intentar implementar Turtle completo. La solución vigente para evitar captura es:

- código abierto;
- exportabilidad;
- Tree interno de mejoras;
- forks/portabilidad;
- servidores alternativos;
- módulos activables por madurez.

### 3.3 Trust Oracle / Big Data externo extractivo

La idea de vender inteligencia estratégica libremente a empresas queda desplazada.

Versión vigente:

> **Trust Insight no vende la brújula central de Trust; publica señales agregadas de necesidades persistentes que Trust aún no puede resolver.**

### 3.4 Búsqueda externa de talento como motor principal

Trace Lite puede permitir compartir perfil, pero la extracción masiva de talento hacia empresas externas es un riesgo.

Dirección vigente:

- no vender acceso irrestricto al talento;
- traer necesidades externas hacia Trust;
- transformar búsqueda en colaboración/encargos;
- empresas externas deben integrarse al ecosistema o traer trabajo hacia él.

### 3.5 Fiat como moneda nativa equivalente a Berries

Explícitamente rechazado.

No:

```text
Este Tree usa fiat en vez de Berries.
```

Mejor:

```text
Este Tree usa fiat para interacción externa y Berries para circulación interna cuando estén activas.
```

---

## 4. Arquitectura de producto vigente

### 4.1 Trust Lite

Pregunta central:

> **¿Qué necesita la comunidad y cómo se organiza para resolverlo?**

Entidades clave:

- Tree;
- Persona;
- Necesidad;
- Idea;
- Rama;
- Tarea;
- votación/priorización;
- miembros;
- visibilidad;
- ramas hashtag.

UX recomendada para necesidades:

- usuario califica de **1 a 10**;
- el sistema reparte internamente puntos ocultos;
- así se conserva escasez democrática sin obligar al usuario a manejar puntos manuales.

Modelo sugerido:

```ts
NeedImportanceVote {
  userId
  needId
  treeId
  score // 1-10
}
```

### 4.2 Branch OS

Pregunta central:

> **¿Qué trabajo hay que hacer y cómo lo ejecutamos?**

Funciones vigentes:

- tareas;
- evidencia;
- dificultad 1-10;
- auditoría probabilística;
- feed operativo;
- calendario futuro;
- ledger fiat;
- comprobantes;
- presupuestos;
- necesidades externas;
- ramas de autosustento.

Regla de auditoría:

> **Trust no necesita detectar toda manipulación; necesita que manipular tenga suficiente riesgo y penalización como para dejar de convenir.**

Auditoría MVP:

- 20% de tareas auditadas probabilísticamente;
- discrepancia pequeña: respetar ejecutor;
- discrepancia grande: activar revisión ampliada;
- evidencia sensible no pública por defecto.

### 4.3 Trace Lite

Pregunta central:

> **¿Qué ha demostrado saber hacer esta persona?**

Trace Lite debe ser un currículum vivo basado en:

- tareas completadas;
- dificultad;
- evidencia;
- auditorías;
- ramas dominadas;
- XP;
- trayectoria;
- badges/habilidades;
- visibilidad controlada.

Principio reputacional:

> **El pasado debe estar disponible, pero no debe verse como presente.**

Esto implica **desvanecimiento temporal visual**:

- actividad reciente destacada;
- eventos antiguos con menor peso visual;
- filtros 30/90/180 días;
- historial completo opcional;
- contexto visible para evitar castigo reputacional eterno.

### 4.4 Trust Wallet

No es prioridad de primer lanzamiento completo, pero debe respetar la economía definida.

Funciones futuras:

- saldo de Berries;
- historial;
- pagos;
- Berries próximas a vencer;
- ingresos esperados;
- pagos recibidos/enviados;
- vencimiento por lote;
- Sponsor Wallet limitada.

Dirección vigente de Berries:

> **Emisión continua + vencimiento individual a 12 meses.**

Modelo sugerido:

```ts
BerryLot {
  id
  userId
  treeId
  amountOriginal
  amountRemaining
  issuedAt
  expiresAt
  sourceType
  sourceId
}
```

```ts
BerryTransaction {
  id
  fromUserId
  toUserId
  treeId
  amount
  type
  createdAt
  relatedTaskId
}
```

Regla operativa:

> Gastar primero las Berries que vencen antes.

### 4.5 Trust Insight

Versión vigente:

> **Radar de necesidades persistentes no resueltas, no producto de Big Data extractivo.**

Flujo de tres niveles:

```text
1. Buscar solución interna Trust.
2. Si no hay capacidad, abrir convocatoria a personas externas.
3. Si eso falla, derivar a empresas externas.
```

Modelos sugeridos:

```ts
InsightSignal {
  id
  needId
  treeId
  status
  persistenceScore
  capacityGap
  currentLevel // INTERNAL, EXTERNAL_PEOPLE, EXTERNAL_COMPANY
}
```

```ts
InsightJobOpening {
  id
  insightSignalId
  skillRequired
  paymentFiat
  paymentBerries
  status
  deadline
}
```

```ts
CorporateReferral {
  id
  insightSignalId
  providerName
  status
}
```

### 4.6 Trust Maker

Futuro constructor de versiones de Trust.

Principio:

> **Módulos compatibles por ADN, activables por madurez.**

Trust Maker debería manejar:

- dependencias entre módulos;
- plantillas por tipo de Tree;
- advertencias de riesgo;
- módulos bloqueados por madurez;
- configuración exportable;
- certificación “Trust Compatible”.

---

## 5. Reglas económicas vigentes

### 5.1 Separación constitucional

Regla central:

> **Fiat financia recursos externos; Berries coordinan circulación interna; XP certifica contribución.**

Otra formulación:

> **Fiat se registra. Berries circulan. XP acredita.**

Prohibiciones:

- Fiat no compra XP.
- Fiat no compra nivel.
- Fiat no compra votos.
- Fiat no compra reputación.
- Fiat no altera pesos expertos.
- Fiat no compra autoridad.
- XP no se vende.
- Berries no se convierten directamente en poder político.

### 5.2 Protocolo de Contención Fiat / Firewall Fiat

Fiat debe vivir en:

- Branch OS Ledger;
- Ramas de Autosustento;
- Encargos Externos;
- presupuestos;
- pagos de materiales;
- pagos de sueldos;
- impuestos;
- reservas;
- infraestructura;
- Fondo del Tree.

Reglas:

1. Fiat siempre queda etiquetado como fiat.
2. Fiat no se convierte automáticamente en XP.
3. Fiat no aumenta nivel.
4. Fiat no compra votos.
5. Fiat no altera pesos expertos.
6. Fiat solo financia recursos, tareas, infraestructura, sueldos, impuestos o reservas.
7. Todo ingreso fiat entra por Rama de Autosustento, Encargo Externo o Libro Fiat.
8. El excedente fiat va al Fondo del Tree, no a poder político.
9. Si hay conversión fiat/Berries, debe ser limitada, trazable y no especulativa.

### 5.3 Modos económicos sugeridos

La conversación recomienda separar modos para adopción gradual:

```ts
TreeEconomyMode:
- NO_ECONOMY
- LEGACY_FIAT
- BERRIES_LATENT
- BERRIES_ACTIVE
- TRUST_FULL
```

Interpretación:

- **NO_ECONOMY**: solo coordinación básica.
- **LEGACY_FIAT**: empresas/pilotos usan fiat para contabilidad externa.
- **BERRIES_LATENT**: Berries simuladas o preparadas, sin economía plena.
- **BERRIES_ACTIVE**: circulación interna real.
- **TRUST_FULL**: economía interna + gobernanza madura + módulos avanzados.

### 5.4 Berries

Las Berries no son fiat ni puntos simbólicos. Son:

> **Valor interno con caducidad, diseñado para mover trabajo y recursos, no para acumular riqueza pasiva.**

Diseño vigente:

- emisión continua;
- vencimiento individual a 12 meses;
- ligadas a trabajo real, auditoría, niveles y reglas transparentes;
- gasto FIFO por vencimiento;
- sin exchange libre fiat/Berries al inicio.

Evitar:

- una sola emisión anual sin continuidad;
- decaimiento opaco que el usuario no entienda;
- equivalencia directa con fiat;
- mercado abierto fiat ↔ Berries.

### 5.5 Necesidades Externas y Puntos de Alcance

Una necesidad externa no es una necesidad interna del Tree.

Regla:

> **Clientes externos no usan Puntos de Necesidad internos. Usan Puntos de Alcance para expresar preferencias del encargo.**

Ejemplos de Puntos de Alcance:

- bajo costo: 8;
- rapidez: 7;
- seguridad: 10;
- diseño: 5;
- escalabilidad: 9;
- mantenimiento: 6.

Modelos sugeridos:

```ts
ExternalNeed {
  id
  treeId
  title
  description
  clientType
  clientName
  status
  createdAt
}
```

```ts
ExternalAgent {
  id
  externalNeedId
  name
  email?
  organization?
  role
}
```

```ts
ScopePreference {
  id
  externalNeedId
  label
  score // 1-10
}
```

```ts
SolutionProposal {
  id
  externalNeedId
  creatorId
  description
  estimatedFiat
  estimatedBerries
  estimatedDuration
  riskLevel
  status
}
```

### 5.6 Ramas de Autosustento

Deben separarse de ramas normales.

Modelos sugeridos:

```ts
IdeaType:
- INTERNAL_NEED
- AUTOSUSTENTO
```

```ts
BranchType:
- NORMAL
- HASHTAG
- AUTOSUSTENTO
- EXTERNAL_CONTRACT
```

Las Ideas de Autosustento:

- no usan Puntos de Necesidad;
- se votan aparte;
- pasan por ficha de viabilidad;
- se convierten en Ramas de Autosustento solo si tienen apoyo y factibilidad.

### 5.7 Excedente de sostenibilidad

No buscar “ganancia cero” obligatoria.

Regla:

> **Las Ramas de Autosustento no existen para maximizar lucro, pero sí deben generar excedente suficiente para sostener, proteger y expandir al Tree.**

Distribución conceptual:

- materiales;
- trabajo;
- operaciones;
- impuestos;
- mantenimiento;
- reserva;
- reposición;
- Fondo del Tree.

Modelos sugeridos:

```ts
TreeFund {
  id
  treeId
  fiatBalance
  berryBalance?
  reserveBalance
}
```

```ts
SustainabilitySplit {
  branchId
  materialsPct
  laborPct
  operationsPct
  taxPct
  reservePct
  treeFundPct
}
```

### 5.8 Branch OS Ledger

El ledger fiat debe certificar transacciones, no solo listarlas.

Estados sugeridos:

```ts
FiatVerificationStatus:
- DECLARED
- BACKED_BY_RECEIPT
- RECONCILED
- AUDITED
- API_VERIFIED
```

Cada transacción debería poder vincularse con:

- comprobante;
- tarea;
- necesidad;
- cliente externo;
- rama;
- auditor;
- conciliación;
- revisión.

---

## 6. Gobernanza y expertos

### 6.1 Influencia experta

Principio:

> **La influencia experta se gana con dificultad demostrada, no con autoridad declarada.**

Reglas propuestas:

- influencia gremial entre **20% y 80%**;
- depende de dificultad promedio real asumida por el gremio;
- expertos determinan pesos técnicos, no reemplazan la voluntad general;
- expertos dorados tienen más peso individual, pero no control absoluto.

### 6.2 Expertos verdes y dorados

Proporción vigente recomendada:

- **40% expertos dorados**;
- **60% expertos verdes**.

Principio:

> **La élite técnica tiene más responsabilidad, pero no poder absoluto.**

---

## 7. Privacidad, evidencia y trazabilidad

### 7.1 Regla principal

> **Resultado público, evidencia controlada por permisos.**

O:

> **Trust debe ser transparente en decisiones y resultados, pero cuidadoso con los archivos crudos.**

### 7.2 Por qué no publicar toda evidencia

Riesgos:

- datos personales accidentales;
- menores, rostros, direcciones, boletas, clientes;
- castigo reputacional excesivo;
- vergüenza y menor participación;
- secretos operativos;
- exposición de vulnerabilidades;
- doxxing/acoso;
- problemas legales.

### 7.3 Modelo de visibilidad por capas

- **Pública**: resumen, estado, fechas, hashes, reglas aplicadas.
- **Tree**: contexto y entregables no sensibles.
- **Auditoría**: evidencia completa necesaria.
- **Disputa/legal**: historial completo bajo permisos.
- **Privada**: datos personales/comprobantes/archivos delicados.

### 7.4 Clasificación de evidencia

Al subir evidencia, preguntar:

1. Pública.
2. Visible para el Tree.
3. Solo participantes y auditores.
4. Privada/sensible.
5. Confidencial.

Pregunta obligatoria:

> ¿Este archivo contiene datos personales, rostros, direcciones, documentos, clientes o menores?

Si sí, bloquear publicación pública por defecto.

### 7.5 Hashes públicos

Se puede preservar verificabilidad sin exposición usando SHA-256:

- archivo privado;
- hash público;
- fecha;
- resultado de auditoría;
- reglas aplicadas;
- EventLog interno.

Principio:

> **Verificabilidad sin exposición.**

---

## 8. Seguridad y configuración

### 8.1 Riesgos técnicos concretos detectados en la conversación

- Inconsistencia `req.user.id` vs `req.user.userId`.
- Enums usados que podrían no existir en Prisma.
- CORS abierto con `origin: '*'`.
- `.env` dentro de ZIP compartible.
- `node_modules`, `dist`, logs y uploads dentro del ZIP.
- `/uploads` servido como estático sin permisos.
- Falta de EventLog estructural.

### 8.2 CORS por entorno

Regla:

> **En desarrollo puedes permitir localhost. En producción, solo dominios oficiales de Trust Suite.**

Desarrollo:

```env
NODE_ENV=development
CORS_ALLOWED_ORIGINS=http://localhost:5173,http://localhost:5174,http://localhost:5175
```

Producción:

```env
NODE_ENV=production
CORS_ALLOW_ALL_IN_DEV=false
CORS_ALLOWED_ORIGINS=https://trustlite.example.com,https://branchos.example.com,https://tracelite.example.com
```

### 8.3 Producción mínima

Antes de usuarios reales:

- CORS restringido;
- JWT secretos fuertes;
- HTTPS;
- rate limiting;
- Helmet/security headers;
- logs sin secretos;
- uploads privados o URLs firmadas;
- backups DB;
- debug apagado;
- configuración separada dev/staging/prod.

---

## 9. Roadmap V6 consolidado

### Etapa 0 — Actual / estabilización

- Estabilizar tres PWAs.
- Verificar build completo.
- Revisar login y navegación.
- Confirmar interoperabilidad básica.

### Etapa 1 — Suite inicial

- Trust Lite.
- Branch OS.
- Trace Lite.
- Trust Core API.
- Auth común.
- permisos.
- EventLog.
- privacidad mínima.
- evidencia segura.
- exportación básica.

### Etapa 2 — Pilotos controlados

Pilotos posibles:

- familia;
- grupo de padres;
- comunidad cercana;
- pequeño negocio local;
- equipo de trabajo pequeño.

Solo activar ciclo mínimo:

```text
Necesidad → Tarea → Evidencia → Auditoría → XP → Trace básico
```

### Etapa 3 — Legal, seguridad e infraestructura

Pedir apoyo en:

- constitución/figura legal;
- términos y privacidad;
- red team;
- revisión de código;
- servidor/backups;
- dominios;
- despliegue.

### Etapa 4 — Branch OS Comercial

- Necesidades Externas.
- Puntos de Alcance.
- Soluciones con presupuesto.
- Ledger fiat certificado.
- Ramas de Autosustento.
- Ideas de Autosustento.
- Excedente de sostenibilidad.

### Etapa 5 — Trace Lite público

- perfil exportable;
- capas de privacidad;
- desvanecimiento temporal;
- compartir evidencia pública opcional;
- limitar extracción de talento.

### Etapa 6 — Trust Wallet

- BerryLots con vencimiento;
- pagos internos;
- proyección de vencimientos;
- separación total de fiat/Berries/XP.

### Etapa 7 — Trust Insight

- señales de necesidades persistentes;
- tres niveles: interno → personas externas → empresas;
- validación escalonada de candidatos externos;
- publicación agregada no extractiva.

### Etapa 8 — Trust Maker

- módulos activables por madurez;
- plantillas;
- dependencias;
- certificación Trust Compatible.

---

## 10. Estado estimado según la conversación

La conversación estima:

- **Arquitectura conceptual**: 7.0 / 7.0.
- **MVP implementado**: 6.7 / 7.0, si los prompts 2-16 fueron implementados correctamente.
- **Preparación para pilotos pequeños**: 6.8 / 7.0.
- **Preparación para centro de negocios**: 6.9 / 7.0.
- **Preparación para usuarios masivos**: 5.9 / 7.0.
- **Seguridad probable**: 6.2 / 7.0 hasta red team real.
- **UX usuario común**: 5.8-6.2 / 7.0 hasta probar.

Advertencia:

> Estos números son evaluación conversacional, no verificación técnica. Deben validarse con build, tests, revisión de código y flujos reales.

---

## 11. Checklist de verificación inmediata

La conversación cierra con 18 flujos críticos. Conviene convertirlos en QA manual/automatizado:

1. Correr build completo.
2. Probar login.
3. Probar cada PWA.
4. Crear un Tree real de prueba.
5. Crear necesidad interna.
6. Crear tarea.
7. Subir evidencia.
8. Auditar.
9. Ver Trace.
10. Crear Necesidad Externa.
11. Crear Puntos de Alcance.
12. Crear Solución con presupuesto.
13. Crear Rama de Autosustento.
14. Registrar ingreso/gasto fiat.
15. Adjuntar comprobante.
16. Calcular excedente.
17. Aplicar flujo mensual de Berries.
18. Exportar perfil/Tree.

Si esos 18 flujos funcionan, Trust Suite está cerca de un piloto controlado serio.

---

## 12. Prioridades accionables para desarrollo

### Prioridad 1 — antes de pilotos externos

1. Normalizar `req.user.id` vs `req.user.userId`.
2. Panel mínimo de privacidad.
3. EventLog estructural.
4. Evidencia/uploads privados por defecto.
5. CORS por entorno.
6. Exportación básica Tree/Profile.
7. Fiat como ledger externo, no moneda equivalente.
8. Limpiar cualquier ZIP/repo antes de compartir: sin `.env`, logs, uploads ni `node_modules`.

### Prioridad 2 — alineación V6

9. Necesidades Externas.
10. Puntos de Alcance.
11. Soluciones con presupuesto.
12. Ramas de Autosustento.
13. Ideas de Autosustento.
14. Excedente de sostenibilidad.
15. Branch OS Ledger con comprobantes y estados.
16. Berries con vencimiento individual de 12 meses.

### Prioridad 3 — Trust Insight

17. Insight en tres niveles.
18. Convocatorias externas.
19. Validación escalonada de candidatos.
20. Evaluadores aleatorios/adyacentes.
21. Prueba práctica por cinco evaluadores.
22. Auditoría aumentada para externos.
23. Reputación de evaluadores.

### Prioridad 4 — Branch OS avanzado

24. Pulso de Equipo.
25. Compatibilidad inferida por combinatoria.
26. Calendarios mensuales.
27. Disponibilidad semanal.
28. Preferencias de tareas.
29. Asignación automática por carga/capacidad.

### Prioridad 5 — Trace Lite avanzado

30. Desvanecimiento temporal visual.
31. Filtros por antigüedad.
32. Perfil por capas.
33. Transformar búsqueda de talento en colaboración/encargos.
34. Control granular de visibilidad.

---

## 13. Invariantes que el código debe proteger

1. **Fiat no compra autoridad.**
2. **XP no se vende.**
3. **Berries no son fiat.**
4. **Necesidades Externas no usan poder político interno.**
5. **Puntos de Alcance no son Puntos de Necesidad.**
6. **Evidencia cruda no es pública por defecto.**
7. **Toda acción sensible deja EventLog.**
8. **La exportabilidad es garantía política, no feature secundaria.**
9. **Trace muestra contribución verificable, no autopromoción.**
10. **Branch OS ejecuta trabajo; no debe convertirse en herramienta de control jerárquico.**
11. **Insight publica señales agregadas, no vende explotación de datos.**
12. **Módulos avanzados se activan por madurez, no por entusiasmo.**

---

## 14. Próximo trabajo recomendado

Antes de agregar módulos nuevos, hacer auditoría de realidad:

```text
¿Compila?
¿Corre backend?
¿Corren las tres PWAs?
¿Funciona login?
¿Funciona el ciclo mínimo?
¿Funciona evidencia privada?
¿Funciona EventLog?
¿Fiat queda separado?
¿ExternalNeed no afecta gobernanza?
¿Trace muestra datos correctos?
¿Exportación sirve?
```

Después de verificar eso, el siguiente módulo estratégico sería **Trust Insight en tres niveles**.

---

## 15. Resumen final

La conversación previa ya no debe tratarse como lluvia de ideas. Contiene una especificación práctica V6.

La dirección consolidada es:

> **Trust Suite V6 = tres PWAs iniciales + Core API + privacidad + EventLog + evidencia protegida + ledger fiat externo + necesidades externas + autosustento + Trace verificable + Berries separadas + camino posterior hacia Insight/Wallet/Maker.**

El foco actual no debería ser inventar más visión. Debería ser:

> **verificar, endurecer, simplificar UX y preparar pilotos controlados.**
