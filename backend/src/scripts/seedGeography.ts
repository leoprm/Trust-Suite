import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const LOCATIONS = [
  { country: 'Argentina', city: 'Buenos Aires', sector: 'Palermo' },
  { country: 'Chile', city: 'Santiago', sector: 'Centro' },
  { country: 'Colombia', city: 'Bogota', sector: 'Norte' },
];

async function seedGeography() {
  console.log('Seeding Geography for existing trees...');
  
  const trees = await prisma.tree.findMany();
  if (trees.length === 0) {
    console.log('No trees found. Skipping.');
    return;
  }

  for (let i = 0; i < trees.length; i++) {
    const loc = LOCATIONS[i % LOCATIONS.length];
    await (prisma as any).tree.update({
      where: { id: trees[i].id },
      data: {
        country: loc.country,
        city: loc.city,
        sector: loc.sector
      }
    });
    console.log(`Updated Tree "${trees[i].name}" -> ${loc.country} / ${loc.city} / ${loc.sector}`);
  }

  console.log('Geography Seed Complete!');
  process.exit(0);
}

seedGeography().catch((e) => {
  console.error(e);
  process.exit(1);
});
