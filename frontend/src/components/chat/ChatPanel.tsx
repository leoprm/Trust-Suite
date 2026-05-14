import { useState, useRef, useEffect } from 'react';
import { Send, Sparkles, CheckCircle } from 'lucide-react';
import api from '../../lib/api';
import { useUIStore } from '../../store/uiStore';
import RatingForm from './RatingForm';
import './ChatPanel.css';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

interface HistoryMessage {
  id: string;
  role: string;
  content: string;
  createdAt: string;
}

const WELCOME_MSG: Message = {
  id: 'welcome',
  role: 'assistant',
  content: 'Welcome to Trust Maker. Ask me about your trees, needs, or ideas.',
};

const SUGGESTIONS = [
  'What are the most urgent needs?',
  'Summarize recent ideas in my trees',
  'Compare importance across trees',
  'Help me draft a new need',
];

interface ChatPanelProps {
  activeNeedId?: string | null;
}

function ChatPanel({ activeNeedId }: ChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([WELCOME_MSG]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [showingRating, setShowingRating] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const msgsEndRef = useRef<HTMLDivElement>(null);
  const sessionId = useRef(crypto.randomUUID());
  const activeTreeId = useUIStore((s) => s.activeTreeId);

  // ── Scroll to bottom on message changes ───────────────────────────────
  useEffect(() => {
    msgsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, showingRating]);

  // ── Load chat history when tree changes ───────────────────────────────
  useEffect(() => {
    if (!activeTreeId) return;

    let cancelled = false;

    const loadHistory = async () => {
      try {
        const { data } = await api.get('/concierge/history', {
          params: { treeId: activeTreeId },
        });
        const history: HistoryMessage[] = data?.messages ?? [];

        if (!cancelled) {
          if (history.length > 0) {
            setMessages(
              history.map((m) => ({
                id: m.id,
                role: m.role as 'user' | 'assistant',
                content: m.content,
              })),
            );
          } else {
            setMessages([WELCOME_MSG]);
          }
          setHistoryLoaded(true);
        }
      } catch (_err) {
        // API interceptor handles 401; keep welcome message on other errors
        if (!cancelled) {
          setMessages([WELCOME_MSG]);
          setHistoryLoaded(true);
        }
      }
    };

    loadHistory();
    return () => {
      cancelled = true;
    };
    // Reset historyLoaded when tree changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTreeId]);

  // Count assistant responses beyond the welcome message
  const assistantReplyCount = messages.filter(
    (m) => m.role === 'assistant' && m.id !== 'welcome',
  ).length;
  const canRate = assistantReplyCount > 0 && !!activeTreeId && !showingRating;

  const send = async () => {
    if (!input.trim() || sending) return;
    const text = input.trim();
    setInput('');
    const userMsgId = Date.now().toString();
    const userMsg: Message = { id: userMsgId, role: 'user', content: text };
    setMessages((m) => [...m, userMsg]);
    setSending(true);

    try {
      const body: Record<string, string> = {
        message: text,
        agentId: sessionId.current,
        treeId: activeTreeId || '',
      };
      if (activeNeedId) {
        body.needId = activeNeedId;
      }

      const { data } = await api.post('/concierge', body);

      const reply =
        data?.reply && data.reply.trim()
          ? data.reply
          : '(No response from agent)';

      setMessages((m) => [
        ...m,
        {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: reply,
        },
      ]);
    } catch (err: any) {
      const errorMsg =
        err?.response?.data?.error ??
        err?.message ??
        'Could not reach the agent. Is Hermes running?';

      setMessages((m) => [
        ...m,
        {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: `⚠️ ${errorMsg}`,
        },
      ]);
    } finally {
      setSending(false);
    }
  };

  const handleRatingComplete = (_result: unknown) => {
    // Rating submitted — keep showing result for a moment, then hide
    setTimeout(() => setShowingRating(false), 5000);
  };

  // ── Don't render suggestions until history check is done ──────────────
  const showSuggestions = historyLoaded && messages.length <= 1 && messages[0]?.id === 'welcome';

  return (
    <div className="chat-panel">
      {/* Messages */}
      <div className="chat-messages">
        {messages.map((msg) => (
          <div key={msg.id} className={`chat-msg chat-msg--${msg.role}`}>
            <div className={`chat-bubble ${msg.role === 'assistant' ? 'glass-panel' : ''}`}>
              {msg.content}
            </div>
          </div>
        ))}
        {sending && (
          <div className="chat-msg chat-msg--assistant">
            <div className="chat-bubble glass-panel chat-typing">
              <span className="dot" />
              <span className="dot" />
              <span className="dot" />
            </div>
          </div>
        )}
        <div ref={msgsEndRef} />
      </div>

      {/* Complete & Rate button */}
      {canRate && (
        <div className="chat-rate-bar">
          <button
            className="chat-rate-btn"
            onClick={() => setShowingRating(true)}
          >
            <CheckCircle size={16} />
            Completar y evaluar
          </button>
        </div>
      )}

      {/* Rating form */}
      {showingRating && activeTreeId && (
        <RatingForm
          agentId={sessionId.current}
          treeId={activeTreeId}
          taskId={sessionId.current}
          onComplete={handleRatingComplete}
          onCancel={() => setShowingRating(false)}
        />
      )}

      {/* Suggestions (when empty) */}
      {showSuggestions && (
        <div className="chat-suggestions">
          {SUGGESTIONS.map((s) => (
            <button key={s} className="chat-suggestion" onClick={() => setInput(s)}>
              <Sparkles size={14} />
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="chat-input-area">
        <div className="chat-input-row">
          <input
            className="chat-input"
            placeholder="Ask about your trees and needs..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && send()}
          />
          <button className="chat-send-btn" onClick={send} disabled={!input.trim() || sending}>
            <Send size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}

export default ChatPanel;
