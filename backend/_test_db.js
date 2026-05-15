const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.$connect()
  .then(() => { console.log('DB connected OK'); return prisma.$disconnect(); })
  .catch(e => { console.error('DB ERROR:', e.message); process.exit(1); });
