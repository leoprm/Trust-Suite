import { CheckSquare, Users, TrendingUp, Home } from 'lucide-react';
import { useState } from 'react';
import api from '../lib/api';
import { getAppUrl, activeAppFlavor } from '../config/appConfig';

interface PwaLink {
  flavor: string;
  label: string;
  icon: React.ElementType;
}

const PWA_LINKS: PwaLink[] = [
  { flavor: 'trust-lite', label: 'Trust Lite', icon: Home },
  { flavor: 'branch-os', label: 'Branch OS', icon: CheckSquare },
  { flavor: 'trace-lite', label: 'Trace Lite', icon: Users },
  { flavor: 'trust-insight', label: 'Insight', icon: TrendingUp },
];

export default function AppSwitcher({ isMobile }: { isMobile?: boolean }) {
  const [navigating, setNavigating] = useState<string | null>(null);

  // Solo mostrar las apps que NO son la actual
  const links = PWA_LINKS.filter(p => p.flavor !== activeAppFlavor);

  async function navigateToApp(flavor: string) {
    setNavigating(flavor);
    try {
      const { data } = await api.get('/auth/session-token');
      const baseUrl = getAppUrl(flavor);
      window.location.href = `${baseUrl}?token=${encodeURIComponent(data.crossToken)}`;
    } catch {
      setNavigating(null);
      // Si falla, redirigir sin token — el usuario hará login manual
      window.location.href = getAppUrl(flavor);
    }
  }

  if (isMobile) {
    return (
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
        <div style={{ width: '1px', height: '24px', background: 'var(--border-color)' }} />
        {links.map(link => {
          const Icon = link.icon;
          return (
            <button
              key={link.flavor}
              onClick={() => navigateToApp(link.flavor)}
              className="btn btn-outline"
              disabled={navigating === link.flavor}
              style={{ padding: '0.3rem', width: '32px', height: '32px', opacity: navigating ? 0.5 : 1 }}
              title={link.label}
            >
              <Icon size={16} />
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
      <div style={{ width: '1px', height: '24px', background: 'var(--border-color)', margin: '0 0.25rem' }} />
      {links.map(link => {
        const Icon = link.icon;
        return (
          <button
            key={link.flavor}
            onClick={() => navigateToApp(link.flavor)}
            className="btn btn-outline"
            disabled={navigating !== null}
            style={{
              padding: '0.4rem',
              width: '36px',
              height: '36px',
              opacity: navigating === link.flavor ? 0.4 : 1,
              cursor: navigating ? 'wait' : 'pointer',
            }}
            title={`Abrir ${link.label}`}
          >
            <Icon size={18} />
          </button>
        );
      })}
    </div>
  );
}
