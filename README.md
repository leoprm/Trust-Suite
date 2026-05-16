# Trust Maker v4

**Comunidades que se organizan solas — desde Telegram, con IA autónoma y aislamiento real.**

Trust Maker v4 es la evolución chat-first del ecosistema **Trust**: un marco socioeconómico descentralizado donde las comunidades expresan necesidades, las transforman en trabajo verificable y construyen reputación confiable. Todo desde Telegram, conversando con @TrustMakerBot.

Está impulsado por **Hermes Agent** corriendo bajo un usuario dedicado a nivel OS (`trustmaker`) con sandbox por árbol, SSH a servidores gestionados, y cero acceso a tu sistema.

---

## ⚡ Instalación rápida (para IAs y humanos)

**Prerrequisito: Hermes Agent instalado.**

```bash
# 0. Instalar Hermes Agent (si no lo tienes)
curl -fsSL https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh | bash

# 1. Clonar y entrar
git clone https://github.com/leoprm/Trust-Suite.git
cd Trust-Suite && git checkout trust-maker && cd backend

# 2. Dependencias
npm install

# 3. Configurar .env
cp .env.example .env
# Editar .env con: TELEGRAM_BOT_TOKEN, DATABASE_URL, JWT_SECRET, HERMES_API_SERVER_KEY

# 4. Crear usuario aislado trustmaker (Hermes Agent dedicado)
sudo useradd -m -s /bin/bash trustmaker
sudo usermod -aG $USER trustmaker

# 5. Instalar Hermes Agent como trustmaker
sudo -u trustmaker bash -c "$(curl -fsSL https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh)"

# 6. Configurar perfil trustmaker (ver docs/hermes-trustmaker-setup.md)
#    - Puerto API: 8644
#    - TTS: deshabilitado
#    - Approvals: smart
#    - SOUL.md: identidad "Ari"

# 7. Iniciar
# Terminal 1 — Backend Trust Maker
npx tsx src/index.ts

# Terminal 2 — Hermes Agent (trustmaker)
sudo -u trustmaker /home/trustmaker/.hermes/hermes-agent/venv/bin/hermes gateway run
```

Accesos:
- **API**: `http://localhost:3100`
- **Hermes Agent**: `http://localhost:8644`
- **Telegram**: `@TrustMakerBot`

---

## 🔒 Aislamiento real

Trust Maker corre con **dos usuarios de sistema separados**:

| Componente | Usuario | Acceso |
|---|---|---|
| Backend + Bot | tu usuario | Normal |
| Hermes Agent | `trustmaker` | **Aislado** — no puede leer `/home/$USER/` |

Hermes Agent (trustmaker) ejecuta comandos de sandbox y SSH **sin acceso al sistema host**. Incluso un prompt injection no compromete tus archivos personales.

Cada árbol tiene su propio sandbox (`~/trees/{treeId}/`) con path isolation, timeout 5 min, y output cap 50 KB.

---

## 🧬 Trust DNA

Trust parte de una premisa simple: **las necesidades reales deben ser el punto de partida de la economía, la política y el trabajo**, no la especulación ni la captura por capital.

- **Transparencia** — sin ella no hay confianza. Procesos, votaciones, presupuestos y reglas deben ser auditables.
- **Eficiencia** — sin ella no hay futuro. Reducir duplicación, desperdicio y fricción innecesaria.
- **Autonomía** — sin ella no hay libertad. Cada comunidad (Tree) tiene soberanía real bajo reglas claras.
- **Adaptabilidad** — sin ella no hay verdadera comprensión. Trust evoluciona por crítica, evidencia y votación.

[Leer DNA completo →](docs/TRUST-DNA.md)

---

## 🏗️ Arquitectura

```
┌──────────────────────────────────────────────────┐
│  Telegram @TrustMakerBot (chat-first)            │
│  Comandos / + conversación natural + replies     │
└──────────────────┬───────────────────────────────┘
                   │ Hermes Bridge
                   ▼
┌──────────────────────────────────────────────────┐
│  Trust Maker API (:3100)                         │
│  Express + Prisma + MySQL                        │
│                                                  │
│  /api/trees/:id/sandbox/exec|read|write          │
│  /api/servers/:id/exec-agent (SSH)              │
└──────────────────┬───────────────────────────────┘
                   │ API key auth
                   ▼
┌──────────────────────────────────────────────────┐
│  Hermes Agent — trustmaker (:8644)               │
│  Usuario dedicado · Aislamiento OS-level         │
│  Sandbox exec · SSH managed servers              │
└──────────────────────────────────────────────────┘
```

---

## 🖥️ Sandbox por árbol

Cada árbol recibe un workspace aislado con su propio puerto TCP (4100–4999).

### Endpoints (API key auth)

| Método | Ruta | Descripción |
|---|---|---|
| `POST` | `/api/trees/:id/sandbox/exec` | Ejecutar comando |
| `POST` | `/api/trees/:id/sandbox/read` | Leer archivo |
| `POST` | `/api/trees/:id/sandbox/write` | Escribir archivo |
| `GET` | `/api/trees/:id/sandbox` | Estado del sandbox |
| `POST` | `/api/trees/:id/sandbox` | Crear sandbox (JWT) |
| `DELETE` | `/api/trees/:id/sandbox` | Destruir sandbox (JWT) |

**Ejemplo — ejecutar comando:**
```bash
curl -X POST http://localhost:3100/api/trees/abc123/sandbox/exec \
  -H "Authorization: Bearer $HERMES_API_SERVER_KEY" \
  -H "Content-Type: application/json" \
  -d '{"command": "ls -la"}'
```

### Seguridad del sandbox
- **Path isolation**: no puede salir del directorio del árbol
- **Timeout**: 30s default, 5 min máximo
- **Output cap**: 50 KB stdout/stderr
- **Sin acceso al sistema host**: el agente corre como `trustmaker`

---

## 🔑 Managed Servers (SSH)

Los árboles pueden gestionar servidores remotos vía SSH. Hermes Agent ejecuta comandos usando el endpoint con API key.

### Endpoints

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `POST` | `/api/servers` | JWT | Registrar servidor |
| `GET` | `/api/servers/:id/status` | JWT | Estado |
| `DELETE` | `/api/servers/:id` | JWT | Eliminar |
| `POST` | `/api/servers/:id/exec` | JWT (humano) | Ejecutar comando |
| `POST` | `/api/servers/:id/exec-agent` | API key | Ejecutar comando (agente) |

### Seguridad SSH
- **Key encryption**: la clave SSH se almacena encriptada en DB
- **Key scrubbing**: la clave desencriptada se limpia de memoria inmediatamente
- **Rate limiting**: 10 comandos/minuto por servidor
- **treeId obligatorio**: el agente solo ejecuta en servidores de su árbol
- **Health checks**: cada 15 minutos, marca servidores UNREACHABLE

---

## 💰 Reglas económicas

Trust Maker separa estrictamente dos formas de valor:

| Capa | Rol | Regla |
|---|---|---|
| **Fiat** | Ledger externo | Financia recursos e infraestructura. **No compra autoridad.** |
| **XP** | Reputación verificable | Se gana con trabajo, no se compra. |

---

## 📁 Estructura del proyecto

```
TrustMaker/
├── backend/
│   ├── prisma/           # Schema y migraciones
│   └── src/
│       ├── bot/          # Telegram @TrustMakerBot
│       │   ├── index.ts        # Polling, comandos, Hermes Bridge
│       │   ├── hermesBridge.ts # Puente bot → Hermes Agent
│       │   ├── commands.ts     # /info, /crea, /vota, etc.
│       │   └── ...
│       ├── controllers/  # treeSandbox, server, concierge, etc.
│       ├── services/     # treeSandbox, sshGateway, encryption
│       └── routes/       # sandbox, server, tree, agent
├── docs/
└── README.md
```

---

## 📜 Documentación

| Documento | Contenido |
|---|---|
| [TRUST-DNA.md](docs/TRUST-DNA.md) | DNA constitucional completo |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | Stack técnico, API, modelo de datos |
| [openspec/](openspec/) | Propuestas de cambios |

---

**Trust Maker v4** — fork del [Trust original](https://github.com/TrustFirstUser/Trust).  
Licencia: MIT.
