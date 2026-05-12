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
  id: string;
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

export const appConfig: AppConfig = {
  id: 'trust-maker',
  name: 'Trust Maker',
  shortName: 'Trust Maker',
  description: 'Plataforma de confianza organizacional descentralizada.',
  defaultPath: '/',
  defaultEntity: 'arbol',
  matrixEntities: ['arbol', 'necesidad', 'rama', 'tarea'],
  drawerPanels: ['notifications', 'profile', 'privacy', 'directory'],
  features: {
    admin: true,
    citizenProfile: true,
    directory: true,
    needs: true,
    people: true,
    talentSearch: true,
    treeList: true,
    treeNetwork: true,
  },
  serviceWorker: '/sw.js',
};
