/**
 * Seed Demo Realista — Centro de Negocios
 * 
 * Crea 10 árboles, 30+ usuarios, transacciones FIAT, ratings, tasks y deliverables
 * para alimentar la landing page corporativa con datos impresionantes.
 *
 * Run: npx tsx src/scripts/seed-demo-realista.ts
 * 
 * NO modifica seed-demo.ts. Usa PrismaClient directo. Re-ejecutable.
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const prisma = new PrismaClient();
const uuid = () => crypto.randomUUID();
const daysAgo = (d: number) => new Date(Date.now() - d * 86400000);

// ── Existing user ID to preserve ──
const LEO_ID = '4b9a8ce2-76b0-42e9-be80-4b37059d30d5';

// ── Chilean user profiles ──
interface UserProfile {
  username: string;
  email: string;
  role: 'PERSON' | 'ADMINISTRATOR';
  skills: string[];
}

const CHILEAN_USERS: UserProfile[] = [
  { username: 'Catalina Muñoz',     email: 'catalina.munoz@demo.trust',    role: 'PERSON', skills: ['gestión de proyectos', 'liderazgo', 'scrum'] },
  { username: 'Felipe Contreras',   email: 'felipe.contreras@demo.trust',  role: 'PERSON', skills: ['react', 'typescript', 'frontend', 'diseño UX'] },
  { username: 'Javiera Soto',       email: 'javiera.soto@demo.trust',      role: 'PERSON', skills: ['energía solar', 'instalación eléctrica', 'paneles'] },
  { username: 'Matías Araya',       email: 'matias.araya@demo.trust',      role: 'PERSON', skills: ['agricultura orgánica', 'compostaje', 'riego'] },
  { username: 'Constanza Rojas',    email: 'constanza.rojas@demo.trust',   role: 'PERSON', skills: ['marketing digital', 'redes sociales', 'branding'] },
  { username: 'Sebastián Pizarro',  email: 'sebastian.pizarro@demo.trust', role: 'PERSON', skills: ['devops', 'aws', 'docker', 'kubernetes'] },
  { username: 'Francisca Silva',    email: 'francisca.silva@demo.trust',   role: 'PERSON', skills: ['enfermería', 'salud pública', 'primeros auxilios'] },
  { username: 'Nicolás Sepúlveda',  email: 'nicolas.sepulveda@demo.trust', role: 'PERSON', skills: ['logística', 'cadena de suministro', 'transporte'] },
  { username: 'Isidora Flores',     email: 'isidora.flores@demo.trust',    role: 'PERSON', skills: ['diseño gráfico', 'ilustración', 'animación'] },
  { username: 'Benjamín Tapia',     email: 'benjamin.tapia@demo.trust',    role: 'PERSON', skills: ['python', 'machine learning', 'análisis de datos'] },
  { username: 'Valentina Cáceres',  email: 'valentina.caceres@demo.trust', role: 'PERSON', skills: ['cocina', 'nutrición', 'gestión alimentaria'] },
  { username: 'Joaquín Figueroa',   email: 'joaquin.figueroa@demo.trust',  role: 'PERSON', skills: ['construcción', 'albañilería', 'carpintería'] },
  { username: 'Antonia Reyes',      email: 'antonia.reyes@demo.trust',     role: 'PERSON', skills: ['derecho', 'contratos', 'compliance'] },
  { username: 'Cristóbal Leiva',    email: 'cristobal.leiva@demo.trust',   role: 'PERSON', skills: ['contabilidad', 'finanzas', 'auditoría'] },
  { username: 'Emilia Navarro',     email: 'emilia.navarro@demo.trust',    role: 'PERSON', skills: ['educación', 'pedagogía', 'capacitación'] },
  { username: 'Renato Castillo',    email: 'renato.castillo@demo.trust',   role: 'PERSON', skills: ['ventas', 'negociación', 'atención al cliente'] },
  { username: 'Martina Espinoza',   email: 'martina.espinoza@demo.trust',  role: 'PERSON', skills: ['trabajo social', 'voluntariado', 'gestión comunitaria'] },
  { username: 'Luciano Peña',       email: 'luciano.pena@demo.trust',      role: 'PERSON', skills: ['acuicultura', 'pesca', 'procesamiento'] },
  { username: 'Agustina Carrasco',  email: 'agustina.carrasco@demo.trust', role: 'PERSON', skills: ['arquitectura', 'diseño sustentable', 'urbanismo'] },
  { username: 'Maximiliano Vidal',  email: 'maximiliano.vidal@demo.trust', role: 'PERSON', skills: ['ciberseguridad', 'ethical hacking', 'redes'] },
  { username: 'Fernanda Alarcón',   email: 'fernanda.alarcon@demo.trust',  role: 'PERSON', skills: ['terapia ocupacional', 'rehabilitación', 'inclusión'] },
  { username: 'Gonzalo Henríquez',  email: 'gonzalo.henriquez@demo.trust', role: 'PERSON', skills: ['minería', 'geología', 'seguridad industrial'] },
  { username: 'Paz Gutiérrez',      email: 'paz.gutierrez@demo.trust',     role: 'PERSON', skills: ['psicología', 'bienestar laboral', 'clima organizacional'] },
  { username: 'Ignacio Lara',       email: 'ignacio.lara@demo.trust',      role: 'PERSON', skills: ['audiovisual', 'edición de video', 'fotografía'] },
  { username: 'Trinidad Núñez',     email: 'trinidad.nunez@demo.trust',    role: 'PERSON', skills: ['turismo', 'hotelería', 'gastronomía'] },
  { username: 'Vicente Salinas',    email: 'vicente.salinas@demo.trust',   role: 'PERSON', skills: ['ingeniería civil', 'obras públicas', 'topografía'] },
  { username: 'Josefa Paredes',     email: 'josefa.paredes@demo.trust',    role: 'PERSON', skills: ['RRHH', 'reclutamiento', 'desarrollo organizacional'] },
  { username: 'Tomás Bustamante',   email: 'tomas.bustamante@demo.trust',  role: 'PERSON', skills: ['biotecnología', 'laboratorio', 'investigación'] },
  { username: 'Amanda Lagos',       email: 'amanda.lagos@demo.trust',      role: 'PERSON', skills: ['periodismo', 'comunicación', 'redacción'] },
  { username: 'Diego Sanhueza',     email: 'diego.sanhueza@demo.trust',    role: 'PERSON', skills: ['mecánica', 'mantención industrial', 'soldadura'] },
  { username: 'Sofía Zamorano',     email: 'sofia.zamorano@demo.trust',    role: 'PERSON', skills: ['enología', 'viticultura', 'producción vitivinícola'] },
];

// ── Tree definitions (10 PUBLIC trees) ──
interface TreeDef {
  name: string;
  icono: string;
  city: string;
  sector: string;
  description: string;
  capacidades: string;  // pipe-delimited
  memberCount: number;
  monthlyIncomeRange: [number, number]; // CLP range
  monthlyExpenseRange: [number, number];
  taskCount: number;
  satisfactionAvg: number; // 0-100
}

const TREE_DEFS: TreeDef[] = [
  {
    name: 'EcoAldea Santiago',
    icono: '🌿',
    city: 'Santiago',
    sector: 'Ñuñoa',
    description: 'Comunidad autosustentable enfocada en ecología urbana, agricultura regenerativa y producción local de alimentos orgánicos.',
    capacidades: 'Agricultura orgánica|Compostaje|Energía solar|Reciclaje|Educación ambiental|Huertos urbanos|Permacultura',
    memberCount: 8,
    monthlyIncomeRange: [2_500_000, 8_000_000],
    monthlyExpenseRange: [500_000, 2_000_000],
    taskCount: 7,
    satisfactionAvg: 88,
  },
  {
    name: 'TechBuilders Valparaíso',
    icono: '💻',
    city: 'Valparaíso',
    sector: 'Cerro Alegre',
    description: 'Cooperativa tecnológica para desarrollo de software, transformación digital y proyectos de innovación con impacto social.',
    capacidades: 'Desarrollo web|React|DevOps|Data Science|Diseño UX/UI|Cloud AWS|Ciberseguridad|Python',
    memberCount: 7,
    monthlyIncomeRange: [5_000_000, 25_000_000],
    monthlyExpenseRange: [1_000_000, 5_000_000],
    taskCount: 8,
    satisfactionAvg: 91,
  },
  {
    name: 'Manos Solidarias Concepción',
    icono: '🤝',
    city: 'Concepción',
    sector: 'Barrio Universitario',
    description: 'Red de apoyo mutuo y voluntariado: cocina comunitaria, apoyo escolar y huertos urbanos para la comunidad penquista.',
    capacidades: 'Voluntariado|Cocina comunitaria|Apoyo escolar|Huertos urbanos|Trabajo social|Gestión comunitaria',
    memberCount: 7,
    monthlyIncomeRange: [500_000, 3_000_000],
    monthlyExpenseRange: [100_000, 1_000_000],
    taskCount: 6,
    satisfactionAvg: 84,
  },
  {
    name: 'InnovaSalud Viña del Mar',
    icono: '🏥',
    city: 'Viña del Mar',
    sector: 'Reñaca',
    description: 'Ecosistema de innovación en salud: telemedicina, rehabilitación comunitaria y tecnologías para el bienestar.',
    capacidades: 'Telemedicina|Rehabilitación|Salud pública|Enfermería|Bienestar laboral|Terapia ocupacional',
    memberCount: 6,
    monthlyIncomeRange: [3_000_000, 15_000_000],
    monthlyExpenseRange: [800_000, 4_000_000],
    taskCount: 7,
    satisfactionAvg: 86,
  },
  {
    name: 'AgroFuturo Rancagua',
    icono: '🌾',
    city: 'Rancagua',
    sector: 'Centro',
    description: 'Innovación agrícola: técnicas de cultivo sustentable, gestión hídrica inteligente y comercialización directa sin intermediarios.',
    capacidades: 'Agricultura|Riego tecnificado|Agroecología|Viticultura|Comercialización|Gestión hídrica',
    memberCount: 6,
    monthlyIncomeRange: [3_000_000, 12_000_000],
    monthlyExpenseRange: [1_000_000, 4_000_000],
    taskCount: 7,
    satisfactionAvg: 82,
  },
  {
    name: 'RedCreativa Providencia',
    icono: '🎨',
    city: 'Santiago',
    sector: 'Providencia',
    description: 'Hub de industrias creativas: diseño, audiovisual, publicidad y contenidos digitales para empresas y emprendedores.',
    capacidades: 'Diseño gráfico|Audiovisual|Branding|Fotografía|Animación|Marketing digital|Ilustración',
    memberCount: 7,
    monthlyIncomeRange: [4_000_000, 18_000_000],
    monthlyExpenseRange: [1_500_000, 5_000_000],
    taskCount: 8,
    satisfactionAvg: 90,
  },
  {
    name: 'LogísticaSur Puerto Montt',
    icono: '🚛',
    city: 'Puerto Montt',
    sector: 'Pelluco',
    description: 'Red de logística y distribución para la zona sur: transporte refrigerado, almacenamiento y última milla.',
    capacidades: 'Logística|Cadena de suministro|Transporte|Almacenamiento|Distribución|Comercio exterior',
    memberCount: 6,
    monthlyIncomeRange: [4_000_000, 20_000_000],
    monthlyExpenseRange: [2_000_000, 8_000_000],
    taskCount: 7,
    satisfactionAvg: 83,
  },
  {
    name: 'EnergíaLimpia Antofagasta',
    icono: '☀️',
    city: 'Antofagasta',
    sector: 'Centro Norte',
    description: 'Impulso a energías renovables en el norte: solar fotovoltaica, eólica de pequeña escala y eficiencia energética.',
    capacidades: 'Energía solar|Energía eólica|Eficiencia energética|Instalación eléctrica|Minería|Sustentabilidad',
    memberCount: 6,
    monthlyIncomeRange: [6_000_000, 30_000_000],
    monthlyExpenseRange: [2_000_000, 10_000_000],
    taskCount: 7,
    satisfactionAvg: 87,
  },
  {
    name: 'BioCultura Temuco',
    icono: '🧬',
    city: 'Temuco',
    sector: 'Centro',
    description: 'Biotecnología aplicada: investigación en cultivos nativos, bioremediación y productos naturales con identidad mapuche.',
    capacidades: 'Biotecnología|Investigación|Laboratorio|Cultivos nativos|Bioremediación|Productos naturales',
    memberCount: 5,
    monthlyIncomeRange: [2_000_000, 8_000_000],
    monthlyExpenseRange: [800_000, 3_000_000],
    taskCount: 6,
    satisfactionAvg: 85,
  },
  {
    name: 'PescaRegenerativa Chiloé',
    icono: '🐟',
    city: 'Castro',
    sector: 'Centro',
    description: 'Pesca artesanal sustentable y acuicultura regenerativa: manejo responsable de recursos marinos con identidad chilota.',
    capacidades: 'Acuicultura|Pesca artesanal|Procesamiento|Sustentabilidad marina|Turismo|Gastronomía marina',
    memberCount: 5,
    monthlyIncomeRange: [1_500_000, 6_000_000],
    monthlyExpenseRange: [500_000, 2_500_000],
    taskCount: 6,
    satisfactionAvg: 80,
  },
];

// ── Transaction templates per sector ──
const INCOME_TEMPLATES: Record<string, { desc: string; category: string; counterparty: string; counterpartyType: string }[]> = {
  'sustentabilidad': [
    { desc: 'Venta de verduras orgánicas a restaurante local', category: 'MONEY', counterparty: 'Restaurante Raíces', counterpartyType: 'CLIENT' },
    { desc: 'Taller de compostaje para municipalidad', category: 'MONEY', counterparty: 'Municipalidad de Ñuñoa', counterpartyType: 'INSTITUTION' },
    { desc: 'Consultoría en eficiencia energética', category: 'MONEY', counterparty: 'Empresa Verde SpA', counterpartyType: 'CLIENT' },
    { desc: 'Donación corporativa para proyecto comunitario', category: 'MONEY', counterparty: 'Fundación Tierra Viva', counterpartyType: 'INSTITUTION' },
    { desc: 'Venta de plantines y semillas', category: 'MONEY', counterparty: 'Vivero Local', counterpartyType: 'CLIENT' },
  ],
  'tecnología': [
    { desc: 'Desarrollo de plataforma web para retail', category: 'MONEY', counterparty: 'Tienda Digital Ltda', counterpartyType: 'CLIENT' },
    { desc: 'Migración a la nube — AWS para startup', category: 'EQUIPMENT', counterparty: 'StartupLab Chile', counterpartyType: 'CLIENT' },
    { desc: 'Consultoría en ciberseguridad', category: 'MONEY', counterparty: 'Banco Regional', counterpartyType: 'INSTITUTION' },
    { desc: 'Desarrollo de app móvil para delivery', category: 'MONEY', counterparty: 'FoodExpress SpA', counterpartyType: 'CLIENT' },
    { desc: 'Capacitación DevOps para equipo corporativo', category: 'MONEY', counterparty: 'CorpTech SA', counterpartyType: 'CLIENT' },
  ],
  'social': [
    { desc: 'Donación de supermercado para cocina comunitaria', category: 'MATERIAL', counterparty: 'Supermercado Unimarc', counterpartyType: 'SUPPLIER' },
    { desc: 'Subvención municipal para programa social', category: 'MONEY', counterparty: 'Municipalidad de Concepción', counterpartyType: 'INSTITUTION' },
    { desc: 'Colecta comunitaria mensual', category: 'MONEY', counterparty: 'Vecinos Barrio Universitario', counterpartyType: 'OTHER' },
    { desc: 'Venta de productos en feria solidaria', category: 'MONEY', counterparty: 'Feria Barrio Norte', counterpartyType: 'CLIENT' },
  ],
  'salud': [
    { desc: 'Servicio de telemedicina para empresas', category: 'MONEY', counterparty: 'Seguros Médicos SA', counterpartyType: 'CLIENT' },
    { desc: 'Taller de bienestar laboral corporativo', category: 'MONEY', counterparty: 'Empresa Nacional', counterpartyType: 'CLIENT' },
    { desc: 'Programa de rehabilitación comunitaria', category: 'MONEY', counterparty: 'Servicio de Salud', counterpartyType: 'INSTITUTION' },
    { desc: 'Venta de equipamiento médico menor', category: 'EQUIPMENT', counterparty: 'Clínica del Mar', counterpartyType: 'CLIENT' },
  ],
  'agrícola': [
    { desc: 'Venta de cosecha de uva a viña boutique', category: 'MONEY', counterparty: 'Viña Los Robles', counterpartyType: 'CLIENT' },
    { desc: 'Servicio de asesoría en riego tecnificado', category: 'MONEY', counterparty: 'Agrícola del Valle Ltda', counterpartyType: 'CLIENT' },
    { desc: 'Venta de productos agroecológicos', category: 'MONEY', counterparty: 'Mercado Orgánico', counterpartyType: 'CLIENT' },
    { desc: 'Subsidio INDAP para innovación agrícola', category: 'MONEY', counterparty: 'INDAP', counterpartyType: 'INSTITUTION' },
  ],
  'industrias creativas': [
    { desc: 'Campaña publicitaria para marca nacional', category: 'MONEY', counterparty: 'Marca Chile SA', counterpartyType: 'CLIENT' },
    { desc: 'Producción de video corporativo', category: 'MONEY', counterparty: 'Grupo Empresarial Andino', counterpartyType: 'CLIENT' },
    { desc: 'Diseño de identidad visual para startup', category: 'MONEY', counterparty: 'InnovaTech SpA', counterpartyType: 'CLIENT' },
    { desc: 'Gestión de redes sociales mensual', category: 'MONEY', counterparty: 'Comercio Local Digital', counterpartyType: 'CLIENT' },
    { desc: 'Ilustraciones para libro educativo', category: 'MONEY', counterparty: 'Editorial Pedagógica', counterpartyType: 'CLIENT' },
  ],
  'logística': [
    { desc: 'Servicio de transporte refrigerado mensual', category: 'MONEY', counterparty: 'Exportadora del Sur', counterpartyType: 'CLIENT' },
    { desc: 'Almacenamiento y distribución para retail', category: 'MONEY', counterparty: 'Retail Austral', counterpartyType: 'CLIENT' },
    { desc: 'Logística de última milla para e-commerce', category: 'MONEY', counterparty: 'TiendaOnline Patagonia', counterpartyType: 'CLIENT' },
    { desc: 'Servicio de comercio exterior — exportación', category: 'MONEY', counterparty: 'Aduanas Chile', counterpartyType: 'INSTITUTION' },
  ],
  'energía': [
    { desc: 'Instalación de sistema solar residencial', category: 'EQUIPMENT', counterparty: 'Familia González', counterpartyType: 'CLIENT' },
    { desc: 'Consultoría en eficiencia energética industrial', category: 'MONEY', counterparty: 'Minera del Norte', counterpartyType: 'CLIENT' },
    { desc: 'Instalación de parque eólico pequeño', category: 'EQUIPMENT', counterparty: 'Cooperativa Eléctrica', counterpartyType: 'CLIENT' },
    { desc: 'Mantención de paneles solares corporativos', category: 'MONEY', counterparty: 'Empresa Solar SA', counterpartyType: 'CLIENT' },
    { desc: 'Venta de equipos solares al por mayor', category: 'EQUIPMENT', counterparty: 'Distribuidora Eléctrica', counterpartyType: 'CLIENT' },
  ],
};

const EXPENSE_TEMPLATES: Record<string, { desc: string; category: string; counterparty: string; counterpartyType: string }[]> = {
  default: [
    { desc: 'Pago de cuenta de electricidad mensual', category: 'ELECTRICITY', counterparty: 'Enel Chile', counterpartyType: 'SUPPLIER' },
    { desc: 'Compra de materiales de oficina', category: 'MATERIAL', counterparty: 'Librería Nacional', counterpartyType: 'SUPPLIER' },
    { desc: 'Pago de arriendo de espacio de trabajo', category: 'MORTGAGE', counterparty: 'Inmobiliaria Centro', counterpartyType: 'SUPPLIER' },
    { desc: 'Servicio de internet y telefonía', category: 'OTHER', counterparty: 'Movistar', counterpartyType: 'SUPPLIER' },
    { desc: 'Compra de equipamiento menor', category: 'EQUIPMENT', counterparty: 'Sodimac', counterpartyType: 'SUPPLIER' },
    { desc: 'Pago de servicios de agua potable', category: 'WATER', counterparty: 'Aguas Andinas', counterpartyType: 'SUPPLIER' },
    { desc: 'Combustible para transporte', category: 'FUEL', counterparty: 'Copec', counterpartyType: 'SUPPLIER' },
    { desc: 'Insumos de limpieza y sanitización', category: 'SHOPPING', counterparty: 'Distribuidora Clean', counterpartyType: 'SUPPLIER' },
  ],
};

// ── Task templates per sector ──
function getTaskTemplates(sector: string): { name: string; desc: string; phase: string; difficulty: number; hours: number; tags: string[] }[] {
  const templates: Record<string, any[]> = {
    'sustentabilidad': [
      { name: 'Mapear terreno para nuevo huerto', desc: 'Levantamiento de 500m², análisis de suelo y diseño de rotación de cultivos.', phase: 'INVESTIGATION', difficulty: 3, hours: 12, tags: ['agricultura', 'mapeo'] },
      { name: 'Instalar sistema de riego por goteo', desc: 'Tendido de tuberías y programación de timer para 4 zonas de cultivo.', phase: 'DEVELOPMENT', difficulty: 5, hours: 20, tags: ['riego', 'instalación'] },
      { name: 'Construir compostera comunitaria', desc: 'Estructura de 3 compartimentos con palets reciclados y techo.', phase: 'DEVELOPMENT', difficulty: 4, hours: 16, tags: ['compostaje', 'construcción'] },
      { name: 'Instalar panel solar para bomba de agua', desc: 'Panel 400W con inversor y conexión a bomba sumergible.', phase: 'DEVELOPMENT', difficulty: 6, hours: 24, tags: ['energía solar', 'instalación'] },
      { name: 'Preparar taller de educación ambiental', desc: 'Material didáctico para 40 vecinos sobre reciclaje y compostaje.', phase: 'PRODUCTION', difficulty: 2, hours: 8, tags: ['educación', 'diseño'] },
      { name: 'Organizar feria de productos orgánicos', desc: 'Coordinar 15 productores, permisos municipales y difusión.', phase: 'PRODUCTION', difficulty: 3, hours: 10, tags: ['gestión', 'eventos'] },
      { name: 'Auditar consumo hídrico del huerto', desc: 'Registro de 30 días de consumo, identificación de fugas y optimización.', phase: 'MAINTENANCE', difficulty: 3, hours: 8, tags: ['riego', 'auditoría'] },
    ],
    'tecnología': [
      { name: 'Diseñar wireframes en Figma', desc: 'Prototipo de 8 pantallas principales con componentes reutilizables.', phase: 'INVESTIGATION', difficulty: 4, hours: 16, tags: ['diseño UX', 'figma'] },
      { name: 'Desarrollar API REST en Node.js', desc: 'Endpoints CRUD con autenticación JWT y documentación Swagger.', phase: 'DEVELOPMENT', difficulty: 6, hours: 30, tags: ['nodejs', 'api', 'backend'] },
      { name: 'Implementar frontend React con Tailwind', desc: 'Componentes responsive, estado con Zustand, formularios con validación.', phase: 'DEVELOPMENT', difficulty: 5, hours: 25, tags: ['react', 'frontend', 'tailwind'] },
      { name: 'Configurar pipeline CI/CD en GitHub Actions', desc: 'Build, test, lint y deploy automático a staging.', phase: 'DEVELOPMENT', difficulty: 4, hours: 12, tags: ['devops', 'github', 'ci/cd'] },
      { name: 'Realizar pruebas de carga con k6', desc: 'Simular 1000 usuarios concurrentes, generar reporte de rendimiento.', phase: 'DEVELOPMENT', difficulty: 5, hours: 16, tags: ['testing', 'performance'] },
      { name: 'Configurar monitoreo con Grafana', desc: 'Dashboards para CPU, memoria, latencia y errores 5xx.', phase: 'PRODUCTION', difficulty: 3, hours: 10, tags: ['devops', 'monitoreo'] },
      { name: 'Escribir documentación técnica', desc: 'README, guía de instalación, arquitectura y decisiones de diseño.', phase: 'PRODUCTION', difficulty: 2, hours: 8, tags: ['documentación', 'escritura'] },
      { name: 'Realizar auditoría de seguridad OWASP Top 10', desc: 'Análisis de vulnerabilidades, reporte y plan de remediación.', phase: 'MAINTENANCE', difficulty: 6, hours: 20, tags: ['ciberseguridad', 'auditoría'] },
    ],
    'social': [
      { name: 'Planificar menú mensual balanceado', desc: 'Menú de 4 sábados con opciones vegetarianas, cálculo de porciones.', phase: 'INVESTIGATION', difficulty: 2, hours: 4, tags: ['cocina', 'nutrición'] },
      { name: 'Contactar proveedores para donaciones', desc: 'Gestionar alianzas con 5 ferias y 3 supermercados.', phase: 'DEVELOPMENT', difficulty: 3, hours: 8, tags: ['gestión', 'donaciones'] },
      { name: 'Organizar ciclo de apoyo escolar', desc: 'Programa de 8 sesiones, reclutar 6 tutores voluntarios.', phase: 'DEVELOPMENT', difficulty: 3, hours: 10, tags: ['educación', 'voluntariado'] },
      { name: 'Diseñar campaña de difusión comunitaria', desc: 'Afiches, posts para RRSS y volantes para el barrio.', phase: 'PRODUCTION', difficulty: 2, hours: 6, tags: ['diseño', 'marketing'] },
      { name: 'Coordinar jornada de limpieza barrial', desc: 'Logística para 50 voluntarios, herramientas y refrigerio.', phase: 'PRODUCTION', difficulty: 3, hours: 8, tags: ['gestión', 'voluntariado'] },
      { name: 'Evaluar impacto del programa social', desc: 'Encuestas a 80 beneficiarios, informe de resultados.', phase: 'MAINTENANCE', difficulty: 3, hours: 12, tags: ['investigación', 'análisis'] },
    ],
    'salud': [
      { name: 'Evaluar necesidades de telemedicina', desc: 'Encuesta a 100 pacientes, análisis de brechas tecnológicas.', phase: 'INVESTIGATION', difficulty: 3, hours: 10, tags: ['investigación', 'salud'] },
      { name: 'Desarrollar protocolo de atención remota', desc: 'Flujo de atención, consentimiento informado, privacidad de datos.', phase: 'DEVELOPMENT', difficulty: 4, hours: 16, tags: ['salud', 'documentación'] },
      { name: 'Implementar plataforma de videoconsulta', desc: 'Integración con WebRTC, agenda de horas, historial clínico básico.', phase: 'DEVELOPMENT', difficulty: 7, hours: 35, tags: ['telemedicina', 'desarrollo'] },
      { name: 'Capacitar a profesionales en telemedicina', desc: 'Taller de 8 horas para 15 profesionales de la salud.', phase: 'PRODUCTION', difficulty: 3, hours: 12, tags: ['capacitación', 'salud'] },
      { name: 'Diseñar programa de rehabilitación comunitaria', desc: 'Ejercicios guiados, seguimiento remoto y metas semanales.', phase: 'PRODUCTION', difficulty: 4, hours: 14, tags: ['rehabilitación', 'diseño'] },
      { name: 'Realizar auditoría de satisfacción de pacientes', desc: 'Encuesta NPS a 200 pacientes, análisis estadístico.', phase: 'MAINTENANCE', difficulty: 3, hours: 10, tags: ['auditoría', 'análisis'] },
      { name: 'Actualizar protocolos según nueva normativa', desc: 'Revisión de Ley de Telemedicina, ajustes en plataforma.', phase: 'MAINTENANCE', difficulty: 4, hours: 8, tags: ['compliance', 'documentación'] },
    ],
    'agrícola': [
      { name: 'Analizar calidad de suelo en parcela piloto', desc: 'Muestreo de 20 puntos, análisis NPK y materia orgánica.', phase: 'INVESTIGATION', difficulty: 3, hours: 10, tags: ['agricultura', 'análisis'] },
      { name: 'Diseñar sistema de riego por goteo', desc: 'Cálculo de caudal, diseño de sectores y selección de materiales.', phase: 'INVESTIGATION', difficulty: 4, hours: 12, tags: ['riego', 'diseño'] },
      { name: 'Implementar cultivo hidropónico piloto', desc: 'Sistema NFT para lechugas, 20m² con control de pH automatizado.', phase: 'DEVELOPMENT', difficulty: 6, hours: 30, tags: ['agricultura', 'hidroponía'] },
      { name: 'Negociar contrato con distribuidora', desc: 'Acuerdo de compra anual para cosecha de berries orgánicos.', phase: 'DEVELOPMENT', difficulty: 3, hours: 8, tags: ['ventas', 'negociación'] },
      { name: 'Capacitar a agricultores en agroecología', desc: 'Programa de 6 sesiones prácticas para 25 agricultores locales.', phase: 'PRODUCTION', difficulty: 3, hours: 18, tags: ['educación', 'capacitación'] },
      { name: 'Certificar producción orgánica', desc: 'Tramitar certificación con entidad acreditada, documentación y auditoría.', phase: 'PRODUCTION', difficulty: 5, hours: 20, tags: ['certificación', 'gestión'] },
      { name: 'Evaluar rendimiento de cultivos de temporada', desc: 'Análisis comparativo de 4 variedades, rendimiento por hectárea.', phase: 'MAINTENANCE', difficulty: 3, hours: 15, tags: ['análisis', 'agricultura'] },
    ],
    'industrias creativas': [
      { name: 'Investigar identidad de marca del cliente', desc: 'Entrevistas con stakeholders, benchmark de competidores.', phase: 'INVESTIGATION', difficulty: 3, hours: 12, tags: ['branding', 'investigación'] },
      { name: 'Diseñar sistema de identidad visual', desc: 'Logo, paleta cromática, tipografía, manual de marca.', phase: 'DEVELOPMENT', difficulty: 5, hours: 24, tags: ['diseño gráfico', 'branding'] },
      { name: 'Producir video promocional 90s', desc: 'Grabación 2 jornadas, edición profesional, motion graphics.', phase: 'DEVELOPMENT', difficulty: 6, hours: 30, tags: ['audiovisual', 'edición'] },
      { name: 'Crear campaña de lanzamiento en RRSS', desc: '30 piezas gráficas, calendario editorial, copies.', phase: 'PRODUCTION', difficulty: 4, hours: 18, tags: ['marketing digital', 'redes sociales'] },
      { name: 'Ilustrar serie de personajes para app', desc: '10 personajes vectorizados con variaciones de color.', phase: 'DEVELOPMENT', difficulty: 4, hours: 16, tags: ['ilustración', 'diseño'] },
      { name: 'Fotografiar catálogo de productos', desc: 'Sesión de 50 productos con fondo blanco, edición y recorte.', phase: 'PRODUCTION', difficulty: 3, hours: 12, tags: ['fotografía', 'edición'] },
      { name: 'Desarrollar sitio web portfolio del estudio', desc: 'Next.js con animaciones, galería y formulario de contacto.', phase: 'DEVELOPMENT', difficulty: 5, hours: 22, tags: ['desarrollo web', 'frontend'] },
      { name: 'Presentar informe trimestral de métricas', desc: 'KPIs de campañas, engagement, retorno de inversión.', phase: 'MAINTENANCE', difficulty: 2, hours: 6, tags: ['análisis', 'reportes'] },
    ],
    'logística': [
      { name: 'Mapear rutas de distribución óptimas', desc: 'Análisis de 12 rutas, costos y tiempos con Google OR-Tools.', phase: 'INVESTIGATION', difficulty: 4, hours: 14, tags: ['logística', 'optimización'] },
      { name: 'Implementar sistema WMS básico', desc: 'Control de inventario con código de barras, entradas y salidas.', phase: 'DEVELOPMENT', difficulty: 5, hours: 28, tags: ['software', 'inventario'] },
      { name: 'Negociar tarifas con transportistas', desc: 'Licitación con 5 empresas de transporte para 12 meses.', phase: 'DEVELOPMENT', difficulty: 3, hours: 8, tags: ['negociación', 'transporte'] },
      { name: 'Instalar sistema de refrigeración en bodega', desc: 'Equipo de frío para 200m³, control de temperatura IoT.', phase: 'DEVELOPMENT', difficulty: 7, hours: 40, tags: ['instalación', 'refrigeración'] },
      { name: 'Capacitar equipo en protocolos de seguridad', desc: 'Curso de 6 horas: manejo de carga, riesgos y emergencias.', phase: 'PRODUCTION', difficulty: 2, hours: 8, tags: ['capacitación', 'seguridad'] },
      { name: 'Auditar trazabilidad de envíos', desc: 'Verificar 200 envíos del último mes, documentar incidencias.', phase: 'MAINTENANCE', difficulty: 3, hours: 12, tags: ['auditoría', 'control'] },
      { name: 'Optimizar consumo de combustible de flota', desc: 'Análisis de telemetría, recomendaciones de conducción eficiente.', phase: 'MAINTENANCE', difficulty: 4, hours: 10, tags: ['optimización', 'combustible'] },
    ],
    'energía': [
      { name: 'Evaluar potencial solar del sitio', desc: 'Estudio de irradiación con drone, sombras y orientación.', phase: 'INVESTIGATION', difficulty: 4, hours: 16, tags: ['energía solar', 'análisis'] },
      { name: 'Diseñar sistema fotovoltaico 50kW', desc: 'Dimensionamiento, selección de equipos, diagrama unilineal.', phase: 'INVESTIGATION', difficulty: 6, hours: 24, tags: ['energía solar', 'ingeniería'] },
      { name: 'Instalar estructura de paneles solares', desc: 'Montaje de 120 paneles en techo industrial con anclajes.', phase: 'DEVELOPMENT', difficulty: 7, hours: 50, tags: ['instalación', 'paneles'] },
      { name: 'Configurar inversores y sistema de monitoreo', desc: 'Conexión de 4 inversores, plataforma de monitoreo remoto.', phase: 'DEVELOPMENT', difficulty: 5, hours: 20, tags: ['eléctrica', 'monitoreo'] },
      { name: 'Tramitar conexión a red con distribuidora', desc: 'Documentación técnica, medición neta, contrato de inyección.', phase: 'PRODUCTION', difficulty: 4, hours: 15, tags: ['gestión', 'trámites'] },
      { name: 'Realizar mantención preventiva trimestral', desc: 'Limpieza de paneles, verificación de conexiones, termografía.', phase: 'MAINTENANCE', difficulty: 3, hours: 8, tags: ['mantención', 'paneles'] },
      { name: 'Elaborar informe de generación y ahorro', desc: 'Análisis de 3 meses de operación, ROI proyectado.', phase: 'MAINTENANCE', difficulty: 2, hours: 6, tags: ['reportes', 'análisis'] },
    ],
  };
  return templates[sector] || templates['sustentabilidad'];
}

// ── Sector mapping for income/expense templates ──
function getSectorKey(treeName: string): string {
  const map: Record<string, string> = {
    'EcoAldea Santiago': 'sustentabilidad',
    'TechBuilders Valparaíso': 'tecnología',
    'Manos Solidarias Concepción': 'social',
    'InnovaSalud Viña del Mar': 'salud',
    'AgroFuturo Rancagua': 'agrícola',
    'RedCreativa Providencia': 'industrias creativas',
    'LogísticaSur Puerto Montt': 'logística',
    'EnergíaLimpia Antofagasta': 'energía',
    'BioCultura Temuco': 'sustentabilidad',
    'PescaRegenerativa Chiloé': 'logística',
  };
  return map[treeName] || 'sustentabilidad';
}

// ── Random helpers ──
function rand(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randFloat(min: number, max: number): number {
  return Math.round((Math.random() * (max - min) + min) * 100) / 100;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// ── Main ──
async function main() {
  console.log('🌱 Seed Demo Realista — Centro de Negocios\n');
  const startTime = Date.now();

  // ═══════════════════════════════════════════════
  // 0. DELETE ALL EXISTING DATA (clean reset)
  // ═══════════════════════════════════════════════
  console.log('🧹 Limpiando base de datos...');
  
  const tables = [
    'SatisfactionRating', 'SatisfaccionEvaluador', 'PhaseDeliverable',
    'DifficultyVoteLike', 'DifficultyVote', 'TaskVote', 'TaskQuestion', 'TaskTag',
    'Auditoria', 'PromiseP2P', 'EvidenceFile', 'EventLog',
    'FiatTransaction', 'FiatTemplate',
    'AutosustentoIdeaSupport', 'AutosustentoIdea', 'AutosustentoBranchConfig',
    'SustainabilityCycle',
    'IdeaLike', 'BranchNeedVote', 'BranchMember',
    'SkillInfluence',
    'BerryTransaction', 'BerryMonthlyCycle', 'BerryConfig',
    'ExpertEndorsement',
    'InsightExternalApplication', 'InsightInternalMatch', 'InsightExternalOpening',
    'InsightCorporateReferral', 'InsightSignal',
    'ExternalCandidate',
    'SolutionProposal', 'ScopePreference', 'BudgetLine', 'ExternalAgent',
    'ExternalNeed',
    'SkillEndorsement', 'SkillProposal', 'SkillMigration',
    'BonusVote', 'BonusPool',
    'SearchPass',
    'DifficultyVote', 'Task', 'PhaseDeliverable', 'SatisfactionRating',
    'SatisfaccionEvaluador',
    'Branch', 'Task',
    'NeedTree', 'NeedFunding', 'Idea', 'Need',
    'TreeMember',
    'TreeRelation', 'TrustTreaty',
    'Tree',
    'UserContact', 'ConnectionToken', 'InterviewInvitation',
  ];

  // Deduplicate
  const uniqueTables = [...new Set(tables)];
  
  for (const table of uniqueTables) {
    await prisma.$executeRawUnsafe(`DELETE FROM \`${table}\``);
  }

  // Delete users except Leo
  await prisma.user.deleteMany({ where: { id: { not: LEO_ID } } });
  
  console.log('   ✅ Base de datos limpia.\n');

  // ═══════════════════════════════════════════════
  // 1. USERS (30 Chilean profiles + Leo)
  // ═══════════════════════════════════════════════
  console.log('👥 Creando usuarios demo...');
  const hash = await bcrypt.hash('demo123', 10);

  const userMap: Record<string, string> = { 'Leo': LEO_ID };
  
  for (const u of CHILEAN_USERS) {
    const user = await prisma.user.create({
      data: {
        id: uuid(),
        username: u.username,
        email: u.email,
        password: hash,
        role: u.role,
        is_onboarded: true,
        is_guest: false,
        sharingCode: crypto.randomBytes(6).toString('hex'),
        publicProfileEnabled: true,
      },
    });
    userMap[u.username] = user.id;
  }
  console.log(`   ✅ ${CHILEAN_USERS.length} usuarios creados (${Object.keys(userMap).length} total con Leo)\n`);

  // ═══════════════════════════════════════════════
  // 2. TREES (10 PUBLIC trees)
  // ═══════════════════════════════════════════════
  console.log('🌳 Creando árboles...');
  const treeMap: Record<string, { id: string; def: TreeDef; memberIds: string[] }> = {};

  // Assign members to each tree
  const allDemoUserIds = Object.values(userMap).filter(id => id !== LEO_ID);
  const shuffledUserIds = shuffle(allDemoUserIds);
  let userIdx = 0;

  for (const def of TREE_DEFS) {
    const treeId = uuid();
    
    // Assign members (round-robin from shuffled pool)
    const memberIds: string[] = [LEO_ID]; // Leo always in every tree
    for (let i = 0; i < def.memberCount - 1 && userIdx < shuffledUserIds.length; i++) {
      memberIds.push(shuffledUserIds[userIdx]);
      userIdx = (userIdx + 1) % shuffledUserIds.length;
    }

    await prisma.tree.create({
      data: {
        id: treeId,
        name: def.name,
        icono: def.icono,
        country: 'Chile',
        city: def.city,
        sector: def.sector,
        visibility: 'PUBLIC',
        admissionPolicy: 'OPEN',
        allowHashtags: true,
        allowTraditionalBranches: true,
        hashtagCreationPolicy: 'ADMIN_AND_USERS',
        economyMode: 'LEGACY_FIAT',
        presupuestoTotal: 5000,
        modoGobierno: 'DEMOCRATICO',
        creatorId: LEO_ID,
        capacidades: def.capacidades,
        description: def.description,
        inviteCode: def.name.replace(/\s+/g, '').substring(0, 8).toUpperCase() + '-' + crypto.randomBytes(3).toString('hex').toUpperCase(),
        crisisSubjects: '',
      },
    });
    treeMap[def.name] = { id: treeId, def, memberIds };
  }
  console.log(`   ✅ ${TREE_DEFS.length} árboles creados\n`);

  // ═══════════════════════════════════════════════
  // 3. TREE MEMBERSHIPS
  // ═══════════════════════════════════════════════
  console.log('👤 Creando membresías...');
  let totalMemberships = 0;

  for (const [treeName, treeData] of Object.entries(treeMap)) {
    for (let i = 0; i < treeData.memberIds.length; i++) {
      const userId = treeData.memberIds[i];
      const role = userId === LEO_ID ? 'ADMIN' : (i === 1 ? 'ADMIN' : 'MEMBER');
      
      const userProfile = Object.entries(userMap).find(([, id]) => id === userId);
      const username = userProfile ? userProfile[0] : 'Desconocido';
      const skills = CHILEAN_USERS.find(u => userMap[u.username] === userId)?.skills || [];
      
      await prisma.treeMember.create({
        data: {
          id: uuid(),
          userId,
          treeId: treeData.id,
          status: 'VERIFIED',
          role: role as any,
          xp: rand(100, 5000),
          level: rand(1, 8),
          weeklyNeedPoints: rand(50, 200),
          skills: JSON.stringify(skills),
          strikesEconomicos: '[]',
          goldenTickets: '{}',
          bayasBalance: randFloat(0, 500),
          joinedAt: daysAgo(rand(30, 365)),
        },
      });
      totalMemberships++;
    }
  }
  console.log(`   ✅ ${totalMemberships} membresías creadas\n`);

  // ═══════════════════════════════════════════════
  // 4. BRANCHES + TASKS + DELIVERABLES
  // ═══════════════════════════════════════════════
  console.log('🌿 Creando branches, tasks y deliverables...');
  let totalTasks = 0;
  let totalDeliverables = 0;

  const allTreeMemberIds: Record<string, string[]> = {}; // treeId -> [treeMemberId]
  const allDeliverables: { id: string; branchId: string; treeMemberIds: string[] }[] = [];

  for (const [treeName, treeData] of Object.entries(treeMap)) {
    const sector = getSectorKey(treeName);
    const taskTemplates = getTaskTemplates(sector);
    const treeMemberRecords = await prisma.treeMember.findMany({
      where: { treeId: treeData.id },
      select: { id: true, userId: true },
    });
    allTreeMemberIds[treeData.id] = treeMemberRecords.map(m => m.id);

    // Create 2-3 branches per tree
    const branchCount = rand(2, 3);
    const branchNames = [
      'Proyecto Principal',
      'Iniciativa Comunitaria',
      'Desarrollo Innovador',
    ];

    for (let b = 0; b < branchCount; b++) {
      const branchId = uuid();
      const branchPhase = ['INVESTIGATION', 'DEVELOPMENT', 'PRODUCTION', 'MAINTENANCE'][b % 4];

      await prisma.branch.create({
        data: {
          id: branchId,
          treeId: treeData.id,
          name: `${treeName} — ${branchNames[b]}`,
          type: 'NORMAL',
          phase: branchPhase as any,
          xpPool: rand(50, 500),
          currentPhaseIndex: rand(0, 3),
          activePhasesJson: JSON.stringify(['INVESTIGATION', 'DEVELOPMENT', 'PRODUCTION', 'MAINTENANCE']),
          bayasFund: randFloat(0, 300),
          valorOficial: randFloat(0, 200),
          createdAt: daysAgo(rand(14, 90)),
          userId: pick(treeData.memberIds),
        },
      });

      // Add 2-3 branch members
      const branchMembers = shuffle(treeMemberRecords).slice(0, rand(2, 3));
      for (const bm of branchMembers) {
        await prisma.branchMember.create({
          data: {
            id: uuid(),
            userId: bm.userId,
            branchId: branchId,
            joinedPhases: JSON.stringify(['INVESTIGATION', 'DEVELOPMENT', 'PRODUCTION', 'MAINTENANCE']),
            joinedAt: daysAgo(rand(7, 60)),
          },
        });
      }

      // Create deliverables (2-4 per branch)
      const deliverableCount = rand(2, 4);
      const branchDeliverables: string[] = [];
      for (let d = 0; d < deliverableCount; d++) {
        const delivId = uuid();
        await prisma.phaseDeliverable.create({
          data: {
            id: delivId,
            branchId: branchId,
            phase: ['INVESTIGATION', 'DEVELOPMENT', 'PRODUCTION'][d % 3] as any,
            deliverableUrl: `https://demo.trust/deliverables/${crypto.randomBytes(4).toString('hex')}`,
            status: ['COMPLETED', 'COMPLETED', 'PENDING_REVIEW'][d % 3] as any,
            initialXpAwarded: d < 2,
            createdAt: daysAgo(rand(1, 60)),
          },
        });
        branchDeliverables.push(delivId);
        totalDeliverables++;
      }

      // Pick deliverable ids for this branch's deliverables
      allDeliverables.push({
        id: branchId,
        branchId,
        treeMemberIds: branchMembers.map(m => m.userId),
      });

      // Select tasks from templates
      const selectedTasks = shuffle([...taskTemplates]).slice(0, rand(4, 6));
      for (const tt of selectedTasks) {
        const taskId = uuid();
        const assignedTo = pick(branchMembers);
        const status = pick(['COMPLETED', 'COMPLETED', 'IN_PROGRESS', 'OPEN'] as const);
        const completedAt = status === 'COMPLETED' ? daysAgo(rand(1, 50)) : null;

        await prisma.task.create({
          data: {
            id: taskId,
            branchId: branchId,
            name: tt.name,
            description: tt.desc,
            status: status,
            assignedTo: status !== 'OPEN' ? assignedTo.userId : null,
            creatorId: pick(branchMembers).userId,
            phase: tt.phase as any,
            difficulty: tt.difficulty,
            requiredHours: tt.hours,
            completedAt: completedAt,
            completionComment: completedAt ? `Tarea completada satisfactoriamente.` : null,
          },
        });

        // Task tags
        for (const tag of tt.tags) {
          await prisma.taskTag.create({
            data: { id: uuid(), taskId, skillName: tag },
          });
        }
        totalTasks++;
      }
    }
  }
  console.log(`   ✅ ${totalTasks} tasks, ${totalDeliverables} deliverables creados\n`);

  // ═══════════════════════════════════════════════
  // 5. SATISFACTION RATINGS
  // ═══════════════════════════════════════════════
  console.log('⭐ Creando ratings de satisfacción...');

  // Re-fetch all deliverables with branch info
  const allDeliverablesData = await prisma.phaseDeliverable.findMany({
    include: { branch: { select: { treeId: true } } },
  });

  // Also fetch tree members for each tree
  const treeMemberMap: Record<string, { userId: string; treeMemberId: string }[]> = {};
  for (const [treeName, treeData] of Object.entries(treeMap)) {
    const members = await prisma.treeMember.findMany({
      where: { treeId: treeData.id },
      select: { userId: true, id: true },
    });
    treeMemberMap[treeData.id] = members;
  }

  let totalRatings = 0;
  for (const deliv of allDeliverablesData) {
    const treeId = deliv.branch.treeId;
    const treeDef = Object.values(treeMap).find(t => t.id === treeId);
    if (!treeDef) continue;

    const targetAvg = treeDef.def.satisfactionAvg;
    const members = treeMemberMap[treeId] || [];
    const ratingCount = rand(3, 6);
    const raters = shuffle(members).slice(0, ratingCount);
    
    // Generate ratings that average around targetAvg with some variation
    const baseRating = targetAvg;
    for (const rater of raters) {
      const variation = randFloat(-12, 12);
      const rating = Math.min(100, Math.max(50, Math.round((baseRating + variation) * 100) / 100));
      
      try {
        await prisma.satisfactionRating.create({
          data: {
            id: uuid(),
            deliverableId: deliv.id,
            userId: rater.userId,
            rating,
          },
        });
        totalRatings++;
      } catch (e: any) {
        // Skip duplicate (unique constraint: deliverableId + userId)
        if (!e.message?.includes('Unique constraint')) {
          console.error(`   ⚠️ Error creando rating: ${e.message}`);
        }
      }
    }
  }
  console.log(`   ✅ ${totalRatings} ratings creados\n`);

  // ═══════════════════════════════════════════════
  // 6. FIAT TRANSACTIONS (last 90 days)
  // ═══════════════════════════════════════════════
  console.log('💰 Creando transacciones FIAT...');
  let totalIncome = 0;
  let totalExpense = 0;

  for (const [treeName, treeData] of Object.entries(treeMap)) {
    const sectorKey = getSectorKey(treeName);
    const incomeTemplates = INCOME_TEMPLATES[sectorKey] || INCOME_TEMPLATES['sustentabilidad'];
    const expenseTemplates = EXPENSE_TEMPLATES['default'];
    const members = treeMemberMap[treeData.id] || [];
    if (members.length === 0) continue;

    // Generate transactions for the last 90 days
    const now = Date.now();
    const ninetyDaysMs = 90 * 86400000;
    
    // Income: 3-5 per month = 9-15 over 90 days
    const incomeCount = rand(9, 15);
    for (let i = 0; i < incomeCount; i++) {
      const template = pick(incomeTemplates);
      const daysOffset = rand(1, 89);
      const txDate = new Date(now - daysOffset * 86400000);
      const [minAmount, maxAmount] = treeData.def.monthlyIncomeRange;
      const monthlyAvgAmount = (minAmount + maxAmount) / 2;
      const amount = randFloat(monthlyAvgAmount * 0.3, monthlyAvgAmount * 1.5);
      const creator = pick(members);

      await prisma.fiatTransaction.create({
        data: {
          id: uuid(),
          treeId: treeData.id,
          amount,
          currency: 'CLP',
          type: 'INCOME',
          category: template.category as any,
          description: template.desc,
          counterpartyName: template.counterparty,
          counterpartyType: template.counterpartyType as any || 'CLIENT',
          verificationStatus: pick(['RECONCILED', 'AUDITED']),
          createdById: creator.userId,
          date: txDate,
          createdAt: txDate,
        },
      });
      totalIncome += amount;
    }

    // Expense: 1-3 per month = 3-9 over 90 days
    const expenseCount = rand(3, 9);
    for (let i = 0; i < expenseCount; i++) {
      const template = pick(expenseTemplates);
      const daysOffset = rand(1, 89);
      const txDate = new Date(now - daysOffset * 86400000);
      const [minAmount, maxAmount] = treeData.def.monthlyExpenseRange;
      const monthlyAvgAmount = (minAmount + maxAmount) / 2;
      const amount = randFloat(monthlyAvgAmount * 0.2, monthlyAvgAmount * 1.2);
      const creator = pick(members);

      await prisma.fiatTransaction.create({
        data: {
          id: uuid(),
          treeId: treeData.id,
          amount,
          currency: 'CLP',
          type: 'EXPENSE',
          category: template.category as any,
          description: template.desc,
          counterpartyName: template.counterparty,
          counterpartyType: template.counterpartyType as any || 'SUPPLIER',
          verificationStatus: pick(['RECONCILED', 'AUDITED']),
          createdById: creator.userId,
          date: txDate,
          createdAt: txDate,
        },
      });
      totalExpense += amount;
    }
  }

  const totalFiat = Math.round((totalIncome + totalExpense) * 100) / 100;
  console.log(`   ✅ Transacciones creadas: ${Math.round(totalIncome).toLocaleString('es-CL')} CLP income, ${Math.round(totalExpense).toLocaleString('es-CL')} CLP expense`);
  console.log(`   Volumen total: $${Math.round(totalFiat).toLocaleString('es-CL')} CLP\n`);

  // ═══════════════════════════════════════════════
  // 7. RESET LEO PASSWORD
  // ═══════════════════════════════════════════════
  await prisma.user.update({
    where: { id: LEO_ID },
    data: { password: hash },
  });
  console.log('🔑 Password de leo@leo reseteado a demo123\n');

  // ═══════════════════════════════════════════════
  // 8. VERIFICATION
  // ═══════════════════════════════════════════════
  console.log('📊 Verificando datos...');
  
  const treeCount = await prisma.tree.count({ where: { visibility: 'PUBLIC' } });
  const memberCount = await prisma.treeMember.count({ 
    where: { tree: { visibility: 'PUBLIC' }, status: 'VERIFIED' } 
  });
  const txCount = await prisma.fiatTransaction.count();
  const ratingCount = await prisma.satisfactionRating.count();
  const taskCount = await prisma.task.count();

  console.log(`   Árboles PUBLIC: ${treeCount}`);
  console.log(`   Miembros VERIFIED: ${memberCount}`);
  console.log(`   Transacciones FIAT: ${txCount}`);
  console.log(`   Ratings: ${ratingCount}`);
  console.log(`   Tasks: ${taskCount}`);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n✅ Seed completado en ${elapsed}s`);
  console.log('Ejecuta: curl http://localhost:3000/api/public/metrics para verificar\n');
}

main()
  .catch((e) => {
    console.error('❌ Error en seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
