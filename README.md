# Trust Suite

**Transforma necesidades en trabajo verificable, reputación y coordinación confiable.**

Trust Suite es la implementación práctica del ecosistema **Trust**: un marco socioeconómico descentralizado para comunidades que quieren organizarse de forma transparente, eficiente y democrática. Es un fork evolutivo del [Trust original](https://github.com/TrustFirstUser/Trust) — toma su ADN constitucional y lo convierte en software funcional.

---

## 🧬 Trust DNA

Trust parte de una premisa simple: **las necesidades reales deben ser el punto de partida de la economía, la política y el trabajo**, no la especulación ni la captura por capital.

Sus axiomas constitucionales son cuatro:

- **Transparencia** — sin ella no hay confianza. Procesos, votaciones, presupuestos y reglas deben ser auditables.
- **Eficiencia** — sin ella no hay futuro. Reducir duplicación, desperdicio y fricción innecesaria.
- **Autonomía** — sin ella no hay libertad. Cada comunidad (Tree) tiene soberanía real bajo reglas claras.
- **Adaptabilidad** — sin ella no hay verdadera comprensión. Trust evoluciona por crítica, evidencia y votación.

> *"Este sistema no se impondrá por la fuerza ni por la revolución. Se adoptará de forma gradual y orgánica por conveniencia."* — Trust ADN

[Leer ADN completo →](docs/TRUST-DNA.md)

---

## 🏗️ Arquitectura del producto

Trust Suite se compone de **cuatro PWAs** sobre un núcleo común (Trust Core API):

| PWA | Propósito | Pregunta central |
|-----|-----------|------------------|
| **Trust Lite** | Capa comunitaria/política | ¿Qué necesita la comunidad y cómo se organiza? |
| **Branch OS** | Capa operativa/comercial | ¿Qué trabajo hay que hacer y cómo lo ejecutamos? |
| **Trace Lite** | Capa reputacional | ¿Qué ha demostrado saber hacer esta persona? |
| **Trust Insight** | Radar de oportunidades | ¿Qué necesidades persistentes necesitan ayuda externa? |

Las cuatro comparten: identidad, permisos, Trees, necesidades, ramas, tareas, evidencia, auditorías, XP, Trace y EventLog.

[Leer arquitectura técnica →](docs/ARCHITECTURE.md)

---

## 🔄 Ciclo mínimo

El flujo que define el MVP funcional:

```
Necesidad → Idea → Rama → Tarea → Evidencia → Auditoría → XP → Trace
```

Y para casos comerciales:

```
Cliente externo → Necesidad Externa → Solución + Presupuesto → Tareas → Evidencia → Auditoría → Entrega → XP → Trace
```

---

## 💰 Reglas económicas

Trust Suite separa estrictamente tres formas de valor:

| Capa | Rol | Regla |
|------|-----|-------|
| **Fiat** | Ledger externo | Financia recursos, infraestructura y sueldos. **No compra autoridad.** |
| **Berries** | Circulación interna | Coordinan trabajo y recursos dentro del Tree. Caducan a 12 meses. |
| **XP** | Reputación verificable | Certifica contribución real. Se gana con trabajo, no se compra. |

**Prohibiciones constitucionales:**

- Fiat no compra XP, nivel, votos, reputación ni autoridad política.
- XP no se vende.
- Berries no se convierten directamente en poder político.

[Leer reglas económicas completas →](docs/TRUST-DNA.md#4-economía-capas-y-reglas)

---

## 🌳 Actores principales

| Actor | Definición |
|-------|------------|
| **Persona** | Participante individual. Expresa necesidades, vota, contribuye, gana XP. |
| **Tree** | Comunidad autónoma. Unidad organizativa central. |
| **Branch** | Unidad de trabajo/proyecto. Resuelve necesidades mediante 8 fases. |
| **Root** | Unidad de recursos, suministro y reciclaje. |
| **Trunk** | Núcleo coordinador de un Tree. |
| **External Agent** | Cliente, sponsor o contacto externo. Trae necesidades/fiat, no autoridad. |
| **Auditor** | Revisor de tareas y evidencia. Genera confianza verificable. |
| **Expert** | Persona con credenciales Trace validadas. Pondera decisiones técnicas. |

---

## 📁 Estructura del proyecto

```
Trust Suite/
├── backend/           # Trust Core API (Express + Prisma + MySQL)
│   ├── prisma/        # Schema y migraciones
│   └── src/
│       ├── routes/    # Endpoints REST
│       ├── middleware/ # Auth, permisos, EventLog
│       └── scripts/   # Seed demo, tests
├── frontend/          # Monorepo Vite con 4 PWAs
│   ├── src/           # Código compartido + páginas
│   └── public/        # Iconos, manifiestos PWA
├── docs/              # Documentación formal
├── database/          # SQL de respaldo
├── start-lan-servers.sh  # Script de despliegue local
└── setup-local-mysql.sh  # Configuración de base de datos
```

---

## 🚀 Inicio rápido

```bash
# 1. Configurar MySQL
./setup-local-mysql.sh

# 2. Instalar dependencias
cd backend && npm install && npx prisma migrate deploy
cd ../frontend && npm install

# 3. Sembrar datos demo
cd ../backend && npx ts-node src/scripts/seed-demo.ts

# 4. Lanzar servidores
cd .. && ./start-lan-servers.sh
```

PWAs disponibles en LAN:
- Trust Lite: `http://192.168.1.103:5173`
- Branch OS: `http://192.168.1.103:5174`
- Trace Lite: `http://192.168.1.103:5175`
- Trust Insight: `http://192.168.1.103:5176`
- Backend API: `http://192.168.1.103:3100`

---

## 📜 Documentación

| Documento | Contenido |
|-----------|-----------|
| [TRUST-DNA.md](docs/TRUST-DNA.md) | ADN constitucional completo: axiomas, economía, gobernanza, ciclo de trabajo, actores |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | Stack técnico, estructura del código, API, modelo de datos, despliegue |
| [chatgpt-trust-evaluation-synthesis.md](docs/chatgpt-trust-evaluation-synthesis.md) | Síntesis V6: decisiones vigentes, obsoletas, roadmap |
| [trust-adn-implementation-context.md](docs/trust-adn-implementation-context.md) | Mapeo del ADN original a Trust Suite |

---

## 🛡️ Invariantes que el código protege

1. Fiat no compra autoridad.
2. XP no se vende.
3. Berries no son fiat.
4. Necesidades Externas no usan poder político interno.
5. Evidencia cruda no es pública por defecto.
6. Toda acción sensible deja EventLog.
7. La exportabilidad es garantía política, no feature secundaria.
8. Trace muestra contribución verificable, no autopromoción.

---

## 📍 Estado actual

Trust Suite está en **fase de prototipo funcional** con datos demo. El ciclo mínimo (Necesidad → Tarea → Evidencia → Auditoría → XP → Trace) está implementado y verificable.

Próximos hitos: pilotos controlados con comunidades reales.

---

**Trust Suite** es un fork del [Trust original](https://github.com/TrustFirstUser/Trust) por [TrustFirstUser](https://github.com/TrustFirstUser).  
Licencia: MIT (heredada del proyecto original).
