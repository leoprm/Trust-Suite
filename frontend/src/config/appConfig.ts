interface AppConfig {
  id: string;
  name: string;
  shortName: string;
  description: string;
  defaultPath: string;
  serviceWorker: string;
}

export const appConfig: AppConfig = {
  id: 'trust-maker',
  name: 'Trust Maker',
  shortName: 'Trust Maker',
  description: 'Plataforma de confianza organizacional descentralizada.',
  defaultPath: '/',
  serviceWorker: '/sw.js',
};
