import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
} from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Loader2, WifiOff, RefreshCw, Mic, MicOff, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import ConciergeBubble from './ConciergeBubble';
import ConciergeMessage from './ConciergeMessage';
import type { ConciergeActionItem } from './ConciergeMessage';
import { toast } from './Toast';
import api from '../lib/api';
import { useAuthStore } from '../store/authStore';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface AutoOpenContext {
  type: 'branch' | 'invite' | 'task';
  id: string;
  label?: string;
}

interface ConciergeChatProps {
  autoOpenContext?: AutoOpenContext;
}

export type ConciergeAction =
  | 'suggest_existing'
  | 'propose_new'
  | 'create_tree'
  | 'create_hashtag_branch'
  | 'clarify'
  | 'chat';

type TutorialPhase = 
  | 'member_ask_skills' | 'member_show_trees' | 'member_show_needs'
  | 'creator_intro' | 'creator_financing' | 'creator_configure' | 'creator_post_creation'
  | null;

interface TreeSearchResultItem {
  id: string;
  name: string;
  description: string;
  capacidades: string[];
  memberCount: number;
  admissionPolicy: string;
  score: number;
  matchReason: string;
  openNeedsCount: number;
}

interface ConciergeActionButton {
  type: string;
  label: string;
  payload: Record<string, any>;
}

interface NeedMatch {
  id: string;
  name: string;
  description: string;
  score: number;
  treeName: string;
  phase: string;
}

interface TreeConfig {
  name: string;
  description: string;
  economyMode: string;
  financingMode: string;
  billingMode: string;
  visibility: string;
  tags: string[];
  membershipMode: string;
}

interface NeedDraft {
  title: string;
  description: string;
  tags: string[];
}

interface ConciergeResponse {
  action: ConciergeAction;
  matches: NeedMatch[];
  suggestion: string;
  nextSteps: string[];
  treeConfig?: TreeConfig;
  needDraft?: NeedDraft;
  actionButtons?: ConciergeActionButton[];
  tutorialPhase?: string | null;
}

interface ChatMessage {
  id: string;
  content: string;
  sender: 'user' | 'concierge';
  actions?: ConciergeActionItem[];
  timestamp: number;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const PANEL_COLORS = {
  bg: '#0D0D1A',
  headerBg: 'rgba(13,13,26,0.95)',
  text: '#FFF8DC',
  accent: '#FFD700',
  inputBg: 'rgba(26,26,46,0.8)',
  border: 'rgba(255,248,220,0.08)',
} as const;

const WELCOME_MESSAGE: ChatMessage = {
  id: 'welcome',
  content:
    '¡Hola! Soy Hermes, tu asistente de confianza. Puedo ayudarte con Trust Suite: crear árboles, necesidades, ramas hashtag, buscar talento, y más. ¿Qué necesitas?',
  sender: 'concierge',
  actions: [
    { label: 'Crear rama hashtag', action: 'clarify', payload: { hint: 'Crea una rama hashtag #seguridad' } },
    { label: 'Crear árbol', action: 'create_tree', payload: { hint: 'Crear comunidad de diseño gratuita y pública' } },
    { label: 'Crear necesidad', action: 'propose_new', payload: { hint: 'Busco desarrollador frontend' } },
  ],
  timestamp: Date.now(),
};

const WELCOME_FIRST_TIME: ChatMessage = {
  id: 'welcome-first',
  content:
    '👋 ¡Bienvenido a Trust Suite! Veo que aún no perteneces a ningún árbol. Puedo ayudarte a empezar:',
  sender: 'concierge',
  actions: [
    { label: '🌱 Quiero crear un árbol', action: 'goto_trees_new', payload: {} },
    { label: '🧑 Quiero unirme a un árbol', action: 'goto_trees_discover', payload: {} },
  ],
  timestamp: Date.now(),
};

function getTempWelcomeMessage(context: AutoOpenContext): ChatMessage {
  const label = context.label || context.id.slice(0, 8);
  const typeLabel = context.type === 'branch' ? 'rama' : context.type === 'invite' ? 'invitación' : 'tarea';
  return {
    id: 'welcome-temp',
    content: `👋 ¡Bienvenido a la ${typeLabel} **${label}**! Soy Hermes, tu asistente. Te muestro lo disponible en este espacio:`,
    sender: 'concierge',
    actions: [
      { label: '📋 Ver tareas disponibles', action: 'clarify', payload: { hint: '¿Qué tareas hay disponibles?' } },
      { label: '📝 Quiero registrarme', action: 'goto_register', payload: {} },
    ],
    timestamp: Date.now(),
  };
}

const OFFLINE_MESSAGE: ChatMessage = {
  id: 'offline',
  content: 'No tienes conexión a internet. Revisa tu red e intenta de nuevo.',
  sender: 'concierge',
  timestamp: Date.now(),
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function buildActions(response: ConciergeResponse, message: string): ConciergeActionItem[] {
  const actions: ConciergeActionItem[] = [];

  if (response.action === 'suggest_existing' && response.matches.length > 0) {
    // Add "Ver necesidad" for the top match
    response.matches.slice(0, 3).forEach((m) => {
      actions.push({
        label: `Ver "${m.name}"`,
        action: 'view_need',
        payload: { needId: m.id, needName: m.name },
      });
    });
  }

  if (response.action === 'propose_new' && response.needDraft) {
    actions.push({
      label: `Crear "${response.needDraft.title}"`,
      action: 'create_need',
      payload: { needDraft: response.needDraft, message },
    });
  }

  if (response.action === 'create_tree' && response.treeConfig) {
    actions.push({
      label: `Configurar "${response.treeConfig.name}"`,
      action: 'configure_tree',
      payload: { treeConfig: response.treeConfig, message },
    });
  }

  return actions;
}

function formatMatchesMessage(matches: NeedMatch[]): string {
  if (matches.length === 0) return '';
  if (matches.length === 1) {
    return `**${matches[0].name}** (${Math.round(matches[0].score * 100)}% coincidencia) — ${matches[0].treeName}`;
  }
  return matches
    .slice(0, 3)
    .map((m) => `• **${m.name}** (${Math.round(m.score * 100)}%) — ${m.treeName}`)
    .join('\n');
}

// ── Component ──────────────────────────────────────────────────────────────────

const ConciergeChat: React.FC<ConciergeChatProps> = ({ autoOpenContext }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [error, setError] = useState<string | null>(null);
  const [showOfflineMsg, setShowOfflineMsg] = useState(false);
  const [showWelcomeBanner, setShowWelcomeBanner] = useState(false);
  const [tutorialPhase, setTutorialPhase] = useState<TutorialPhase>(null);

  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const navigate = useNavigate();

  // ── Voice recognition ──────────────────────────────────────────────────

  const [listening, setListening] = useState(false);
  const speechSupported =
    typeof window !== 'undefined' &&
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);
  const preVoiceInputRef = useRef(''); // capture input before dictation starts

  const startListening = useCallback(() => {
    if (!speechSupported) return;
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = 'es-CL';
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;

    // Capture what was already typed so we append, not overwrite
    preVoiceInputRef.current = inputRef.current?.value || '';

    recognition.onresult = (event: any) => {
      const transcript = Array.from(event.results)
        .map((r: any) => r[0].transcript)
        .join('');
      const prev = preVoiceInputRef.current;
      setInput(prev ? prev + ' ' + transcript : transcript);
    };

    recognition.onerror = () => setListening(false);
    recognition.onend = () => {
      setListening(false);
      // Auto-send on final result
      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;
    setListening(true);
    recognition.start();
  }, [speechSupported]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setListening(false);
  }, []);

  // Track online/offline
  useEffect(() => {
    const goOnline = () => {
      setIsOnline(true);
      setShowOfflineMsg(false);
    };
    const goOffline = () => {
      setIsOnline(false);
      // Only show offline message if chat is open and has messages
      if (isOpen && messages.length > 0) {
        setShowOfflineMsg(true);
      }
    };
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, [isOpen, messages.length]);

  // Detect new user with zero trees → show welcome banner
  useEffect(() => {
    if (!isAuthenticated || !user) return;
    const dismissed = localStorage.getItem('hermes_tutorial_welcomed');
    if (dismissed) return;
    const memberships = user.memberships;
    if (!memberships || memberships.length === 0) {
      setShowWelcomeBanner(true);
    }
  }, [isAuthenticated, user]);

  // Detect tree creation post-tutorial → show post-creation guidance
  useEffect(() => {
    const pendingFlag = localStorage.getItem('hermes_creator_flow_pending');
    if (!pendingFlag) return;

    // If user already has memberships now, the tree was created!
    if (user?.memberships && user.memberships.length > 0) {
      localStorage.removeItem('hermes_creator_flow_pending');
      // Small delay so the user sees the dashboard before the chat pops
      const timer = setTimeout(() => {
        const treeName = pendingFlag !== 'true' ? pendingFlag : 'tu árbol';
        const treeId = user.memberships[0]?.treeId;
        setTutorialPhase('creator_post_creation');
        const postMsg: ChatMessage = {
          id: crypto.randomUUID(),
          content: `¡Árbol **${treeName}** creado! 🎉 Ahora, ¿qué querés hacer?`,
          sender: 'concierge',
          actions: [
            { label: '👥 Invitar miembros', action: 'creator_invite_members', payload: { treeId } },
            { label: '📋 Crear primera necesidad', action: 'creator_first_need', payload: { treeId } },
            { label: '💰 Configurar finanzas', action: 'creator_config_finances', payload: { treeId } },
          ],
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, postMsg]);
        setIsOpen(true);
      }, 800);
      return () => clearTimeout(timer);
    }

    // Poll for membership changes while flag is pending
    const interval = setInterval(async () => {
      try {
        const { useAuthStore: authStore } = await import('../store/authStore');
        await authStore.getState().fetchUser();
        const currentUser = authStore.getState().user;
        if (currentUser?.memberships && currentUser.memberships.length > 0) {
          clearInterval(interval);
          localStorage.removeItem('hermes_creator_flow_pending');
          const treeName = pendingFlag !== 'true' ? pendingFlag : currentUser.memberships[0]?.name || 'tu árbol';
          const treeId = currentUser.memberships[0]?.treeId;
          setTutorialPhase('creator_post_creation');
          const postMsg: ChatMessage = {
            id: crypto.randomUUID(),
            content: `¡Árbol **${treeName}** creado! 🎉 Ahora, ¿qué querés hacer?`,
            sender: 'concierge',
            actions: [
              { label: '👥 Invitar miembros', action: 'creator_invite_members', payload: { treeId } },
              { label: '📋 Crear primera necesidad', action: 'creator_first_need', payload: { treeId } },
              { label: '💰 Configurar finanzas', action: 'creator_config_finances', payload: { treeId } },
            ],
            timestamp: Date.now(),
          };
          setMessages((prev) => [...prev, postMsg]);
          setIsOpen(true);
        }
      } catch { /* ignore fetch errors */ }
    }, 2000);

    return () => clearInterval(interval);
  }, [user?.memberships?.length]);

  // Auto-open for temporary participants arriving via invite link
  useEffect(() => {
    if (!autoOpenContext) return;
    setMessages([{ ...getTempWelcomeMessage(autoOpenContext), timestamp: Date.now() }]);
    setIsOpen(true);
  }, [autoOpenContext]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, loading, isOpen]);

  // Focus input when chat opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [isOpen]);

  // ── Send message ──────────────────────────────────────────────────────────

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;

      // Prevent offline sends
      if (!isOnline) {
        toast('Sin conexión. Revisa tu red.', 'error');
        return;
      }

      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        content: trimmed,
        sender: 'user',
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, userMsg]);
      setInput('');
      setLoading(true);
      setError(null);

      try {
        // ── Tutorial: member flow ──────────────────────────────────────────
        if (tutorialPhase === 'member_ask_skills') {
          // User told us their skills — search public trees
          const { data } = await api.post('/concierge/search-trees', { query: trimmed });
          const trees: TreeSearchResultItem[] = data?.trees || [];

          setTutorialPhase('member_show_trees');

          if (trees.length > 0) {
            const topTrees = trees.slice(0, 3);
            const treeList = topTrees.map((t) =>
              `• **${t.name}** — ${t.matchReason} (${t.memberCount} miembros, ${t.openNeedsCount} necesidades abiertas)`
            ).join('\n');

            const resultMsg: ChatMessage = {
              id: crypto.randomUUID(),
              content: `Encontré estos árboles que coinciden con tus skills:\n\n${treeList}\n\n¿Cuál te interesa?`,
              sender: 'concierge',
              actions: topTrees.map((t) => ({
                label: `Unirme a "${t.name}"`,
                action: 'member_tutorial_select_tree',
                payload: { treeId: t.id, treeName: t.name },
              })),
              timestamp: Date.now(),
            };
            setMessages((prev) => [...prev, resultMsg]);
          } else {
            const noMatchMsg: ChatMessage = {
              id: crypto.randomUUID(),
              content: 'No encontré árboles públicos que coincidan con tu búsqueda. Intentá con otros términos o describí tus skills de otra forma.',
              sender: 'concierge',
              actions: [
                { label: '🌱 Crear un árbol nuevo', action: 'goto_trees_new', payload: {} },
                { label: 'Intentar con otros términos', action: 'retry', payload: { text: '' } },
              ],
              timestamp: Date.now(),
            };
            setMessages((prev) => [...prev, noMatchMsg]);
          }
          setLoading(false);
          return;
        }

        // ── Default: Hermes LLM ────────────────────────────────────────────
        // Get user ID for session persistence
        const user = (await import('../store/authStore')).useAuthStore.getState().user;
        const sessionId = user?.id || 'default';

        const { data } = await api.post<ConciergeResponse>('/concierge', {
          message: trimmed,
          sessionId,
          tutorialPhase: (tutorialPhase?.startsWith('creator_') && tutorialPhase !== 'creator_post_creation') ? tutorialPhase : undefined,
          ...(autoOpenContext ? { mode: 'temporary', contextId: autoOpenContext.id } : {}),
        });

        // Update tutorial phase from response
        if (data.tutorialPhase) {
          setTutorialPhase(data.tutorialPhase as TutorialPhase);
        }

        const suggestion = data.suggestion;
        const matchesText = formatMatchesMessage(data.matches);

        // Build concierge message content
        let content = suggestion;
        if (matchesText) {
          content += '\n\n' + matchesText;
        }

        // Build actions from actionButtons (Hermes-driven) + fallback to legacy buildActions
        const actionItems: ConciergeActionItem[] = [];
        
        // New: actionButtons from Hermes
        if (data.actionButtons?.length) {
          for (const btn of data.actionButtons) {
            actionItems.push({
              label: btn.label,
              action: btn.type as any,
              payload: btn.payload,
            });
          }
        }
        
        // Legacy: buildActions for backward compat
        if (actionItems.length === 0) {
          actionItems.push(...buildActions(data, trimmed));
        }

        const conciergeMsg: ChatMessage = {
          id: crypto.randomUUID(),
          content,
          sender: 'concierge',
          actions: actionItems.length > 0 ? actionItems : undefined,
          timestamp: Date.now(),
        };

        setMessages((prev) => [...prev, conciergeMsg]);
      } catch (err: any) {
        const errMsg =
          err?.response?.data?.error || 'Error al comunicarse con el Concierge.';
        setError(errMsg);
        toast(errMsg, 'error');

        // Add error message in chat
        const errorChatMsg: ChatMessage = {
          id: crypto.randomUUID(),
          content: errMsg + ' Intenta de nuevo.',
          sender: 'concierge',
          actions: [{ label: 'Reintentar', action: 'retry', payload: { text: trimmed } }],
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, errorChatMsg]);
      } finally {
        setLoading(false);
      }
    },
    [isOnline, tutorialPhase],
  );

  const handleWelcomeBannerClick = useCallback(() => {
    setShowWelcomeBanner(false);
    localStorage.setItem('hermes_tutorial_welcomed', '1');
    setMessages([{ ...WELCOME_FIRST_TIME, timestamp: Date.now() }]);
    setIsOpen(true);
  }, []);

  const handleDismissWelcome = useCallback(() => {
    setShowWelcomeBanner(false);
    localStorage.setItem('hermes_tutorial_welcomed', '1');
  }, []);

  // ── Handle actions ────────────────────────────────────────────────────────

  const handleAction = useCallback(
    (item: ConciergeActionItem) => {
      switch (item.action) {
        case 'view_need': {
          const needId = item.payload?.needId;
          if (needId) {
            navigate(`/needs/${needId}`);
            setIsOpen(false);
          }
          break;
        }
        case 'create_need': {
          // Navigate to need creation with prefill
          const draft = item.payload?.needDraft;
          if (draft) {
            const params = new URLSearchParams();
            params.set('title', draft.title);
            params.set('description', draft.description);
            if (draft.tags?.length) params.set('tags', draft.tags.join(','));
            navigate(`/needs/new?${params.toString()}`);
            setIsOpen(false);
          } else {
            navigate('/needs/new');
            setIsOpen(false);
          }
          break;
        }
        case 'configure_tree': {
          const config = item.payload?.treeConfig;
          // Save pending flag so we can detect tree creation on return
          localStorage.setItem('hermes_creator_flow_pending', config?.name || 'true');
          if (config) {
            navigate('/trees/new', { state: { prefill: config } });
            setIsOpen(false);
          } else {
            navigate('/trees/new');
            setIsOpen(false);
          }
          break;
        }
        case 'creator_quick_reply': {
          // Tutorial quick-reply: send value as message with next phase
          const value = item.payload?.value || item.label;
          const nextPhase = item.payload?.nextPhase || 'creator_configure';
          setTutorialPhase(nextPhase as TutorialPhase);
          sendMessage(value);
          break;
        }
        case 'create_tree': {
          if (item.payload?.message) {
            navigate(`/trees/new?${new URLSearchParams({ name: '', description: item.payload.message }).toString()}`);
            setIsOpen(false);
          } else {
            navigate('/trees/new');
            setIsOpen(false);
          }
          break;
        }
        case 'goto_trees_new': {
          // Start guided creator tutorial
          setIsOpen(true);
          setTutorialPhase('creator_intro');
          const introMsg: ChatMessage = {
            id: crypto.randomUUID(),
            content: '¿Qué tipo de comunidad querés crear? Contame un poco sobre el grupo, sus intereses u objetivos. Por ejemplo: "un grupo de diseñadores gráficos freelance", "desarrolladores web que quieren colaborar en proyectos open source"...',
            sender: 'concierge',
            timestamp: Date.now(),
          };
          setMessages((prev) => [...prev, introMsg]);
          break;
        }
        case 'goto_trees_discover': {
          // Start guided member tutorial — ask for skills instead of navigating
          setIsOpen(true);
          setTutorialPhase('member_ask_skills');
          const askMsg: ChatMessage = {
            id: crypto.randomUUID(),
            content: '¿Qué skills tenés o qué tipo de trabajo buscás? Por ejemplo: "soy frontend developer", "busco proyectos de diseño UX", "manejo Python y data science".',
            sender: 'concierge',
            timestamp: Date.now(),
          };
          setMessages((prev) => [...prev, askMsg]);
          break;
        }
        case 'member_tutorial_select_tree': {
          // User picked a tree from search results — join it
          const selectedTreeId = item.payload?.treeId;
          const selectedTreeName = item.payload?.treeName;
          if (selectedTreeId) {
            joinTreeAndShowNeeds(selectedTreeId, selectedTreeName);
          }
          break;
        }
        case 'create_hashtag_branch': {
          // Navigate to branch creation with pre-filled hashtag
          const tag = item.payload?.tag || '';
          const desc = item.payload?.description || '';
          navigate(`/trees/list`); // go to trees list to pick a tree first
          setIsOpen(false);
          // Show toast with instruction
          toast(`Selecciona un árbol para crear la rama #${tag}`, 'info');
          break;
        }
        case 'clarify':
        case 'propose_new': {
          // These are suggestion prompts — prefill input with the hint
          const hint = item.payload?.hint || item.label;
          sendMessage(hint);
          break;
        }
        case 'retry': {
          const text = item.payload?.text;
          if (text) sendMessage(text);
          break;
        }
        case 'goto_register': {
          navigate('/login');
          setIsOpen(false);
          break;
        }
        case 'creator_invite_members': {
          const treeId = item.payload?.treeId;
          if (treeId) {
            navigate(`/trees/${treeId}`);
            setIsOpen(false);
          }
          break;
        }
        case 'creator_first_need': {
          const treeId = item.payload?.treeId;
          if (treeId) {
            navigate(`/needs/new?treeId=${treeId}`);
            setIsOpen(false);
          } else {
            navigate('/needs/new');
            setIsOpen(false);
          }
          break;
        }
        case 'creator_config_finances': {
          const treeId = item.payload?.treeId;
          if (treeId) {
            // Navigate to tree detail — user can manage finances there
            navigate(`/trees/${treeId}`);
            setIsOpen(false);
          }
          break;
        }
        default:
          break;
      }
    },
    [navigate, sendMessage],
  );

  // ── Join tree & show open needs (member tutorial) ─────────────────────────

  const joinTreeAndShowNeeds = useCallback(
    async (treeId: string, treeName: string) => {
      setLoading(true);
      try {
        // Join the tree
        await api.post('/trees/join', { treeId });

        // Add success message
        const joinMsg: ChatMessage = {
          id: crypto.randomUUID(),
          content: `¡Te uniste a **${treeName}**! 🎉`,
          sender: 'concierge',
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, joinMsg]);

        // Fetch the tree's open needs
        const { data: treeData } = await api.get(`/trees/${treeId}`);

        // Fetch open needs for this tree
        const { data: needsData } = await api.get('/needs', {
          params: { treeId, status: 'OPEN,IN_VOTING,IN_IDEAS' },
        });
        const openNeeds = Array.isArray(needsData) ? needsData : needsData?.needs || [];

        setTutorialPhase('member_show_needs');

        let needsContent: string;
        let needActions: ConciergeActionItem[] = [];

        if (openNeeds.length > 0) {
          const topNeeds = openNeeds.slice(0, 5);
          needsContent = `Estas son las necesidades abiertas en **${treeName}**:\n\n` +
            topNeeds.map((n: any) =>
              `• **${n.title}** — ${n.status === 'IN_VOTING' ? 'en votación' : n.status === 'IN_IDEAS' ? 'en fase de ideas' : 'abierta'}`
            ).join('\n') +
            `\n\n¿Querés votar alguna o tomar una tarea?`;

          needActions = topNeeds.map((n: any) => ({
            label: `Ver "${n.title}"`,
            action: 'view_need',
            payload: { needId: n.id, needName: n.title },
          }));
        } else {
          needsContent = `**${treeName}** no tiene necesidades abiertas en este momento. ¡Sé el primero en proponer una!`;
          needActions = [{
            label: 'Crear necesidad',
            action: 'propose_new',
            payload: { hint: 'Propongo nueva necesidad en ' + treeName },
          }];
        }

        const needsMsg: ChatMessage = {
          id: crypto.randomUUID(),
          content: `¡Bienvenido! ${needsContent}`,
          sender: 'concierge',
          actions: needActions.length > 0 ? needActions : undefined,
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, needsMsg]);

        // Refresh auth user (to get updated memberships)
        try {
          const { useAuthStore } = await import('../store/authStore');
          useAuthStore.getState().fetchUser();
        } catch { /* silent */ }

      } catch (err: any) {
        const errMsg = err?.response?.data?.error || 'Error al unirse al árbol.';
        const errorMsg: ChatMessage = {
          id: crypto.randomUUID(),
          content: errMsg + ' Probá de nuevo o intentá con otro árbol.',
          sender: 'concierge',
          actions: [{ label: 'Reintentar', action: 'retry', payload: { text: '' } }],
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, errorMsg]);
        toast(errMsg, 'error');
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  // ── Handle open ───────────────────────────────────────────────────────────

  const toggleOpen = useCallback(() => {
    setIsOpen((prev) => {
      const next = !prev;
      // Show welcome message on first open
      if (next && messages.length === 0) {
        setMessages([WELCOME_MESSAGE]);
      }
      return next;
    });
  }, [messages.length]);

  // ── Keyboard submit ───────────────────────────────────────────────────────

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  const isMobile =
    typeof window !== 'undefined' && window.innerWidth <= 768;

  return (
    <>
      <AnimatePresence>
        {showWelcomeBanner && (
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.95 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            onClick={handleWelcomeBannerClick}
            style={{
              position: 'fixed',
              bottom: '8.8rem',
              right: '1.2rem',
              zIndex: 99997,
              background: 'linear-gradient(135deg, rgba(255,215,0,0.12), rgba(255,165,0,0.08))',
              border: '1px solid rgba(255,215,0,0.25)',
              borderRadius: '14px',
              padding: '0.7rem 2.2rem 0.7rem 1rem',
              cursor: 'pointer',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              boxShadow: '0 8px 32px rgba(255,215,0,0.12), 0 0 0 1px rgba(255,215,0,0.06)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.6rem',
              maxWidth: '280px',
              animation: 'welcome-glow 2.5s ease-in-out infinite',
              whiteSpace: 'nowrap',
            }}
          >
            <span style={{ fontSize: '0.82rem', color: '#FFF8DC', fontWeight: 500 }}>
              👋 ¿Primera vez? Dejame ayudarte
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleDismissWelcome();
              }}
              aria-label="Cerrar"
              style={{
                position: 'absolute',
                top: '4px',
                right: '4px',
                background: 'transparent',
                border: 'none',
                color: 'rgba(255,248,220,0.4)',
                cursor: 'pointer',
                padding: '2px',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <X size={12} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <ConciergeBubble isOpen={isOpen} onClick={toggleOpen} pendingWelcome={showWelcomeBanner} />

      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop — mobile only, dims dashboard behind chat */}
            {isMobile && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                onClick={() => setIsOpen(false)}
                style={{
                  position: 'fixed',
                  inset: 0,
                  background: 'rgba(0,0,0,0.55)',
                  zIndex: 99996,
                  backdropFilter: 'blur(2px)',
                  WebkitBackdropFilter: 'blur(2px)',
                }}
              />
            )}
            <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.96 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            style={{
              position: 'fixed',
              bottom: isMobile ? 0 : '5rem',
              right: isMobile ? 0 : '1.2rem',
              width: isMobile ? '100%' : '370px',
              height: isMobile ? '65%' : '520px',
              maxHeight: isMobile ? '65%' : 'calc(100vh - 7rem)',
              zIndex: 99997,
              background: PANEL_COLORS.bg,
              borderRadius: isMobile ? '16px 16px 0 0' : '16px',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              border: isMobile ? 'none' : `1px solid ${PANEL_COLORS.border}`,
              boxShadow: isMobile
                ? 'none'
                : '0 12px 48px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,215,0,0.08)',
            }}
          >
            {/* ── Header ─────────────────────────────────────────────────── */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0.8rem 1rem',
                background: PANEL_COLORS.headerBg,
                borderBottom: `1px solid ${PANEL_COLORS.border}`,
                backdropFilter: 'blur(12px)',
                flexShrink: 0,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                {/* Simple logo */}
                <div
                  style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, #FFD700, #FFA500)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    color: '#0D0D1A',
                  }}
                >
                  H
                </div>
                <span
                  style={{
                    fontWeight: 600,
                    fontSize: '0.9rem',
                    color: PANEL_COLORS.text,
                  }}
                >
                  Hermes Concierge
                </span>
              </div>

              {/* Online indicator + close */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                {autoOpenContext && (
                  <span
                    style={{
                      fontSize: '0.65rem',
                      padding: '0.15rem 0.5rem',
                      borderRadius: '8px',
                      background: 'rgba(255,215,0,0.12)',
                      color: PANEL_COLORS.accent,
                      fontWeight: 600,
                      letterSpacing: '0.03em',
                    }}
                  >
                    INVITADO
                  </span>
                )}
                {!isOnline && (
                  <span
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.25rem',
                      fontSize: '0.7rem',
                      color: 'rgba(239,68,68,0.8)',
                    }}
                  >
                    <WifiOff size={11} />
                    Offline
                  </span>
                )}
              </div>
            </div>

            {/* ── Messages ───────────────────────────────────────────────── */}
            <div
              ref={scrollContainerRef}
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: '0.8rem 0.4rem',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              {/* Empty state */}
              {messages.length === 0 && !loading && (
                <div
                  style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '2rem',
                    color: 'rgba(255,248,220,0.4)',
                    fontSize: '0.82rem',
                    textAlign: 'center',
                    gap: '0.8rem',
                  }}
                >
                  <div
                    style={{
                      width: '48px',
                      height: '48px',
                      borderRadius: '50%',
                      background: 'rgba(255,215,0,0.1)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '1.3rem',
                    }}
                  >
                    💬
                  </div>
                  <span>Pregúntame lo que necesitas</span>
                  <span style={{ fontSize: '0.72rem', opacity: 0.6 }}>
                    Ej: "Necesito desarrollador frontend" o "Quiero crear una
                    comunidad"
                  </span>
                </div>
              )}

              {/* Loading skeleton */}
              {loading && messages.length === 0 && (
                <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                  {[1, 2, 3].map((i) => (
                    <div
                      key={i}
                      style={{
                        height: `${28 + i * 12}px`,
                        width: `${60 + i * 10}%`,
                        background: 'rgba(255,248,220,0.06)',
                        borderRadius: '8px',
                        animation: 'pulse 1.5s ease-in-out infinite',
                      }}
                    />
                  ))}
                </div>
              )}

              {/* Messages */}
              <AnimatePresence>
                {messages.map((msg) => (
                  <ConciergeMessage
                    key={msg.id}
                    content={msg.content}
                    sender={msg.sender}
                    actions={msg.actions}
                    onAction={handleAction}
                    timestamp={msg.timestamp}
                  />
                ))}
              </AnimatePresence>

              {/* Offline message */}
              {showOfflineMsg && !isOnline && messages.length > 0 && (
                <ConciergeMessage
                  key="offline-banner"
                  content={OFFLINE_MESSAGE.content}
                  sender="concierge"
                />
              )}

              {/* Typing indicator */}
              {loading && messages.length > 0 && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.3rem',
                    padding: '0.5rem 2rem 0.5rem 0.4rem',
                  }}
                >
                  <span
                    style={{
                      fontSize: '0.65rem',
                      color: 'rgba(255,248,220,0.35)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      fontWeight: 600,
                    }}
                  >
                    Hermes Concierge
                  </span>
                  <div
                    style={{
                      display: 'flex',
                      gap: '0.25rem',
                      padding: '0.45rem 0.7rem',
                      background: '#16213E',
                      borderRadius: '12px 12px 12px 4px',
                    }}
                  >
                    {[0, 1, 2].map((i) => (
                      <motion.span
                        key={i}
                        animate={{ opacity: [0.3, 1, 0.3], y: [0, -3, 0] }}
                        transition={{
                          duration: 0.8,
                          repeat: Infinity,
                          delay: i * 0.15,
                          ease: 'easeInOut',
                        }}
                        style={{
                          width: '6px',
                          height: '6px',
                          borderRadius: '50%',
                          background: PANEL_COLORS.accent,
                          display: 'block',
                        }}
                      />
                    ))}
                  </div>
                </motion.div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* ── Error banner ─────────────────────────────────────────────── */}
            <AnimatePresence>
              {error && !loading && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.5rem 1rem',
                    background: 'rgba(239,68,68,0.1)',
                    borderTop: '1px solid rgba(239,68,68,0.2)',
                    fontSize: '0.75rem',
                    color: 'rgba(239,68,68,0.9)',
                    flexShrink: 0,
                  }}
                >
                  <RefreshCw
                    size={13}
                    style={{ cursor: 'pointer' }}
                    onClick={() => {
                      setError(null);
                      const lastUserMsg = [...messages]
                        .reverse()
                        .find((m) => m.sender === 'user');
                      if (lastUserMsg) sendMessage(lastUserMsg.content);
                    }}
                  />
                  <span style={{ flex: 1 }}>{error}</span>
                </motion.div>
              )}
            </AnimatePresence>

            {/* ── Input ───────────────────────────────────────────────────── */}
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-end',
                gap: '0.5rem',
                padding: '0.65rem 0.8rem',
                background: PANEL_COLORS.headerBg,
                borderTop: `1px solid ${PANEL_COLORS.border}`,
                flexShrink: 0,
              }}
            >
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="¿Qué necesitás?"
                rows={1}
                disabled={loading}
                style={{
                  flex: 1,
                  resize: 'none',
                  background: PANEL_COLORS.inputBg,
                  border: `1px solid ${PANEL_COLORS.border}`,
                  borderRadius: '10px',
                  padding: '0.55rem 0.8rem',
                  color: PANEL_COLORS.text,
                  fontSize: '0.82rem',
                  fontFamily: 'inherit',
                  lineHeight: 1.4,
                  outline: 'none',
                  maxHeight: '100px',
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = PANEL_COLORS.accent;
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = PANEL_COLORS.border;
                }}
              />
              {/* Mic button */}
              {speechSupported && (
                <motion.button
                  whileHover={{ scale: 1.08 }}
                  whileTap={{ scale: 0.93 }}
                  onClick={listening ? stopListening : startListening}
                  disabled={loading}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '36px',
                    height: '36px',
                    borderRadius: '50%',
                    background: listening
                      ? 'rgba(239, 68, 68, 0.2)'
                      : 'rgba(255,248,220,0.08)',
                    border: listening
                      ? '1.5px solid rgba(239, 68, 68, 0.5)'
                      : '1px solid var(--border-color)',
                    cursor: loading ? 'default' : 'pointer',
                    padding: 0,
                    transition: 'all 0.2s',
                    animation: listening ? 'pulse-mic 1.5s infinite' : 'none',
                    opacity: loading ? 0.4 : 1,
                  }}
                  title={listening ? 'Detener grabación' : 'Hablar por voz'}
                >
                  {listening ? (
                    <Mic size={15} color="#f87171" />
                  ) : (
                    <Mic size={15} color="rgba(255,248,220,0.5)" />
                  )}
                </motion.button>
              )}
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => sendMessage(input)}
                disabled={!input.trim() || loading || !isOnline}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '36px',
                  height: '36px',
                  borderRadius: '50%',
                  background:
                    input.trim() && !loading && isOnline
                      ? PANEL_COLORS.accent
                      : 'rgba(255,248,220,0.08)',
                  border: 'none',
                  cursor:
                    input.trim() && !loading && isOnline ? 'pointer' : 'default',
                  padding: 0,
                  transition: 'background 0.15s',
                }}
              >
                {loading ? (
                  <Loader2 size={16} className="animate-spin" color="#0D0D1A" />
                ) : (
                  <Send
                    size={14}
                    color={
                      input.trim() && isOnline ? '#0D0D1A' : 'rgba(255,248,220,0.3)'
                    }
                  />
                )}
              </motion.button>
            </div>
          </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
};

export default ConciergeChat;
export type { ConciergeResponse, NeedMatch, TreeConfig, NeedDraft };
