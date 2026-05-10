const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function seed() {
  const needs = [
    ["Diseño de identidad visual para cafetería", "Necesitamos un diseñador que cree el logo, paleta de colores y tipografía para una cafetería de especialidad en Valparaíso."],
    ["Desarrollo de aplicación mobile para delivery", "App móvil nativa para iOS y Android que permita a los clientes pedir café a domicilio con geolocalización y pagos integrados."],
    ["Rediseño de sitio web corporativo", "Actualizar el sitio web de la empresa con diseño responsive moderno, optimización SEO y panel de administración."],
    ["Sistema de inventario para negocio", "Software de control de stock con alertas de bajo inventario, reportes mensuales y código de barras."],
    ["Campaña de marketing digital", "Estrategia de marketing en redes sociales para aumentar la visibilidad de la marca y captar nuevos clientes."],
    ["Automatización de procesos DevOps", "Implementar pipeline CI/CD con GitHub Actions, Docker y Kubernetes para despliegues automatizados."],
    ["Análisis de datos de ventas", "Dashboard interactivo con métricas de ventas, tendencias y predicciones usando Python y Power BI."],
  ];

  const treeId = "c3b9223a-6e70-42d8-b3ed-ab54f3cc3b6d";
  const userId = "ce89cea7-a25a-4927-9339-6aa2071e1962";

  for (const [title, desc] of needs) {
    const need = await prisma.need.create({
      data: { title, description: desc, creatorId: userId }
    });
    await prisma.needTree.create({
      data: { needId: need.id, treeId }
    });
    console.log(`OK: ${title}`);
  }

  const count = await prisma.need.count();
  console.log(`Total needs: ${count}`);
}

seed().then(() => prisma.$disconnect()).catch(e => { console.error(e); prisma.$disconnect(); process.exit(1); });
