import { useState, useRef, useEffect } from 'react';
import { Send, Sparkles } from 'lucide-react';
import api from '../../lib/api';
import './ChatPanel.css';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

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
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: 'Welcome to Trust Maker. Ask me about your trees, needs, or ideas.',
    },
  ]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const msgsEndRef = useRef<HTMLDivElement>(null);
  const sessionId = useRef(crypto.randomUUID());

  useEffect(() => {
    msgsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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

      {/* Suggestions (when empty) */}
      {messages.length <= 1 && (
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
