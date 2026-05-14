#!/usr/bin/env python3
"""Initialize SQLite dev.db from Trust Maker schema + seed data."""

import sqlite3
import uuid
import os
from datetime import datetime, timedelta

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "dev.db")

def now():
    return datetime.utcnow().isoformat()

def uid():
    return str(uuid.uuid4())

def init():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    c = conn.cursor()

    # ── Schema ──
    c.executescript("""
    CREATE TABLE IF NOT EXISTS Tree (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        icono TEXT DEFAULT '🌳',
        creatorId TEXT,
        admissionPolicy TEXT DEFAULT 'INVITE_ONLY',
        createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS Agent (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        description TEXT,
        type TEXT DEFAULT 'HERMES',
        createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS AgentMembership (
        id TEXT PRIMARY KEY,
        agentId TEXT NOT NULL,
        treeId TEXT NOT NULL,
        status TEXT DEFAULT 'ACTIVE',
        role TEXT DEFAULT 'MEMBER',
        level INTEGER DEFAULT 1,
        xp REAL DEFAULT 0,
        joinedAt TEXT NOT NULL,
        FOREIGN KEY (agentId) REFERENCES Agent(id),
        FOREIGN KEY (treeId) REFERENCES Tree(id),
        UNIQUE(agentId, treeId)
    );

    CREATE TABLE IF NOT EXISTS TreeMember (
        id TEXT PRIMARY KEY,
        userId TEXT NOT NULL,
        treeId TEXT NOT NULL,
        invitedById TEXT,
        status TEXT DEFAULT 'ACTIVE',
        role TEXT DEFAULT 'MEMBER',
        isAI INTEGER DEFAULT 0,
        aiProfile TEXT,
        aiProvider TEXT,
        aiModel TEXT,
        aiStatus TEXT DEFAULT 'IDLE',
        level INTEGER DEFAULT 1,
        xp REAL DEFAULT 0,
        joinedAt TEXT NOT NULL,
        FOREIGN KEY (userId) REFERENCES User(id) ON DELETE CASCADE,
        FOREIGN KEY (treeId) REFERENCES Tree(id) ON DELETE CASCADE,
        FOREIGN KEY (invitedById) REFERENCES User(id) ON DELETE SET NULL,
        UNIQUE(userId, treeId)
    );

    CREATE TABLE IF NOT EXISTS Need (
        id TEXT PRIMARY KEY,
        treeId TEXT,
        creatorId TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        importance INTEGER,
        status TEXT DEFAULT 'OPEN',
        createdAt TEXT NOT NULL,
        FOREIGN KEY (treeId) REFERENCES Tree(id)
    );

    CREATE TABLE IF NOT EXISTS Idea (
        id TEXT PRIMARY KEY,
        content TEXT NOT NULL,
        creatorId TEXT NOT NULL,
        isGlobal INTEGER DEFAULT 0,
        sourceTreeId TEXT,
        totalLikes INTEGER DEFAULT 0,
        needId TEXT,
        createdAt TEXT NOT NULL,
        FOREIGN KEY (needId) REFERENCES Need(id)
    );

    CREATE TABLE IF NOT EXISTS IdeaVote (
        id TEXT PRIMARY KEY,
        ideaId TEXT NOT NULL,
        userId TEXT NOT NULL,
        needId TEXT NOT NULL,
        weight INTEGER DEFAULT 1,
        createdAt TEXT NOT NULL,
        FOREIGN KEY (ideaId) REFERENCES Idea(id),
        UNIQUE(ideaId, userId, needId)
    );

    CREATE TABLE IF NOT EXISTS Result (
        id TEXT PRIMARY KEY,
        needId TEXT NOT NULL,
        ideaId TEXT NOT NULL,
        summary TEXT NOT NULL,
        evaluation INTEGER,
        createdBy TEXT DEFAULT 'AI',
        evaluatedById TEXT,
        evaluatedAt TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        FOREIGN KEY (needId) REFERENCES Need(id),
        FOREIGN KEY (ideaId) REFERENCES Idea(id)
    );

    CREATE TABLE IF NOT EXISTS NeedIdea (
        id TEXT PRIMARY KEY,
        needId TEXT NOT NULL,
        ideaId TEXT NOT NULL,
        matchedBy TEXT DEFAULT 'AI',
        matchScore REAL DEFAULT 0,
        createdAt TEXT NOT NULL,
        FOREIGN KEY (needId) REFERENCES Need(id) ON DELETE CASCADE,
        FOREIGN KEY (ideaId) REFERENCES Idea(id) ON DELETE CASCADE,
        UNIQUE(needId, ideaId)
    );

    CREATE TABLE IF NOT EXISTS "User" (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        email TEXT,
        password TEXT,
        role TEXT DEFAULT 'USER',
        createdAt TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_need_treeId ON Need(treeId);
    CREATE INDEX IF NOT EXISTS idx_idea_needId ON Idea(needId);
    CREATE INDEX IF NOT EXISTS idx_ideavote_ideaId ON IdeaVote(ideaId);
    CREATE INDEX IF NOT EXISTS idx_result_needId ON Result(needId);
    CREATE INDEX IF NOT EXISTS idx_agentmembership_agentId ON AgentMembership(agentId);
    """)

    # ── Seed Data (skip if already seeded) ──
    existing = c.execute("SELECT COUNT(*) as n FROM Tree").fetchone()
    if existing["n"] > 0:
        print(f"⚠️  DB already seeded ({existing['n']} trees). Skipping seed.")
        conn.close()
        print(f"📍 DB path: {DB_PATH}")
        return

    # Users
    user_ids = {}
    for name in ["HermesAgent", "alice", "bob", "carlos", "diana"]:
        row = c.execute("SELECT id FROM User WHERE username = ?", (name,)).fetchone()
        if row:
            user_ids[name] = row[0]
        else:
            uid_ = uid()
            email = f"{name.lower()}@example.com" if name != "HermesAgent" else "hermesagent@trustmaker.local"
            c.execute(
                "INSERT INTO User (id, username, email, password, role, createdAt) VALUES (?,?,?,?,?,?)",
                (uid_, name, email, None, "USER", now())
            )
            user_ids[name] = uid_
    hermes_uid = user_ids["HermesAgent"]

    # Trees
    tree0 = uid()
    tree1 = uid()
    tree2 = uid()
    trees = [
        (tree0, "🌍 Trust DAO Global", "Árbol raíz global — gobernanza descentralizada de confianza", "🌍", None, "OPEN", now()),
        (tree1, "🛡️ Ciberseguridad LATAM", "Comunidad de expertos en ciberseguridad para Latinoamérica", "🛡️", user_ids["alice"], "INVITE_ONLY", now()),
        (tree2, "🤖 AI Ethics Collective", "Ética de IA, alineación y gobernanza algorítmica", "🤖", user_ids["bob"], "OPEN", now()),
    ]
    c.executemany("INSERT OR IGNORE INTO Tree VALUES (?,?,?,?,?,?,?)", trees)

    # Agent
    agent_id = uid()
    c.execute(
        "INSERT OR IGNORE INTO Agent VALUES (?,?,?,?,?)",
        (agent_id, "HERMES", "Hermes Agent — autonomía delegada para Trust Maker", "HERMES", now())
    )

    # Agent Memberships
    memberships = [
        (uid(), agent_id, tree0, "ACTIVE", "MEMBER", 5, 420.0, now()),
        (uid(), agent_id, tree1, "ACTIVE", "MEMBER", 3, 180.0, now()),
        (uid(), agent_id, tree2, "ACTIVE", "ADMIN", 8, 750.0, now()),
    ]
    c.executemany(
        "INSERT OR IGNORE INTO AgentMembership VALUES (?,?,?,?,?,?,?,?)",
        memberships
    )

    # Tree Members (human)
    tree_members = [
        (uid(), user_ids["alice"], tree0, None, "ACTIVE", "ADMIN", 0, None, None, None, "IDLE", 10, 950.0, now()),
        (uid(), user_ids["bob"], tree0, None, "ACTIVE", "MEMBER", 0, None, None, None, "IDLE", 6, 520.0, now()),
        (uid(), user_ids["carlos"], tree1, None, "ACTIVE", "ADMIN", 0, None, None, None, "IDLE", 8, 720.0, now()),
        (uid(), user_ids["diana"], tree1, None, "ACTIVE", "MEMBER", 0, None, None, None, "IDLE", 4, 310.0, now()),
        (uid(), user_ids["alice"], tree2, None, "ACTIVE", "MEMBER", 0, None, None, None, "IDLE", 5, 440.0, now()),
        (uid(), user_ids["bob"], tree2, None, "ACTIVE", "ADMIN", 0, None, None, None, "IDLE", 9, 880.0, now()),
    ]
    c.executemany(
        "INSERT OR IGNORE INTO TreeMember VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        tree_members
    )

    # Needs
    need_ids = []
    needs_data = [
        (tree0, user_ids["alice"], "Presupuesto Q3 para herramientas de auditoría",
         "Necesitamos asignar presupuesto para licencias de herramientas de auditoría de seguridad en el Q3.", 8),
        (tree0, user_ids["bob"], "Protocolo de votación con umbrales dinámicos",
         "El sistema de votación actual usa umbrales fijos. Necesitamos umbrales que se ajusten según tamaño del árbol.", 7),
        (tree1, user_ids["carlos"], "CTF trimestral — diseño y premios",
         "Organizar un Capture The Flag trimestral para la comunidad LATAM con premios en stablecoins.", 6),
        (tree1, user_ids["diana"], "Traducción de guías OWASP al español",
         "El Top 10 de OWASP necesita traducción y adaptación al contexto regulatorio latinoamericano.", 5),
        (tree2, user_ids["alice"], "Marco de evaluación de sesgos en LLMs",
         "Crear un marco estandarizado para evaluar sesgos en modelos de lenguaje grandes.", 9),
        (tree2, user_ids["bob"], "Certificación de sistemas de IA auditables",
         "Diseñar un programa de certificación para sistemas de IA que sean auditables por terceros.", 8),
    ]
    for tree_id, creator_id, title, desc, imp in needs_data:
        nid = uid()
        need_ids.append(nid)
        c.execute(
            "INSERT INTO Need VALUES (?,?,?,?,?,?,?,?)",
            (nid, tree_id, creator_id, title, desc, imp, "OPEN", now())
        )

    # Ideas
    idea_ids = []
    ideas_data = [
        (need_ids[0], user_ids["bob"], "Usar presupuesto en $500/mes para Burp Suite Pro + Nuclei automation", 5),
        (need_ids[0], user_ids["carlos"], "Dividir presupuesto 60/40: herramientas DAST + training", 3),
        (need_ids[1], user_ids["diana"], "Threshold = max(5% del árbol, 10 votos) — ajustable por governance vote", 8),
        (need_ids[1], user_ids["alice"], "Sistema de liquid democracy con delegación de voto", 4),
        (need_ids[2], user_ids["bob"], "CTF con modalidad remota + presencial en Ciudad de México. Premio: $2000 USDC", 7),
        (need_ids[3], user_ids["carlos"], "Crowdsourcing de traducción con recompensas en XP del árbol", 3),
        (need_ids[4], user_ids["diana"], "WEAT + SEAT tests adaptados para LLMs multilingües", 6),
        (need_ids[4], user_ids["alice"], "Evaluación de 4 dimensiones: género, raza, orientación política, idioma nativo", 9),
        (need_ids[5], user_ids["bob"], "Certificación basada en TRAILS (Trustworthy AI Lifecycle Standard)", 7),
    ]
    for need_id, creator_id, content, likes in ideas_data:
        iid = uid()
        idea_ids.append(iid)
        c.execute(
            "INSERT INTO Idea VALUES (?,?,?,?,?,?,?,?)",
            (iid, content, creator_id, 0, None, likes, need_id, now())
        )

    # Votes
    vote_pairs = [
        (idea_ids[2], user_ids["alice"], need_ids[1]),
        (idea_ids[2], user_ids["bob"], need_ids[1]),
        (idea_ids[2], user_ids["carlos"], need_ids[1]),
        (idea_ids[2], hermes_uid, need_ids[1]),
        (idea_ids[7], user_ids["bob"], need_ids[4]),
        (idea_ids[7], user_ids["diana"], need_ids[4]),
        (idea_ids[7], hermes_uid, need_ids[4]),
        (idea_ids[4], user_ids["alice"], need_ids[2]),
        (idea_ids[4], user_ids["carlos"], need_ids[2]),
    ]
    c.executemany(
        "INSERT OR IGNORE INTO IdeaVote VALUES (?,?,?,?,?,?)",
        [(uid(), idea_id, user_id, need_id, 1, now()) for idea_id, user_id, need_id in vote_pairs]
    )

    # Results
    c.execute(
        "INSERT INTO Result VALUES (?,?,?,?,?,?,?,?,?,?)",
        (uid(), need_ids[1], idea_ids[2],
         "Aceptado: threshold dinámico de max(5%, 10 votos). 4/5 miembros votaron a favor.",
         4, "AI", hermes_uid, now(), now(), now())
    )

    conn.commit()
    conn.close()
    print(f"✅ SQLite DB created at {DB_PATH}")
    print(f"   Trees:     3")
    print(f"   Agent:     1 (HERMES)")
    print(f"   Memberships: 3")
    print(f"   Needs:     {len(need_ids)}")
    print(f"   Ideas:     {len(idea_ids)}")
    print(f"   Votes:     {len(vote_pairs)}")
    print(f"   Results:   1")

if __name__ == "__main__":
    init()
