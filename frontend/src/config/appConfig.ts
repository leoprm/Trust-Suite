export type AppFlavor = 'trust-lite' | 'branch-os' | 'trace-lite' | 'trust-insight' | 'trust-landing';
export type MatrixEntity = 'arbol' | 'necesidad' | 'rama' | 'tarea';
export type DrawerPanelKey = 'notifications' | 'profile' | 'privacy' | 'directory';

interface AppFeatureFlags {
  admin: boolean;
  citizenProfile: boolean;
  directory: boolean;
  needs: boolean;
  people: boolean;
  talentSearch: boolean;
  treeList: boolean;
  treeNetwork: boolean;
}

interface AppConfig {
  id: AppFlavor;
  name: string;
  shortName: string;
  description: string;
  defaultPath: string;
  defaultEntity: MatrixEntity;
  matrixEntities: MatrixEntity[];
  drawerPanels: DrawerPanelKey[];
  features: AppFeatureFlags;
  serviceWorker: string;
}

const APP_CONFIGS: Record<AppFlavor, AppConfig> = {
  'trust-lite': {
    id: 'trust-lite',
    name: 'Trust Lite',
    shortName: 'Trust Lite',
    description: 'Arboles, necesidades y ramas de confianza.',
    defaultPath: '/',
    defaultEntity: 'arbol',
    matrixEntities: ['arbol', 'necesidad', 'rama'],
    drawerPanels: ['notifications', 'privacy', 'directory'],
    features: {
      admin: true,
      citizenProfile: false,
      directory: true,
      needs: true,
      people: true,
      talentSearch: false,
      treeList: true,
      treeNetwork: true,
    },
    serviceWorker: '/sw-trust-lite.js',
  },
  'branch-os': {
    id: 'branch-os',
    name: 'Branch OS',
    shortName: 'Branch OS',
    description: 'Tareas, ejecucion y calendario operativo.',
    defaultPath: '/',
    defaultEntity: 'tarea',
    matrixEntities: ['tarea'],
    drawerPanels: ['notifications', 'privacy'],
    features: {
      admin: false,
      citizenProfile: false,
      directory: false,
      needs: false,
      people: false,
      talentSearch: false,
      treeList: false,
      treeNetwork: false,
    },
    serviceWorker: '/sw-branch-os.js',
  },
  'trace-lite': {
    id: 'trace-lite',
    name: 'Trace Lite',
    shortName: 'Trace Lite',
    description: 'Historial verificable, perfil publico y busqueda de talento.',
    defaultPath: '/profile',
    defaultEntity: 'arbol',
    matrixEntities: ['arbol'],
    drawerPanels: ['notifications', 'profile', 'privacy'],
    features: {
      admin: false,
      citizenProfile: true,
      directory: false,
      needs: false,
      people: false,
      talentSearch: true,
      treeList: false,
      treeNetwork: false,
    },
    serviceWorker: '/sw-trace-lite.js',
  },
  'trust-insight': {
    id: 'trust-insight',
    name: 'Trust Insight',
    shortName: 'Insight',
    description: 'Radar de necesidades persistentes y escalamiento.',
    defaultPath: '/',
    defaultEntity: 'arbol',
    matrixEntities: ['arbol', 'necesidad'],
    drawerPanels: ['notifications', 'privacy'],
    features: {
      admin: false,
      citizenProfile: false,
      directory: false,
      needs: false,
      people: false,
      talentSearch: false,
      treeList: true,
      treeNetwork: true,
    },
    serviceWorker: '/sw-trust-insight.js',
  },
  'trust-landing': {
    id: 'trust-landing',
    name: 'Trust',
    shortName: 'Trust',
    description: 'Plataforma de confianza organizacional descentralizada.',
    defaultPath: '/',
    defaultEntity: 'arbol',
    matrixEntities: ['arbol'],
    drawerPanels: [],
    features: {
      admin: false,
      citizenProfile: false,
      directory: false,
      needs: false,
      people: false,
      talentSearch: false,
      treeList: false,
      treeNetwork: false,
    },
    serviceWorker: '/sw.js',
  },
};

function normalizeFlavor(value: string | undefined): AppFlavor {
  if (value === 'branch-os' || value === 'trace-lite' || value === 'trust-lite' || value === 'trust-insight' || value === 'trust-landing') {
    return value;
  }

  return 'trust-lite';
}

export const activeAppFlavor = normalizeFlavor(import.meta.env.VITE_APP_FLAVOR);
export const appConfig = APP_CONFIGS[activeAppFlavor];
export const isTrustLite = activeAppFlavor === 'trust-lite';
export const isBranchOS = activeAppFlavor === 'branch-os';
export const isTraceLite = activeAppFlavor === 'trace-lite';
export const isTrustInsight = activeAppFlavor === 'trust-insight';
export const isTrustLanding = activeAppFlavor === 'trust-landing';

/** URL del PWA Trust Lite según entorno: localhost → :5173, túnel → variable VITE_TRUST_LITE_URL */
export function getTrustLiteUrl(): string {
  const env = import.meta.env.VITE_TRUST_LITE_URL;
  if (env) return env;
  // Fallback: construir desde el origen actual (mismo hostname, puerto 5173)
  const host = window.location.hostname;
  const protocol = window.location.protocol;
  if (host === 'localhost' || host === '127.0.0.1') {
    return `${protocol}//${host}:5173`;
  }
  return `${protocol}//${host}:5173`; // dev genérico
}
