#!/bin/bash
cd /home/leo/Documentos/TrustMaker/backend
exec node --import tsx src/index.ts >> /home/leo/Documentos/TrustMaker/backend/bot.log 2>&1
