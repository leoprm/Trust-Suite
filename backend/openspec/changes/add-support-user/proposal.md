# Add `support` user — Hermes Agent aislado para Trust Manager

## Why
Modo support usa Hermes de Leo (:8642) con acceso total. Necesitamos perfil aislado con solo lectura de sandboxes + wiki estática.

## What
Crear usuario `support`, instalar Hermes Agent, gateway :8646 con tools restringidas, wiki Markdown, acceso ro a sandboxes.

## Architecture
```
@AriTrustManagerBot → backend → Hermes :8646 (support)
                                  ↑
                            /home/support/
                            ├── .hermes/SOUL.md = "Trust Manager"
                            ├── wiki/ (docs Trust Maker)
                            └── acceso ro → /home/trustmaker/trees/
                            
                            ✅ read_file, web_search
                            ❌ terminal, write_file, kanban, PLUR, cron
```
