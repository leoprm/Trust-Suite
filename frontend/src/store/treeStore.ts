import { create } from 'zustand';
import api from '../lib/api';

export type TreeSettings = {
  governance: {
    anyoneCanInvite: boolean;
    inviterCanDelete: boolean;
    powerAssignment: 'EGALITARIAN' | 'HIERARCHICAL';
    needVoting: 'DEMOCRATIC' | 'DIRECT_ACTION';
    decayMode: 'CONTINUOUS' | 'WORKDAY';
  };
  phases: ('INVESTIGATION' | 'DEVELOPMENT' | 'PRODUCTION' | 'DISTRIBUTION' | 'MAINTENANCE' | 'RECYCLING')[];
  modules: {
    points: { enabled: boolean; name: string };
    fiat: { enabled: boolean; name: string };
    levels: { enabled: boolean; name: string };
    effort: { 
      enabled: boolean; 
      name: string; 
      mode: 'DIFFICULTY_AND_TIME' | 'DIFFICULTY_ONLY' | 'TIME_ONLY';
    };
    satisfaction: { 
      enabled: boolean; 
      name: string; 
      evaluators: 'ASSIGNED_EXPERTS' | 'NEED_SPONSORS' | 'IDEA_VOTERS' | 'EVERYONE';
    };
  };
  dictionary: {
    treeName: string;
    memberName: string;
    branchName: string;
  }
};

export const defaultTreeSettings: TreeSettings = {
  governance: {
    anyoneCanInvite: false,
    inviterCanDelete: false,
    powerAssignment: 'EGALITARIAN',
    needVoting: 'DEMOCRATIC',
    decayMode: 'CONTINUOUS',
  },
  phases: [],
  modules: {
    points: { enabled: false, name: 'XP' },
    fiat: { enabled: false, name: 'Ledger Fiat' },
    levels: { enabled: false, name: 'Nivel' },
    effort: { enabled: false, name: 'Esfuerzo', mode: 'DIFFICULTY_AND_TIME' },
    satisfaction: { enabled: false, name: 'Satisfacción', evaluators: 'EVERYONE' },
  },
  dictionary: {
    treeName: 'Árbol',
    memberName: 'Miembros',
    branchName: 'Rama'
  }
};

export const pluralize = (word: string) => {
  if (!word) return '';
  const vowels = ['a', 'e', 'i', 'o', 'u', 'á', 'é', 'í', 'ó', 'ú'];
  const lastChar = word[word.length - 1].toLowerCase();
  if (vowels.includes(lastChar)) return word + 's';
  return word + 'es';
};

interface TreeState {
  activeTree: any | null;
  trees: any[];
  globalTrees: any[];
  loadingTrees: boolean;
  settings: TreeSettings;
  setActiveTree: (tree: any | null) => void;
  fetchTrees: () => Promise<void>;
}

export const useTreeStore = create<TreeState>((set, get) => ({
  activeTree: null,
  trees: [],
  globalTrees: [],
  loadingTrees: false,
  settings: defaultTreeSettings,
  
  fetchTrees: async () => {
    // Only set loading if empty to prevent UI flickering on refresh
    if (get().trees.length === 0) set({ loadingTrees: true });
    
    try {
      try {
        const { data: myTrees } = await api.get(`/trees?t=${Date.now()}`);
        set({ trees: myTrees });
      } catch (e) {
        console.error('Error fetching personal trees:', e);
      }
      
      try {
        const { data: globalTrees } = await api.get(`/trees/global?t=${Date.now()}`);
        set({ globalTrees });
      } catch (e) {
        console.error('Error fetching global trees:', e);
      }
    } catch (e) {
      console.error('Error fetching trees:', e);
    } finally {
      set({ loadingTrees: false });
    }
  },

  setActiveTree: (tree) => {
    if (!tree) {
      set({ activeTree: null, settings: defaultTreeSettings });
      return;
    }
    
    let parsedSettings = defaultTreeSettings;
    if (tree.settings) {
      try {
        const custom = JSON.parse(tree.settings);
        parsedSettings = {
           governance: { ...defaultTreeSettings.governance, ...custom?.governance },
           phases: custom.phases || defaultTreeSettings.phases,
           modules: {
             points: { ...defaultTreeSettings.modules.points, ...custom?.modules?.points },
             fiat: { ...defaultTreeSettings.modules.fiat, ...custom?.modules?.fiat },
             levels: { ...defaultTreeSettings.modules.levels, ...custom?.modules?.levels },
             effort: { ...defaultTreeSettings.modules.effort, ...custom?.modules?.effort },
             satisfaction: { ...defaultTreeSettings.modules.satisfaction, ...custom?.modules?.satisfaction },
           },
           dictionary: { ...defaultTreeSettings.dictionary, ...custom?.dictionary }
        };
      } catch (e) {
        console.error('Failed to parse tree settings', e);
      }
    }
    set({ activeTree: tree, settings: parsedSettings });
  }
}));
