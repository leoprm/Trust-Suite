import { create } from 'zustand';
import { appConfig } from '../config/appConfig';

export type Entidad = 'arbol' | 'necesidad' | 'rama' | 'tarea';
export type Accion = 'crear' | 'hacer' | 'medir';
export type MobileColorMode = 'legacy' | 'modern';

export const ENTIDADES: Entidad[] = [...appConfig.matrixEntities];

export const LEGACY_ENTITY_COLORS: Record<Entidad, string> = {
  arbol: '#22c55e',
  necesidad: '#eab308',
  rama: '#3b82f6',
  tarea: '#ef4444',
};

export const MODERN_ENTITY_COLORS: Record<Entidad, string> = {
  arbol: '#FEDC3C',
  necesidad: '#01E9FC',
  rama: '#5869FD',
  tarea: '#FE78CD',
};

export const ENTITY_COLORS: Record<Entidad, string> = MODERN_ENTITY_COLORS;

export const ENTITY_LABELS: Record<Entidad, string> = {
  arbol:    'Árbol',
  necesidad:'Necesidad',
  rama:     'Rama',
  tarea:    'Tarea',
};

export const LEGACY_ACTION_COLORS: Record<Accion, string> = {
  crear: '#22c55e',
  hacer: '#eab308',
  medir: '#ef4444',
};

export const MODERN_ACTION_COLORS: Record<Accion, string> = {
  crear: '#FEDC3C',
  hacer: '#FE78CD',
  medir: '#5869FD',
};

export const ACTION_COLORS: Record<Accion, string> = MODERN_ACTION_COLORS;

export const ACTION_LABELS: Record<Accion, string> = {
  crear: 'Crear',
  hacer: 'Hacer',
  medir: 'Medir',
};

export type UtilityPanel = null | 'notifications' | 'profile' | 'privacy' | 'directory';

interface MatrixState {
  entidadActiva: Entidad;
  accionActiva: Accion;
  colorMode: MobileColorMode;
  isFilterModeActive: boolean;
  linajeActivo: { id: string; entidad: Entidad }[];
  utilityPanel: UtilityPanel;
  notificationCount: number;
  focusTreeId: string | null;
  ciclarEntidad: () => void;
  setEntidad: (e: Entidad) => void;
  setAccion: (a: Accion) => void;
  toggleColorMode: () => void;
  toggleFilterMode: () => void;
  toggleLinaje: (id: string, entidad: Entidad) => void;
  clearFilter: () => void;
  setUtilityPanel: (panel: UtilityPanel) => void;
  setNotificationCount: (n: number) => void;
  setFocusTreeId: (id: string | null) => void;
}

// ── Persist last page to localStorage ─────────────────────────────────────────
const STORAGE_KEY = 'trust-matrix-page';
const COLOR_MODE_KEY = 'trust-matrix-color-mode';

function loadSavedPage(): { entidadActiva: Entidad; accionActiva: Accion } {
  const fallbackEntity = (ENTIDADES[0] || appConfig.defaultEntity) as Entidad;

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const e = ENTIDADES.includes(parsed.e) ? parsed.e as Entidad : fallbackEntity;
      const a = (['crear','hacer','medir'] as Accion[]).includes(parsed.a) ? parsed.a as Accion : 'hacer';
      return { entidadActiva: e, accionActiva: a };
    }
  } catch {}
  return { entidadActiva: fallbackEntity, accionActiva: 'hacer' };
}

function savePage(e: Entidad, a: Accion) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ e, a })); } catch {}
}

function loadSavedColorMode(): MobileColorMode {
  try {
    const raw = localStorage.getItem(COLOR_MODE_KEY);
    if (raw === 'legacy' || raw === 'modern') return raw;
  } catch {}
  return 'modern';
}

function saveColorMode(mode: MobileColorMode) {
  try { localStorage.setItem(COLOR_MODE_KEY, mode); } catch {}
}

const saved = loadSavedPage();
const savedColorMode = loadSavedColorMode();

export const useMatrixStore = create<MatrixState>((set, get) => ({
  entidadActiva: saved.entidadActiva,
  accionActiva: saved.accionActiva,
  colorMode: savedColorMode,
  isFilterModeActive: false,
  linajeActivo: [],
  utilityPanel: null,
  notificationCount: 0,
  focusTreeId: null,

  ciclarEntidad: () => {
    const current = get().entidadActiva;
    const idx = ENTIDADES.indexOf(current);
    const next = ENTIDADES[(idx + 1) % ENTIDADES.length];
    set({ entidadActiva: next });
    savePage(next, get().accionActiva);
  },

  setEntidad: (e) => { set({ entidadActiva: e }); savePage(e, get().accionActiva); },
  setAccion: (a) => { set({ accionActiva: a }); savePage(get().entidadActiva, a); },
  toggleColorMode: () => {
    const nextMode: MobileColorMode = get().colorMode === 'modern' ? 'legacy' : 'modern';
    set({ colorMode: nextMode });
    saveColorMode(nextMode);
  },

  toggleFilterMode: () => {
    const nextMode = !get().isFilterModeActive;
    if (!nextMode) {
      set({ isFilterModeActive: false, linajeActivo: [] });
    } else {
      set({ isFilterModeActive: true });
    }
  },

  toggleLinaje: (id, entidad) => {
    const current = get().linajeActivo;
    const exists = current.find(item => item.id === id);
    if (exists) {
      const next = current.filter(item => item.id !== id);
      // Auto-exit filter mode when all items deselected
      if (next.length === 0) {
        set({ linajeActivo: [], isFilterModeActive: false });
      } else {
        set({ linajeActivo: next });
      }
    } else {
      set({ linajeActivo: [...current, { id, entidad }] });
    }
  },

  clearFilter: () => set({ isFilterModeActive: false, linajeActivo: [] }),

  setUtilityPanel: (panel) => set({ utilityPanel: panel }),
  setNotificationCount: (n) => set({ notificationCount: n }),
  setFocusTreeId: (id) => set({ focusTreeId: id }),
}));
