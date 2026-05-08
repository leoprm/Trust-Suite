import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { TreePine, ChevronRight, TrendingUp, TrendingDown, Wallet, Star, Navigation, Globe } from 'lucide-react';
import { useTreeStore } from '../store/treeStore';
import { motion, AnimatePresence } from 'framer-motion';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { OptimizedText } from '../components/OptimizedText';
import { formatCompactCurrency } from '../lib/format';

export default function MyTreesList() {
  const { trees, globalTrees, loadingTrees: loading, fetchTrees } = useTreeStore();
  const navigate = useNavigate();
  const [expandedTreeId, setExpandedTreeId] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState('1M');
  const [activeMetric, setActiveMetric] = useState<'profit' | 'investment' | 'satisfaction' | null>(null);

  const toggleTree = (id: string, e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button') || (e.target as HTMLElement).closest('.metric-toggle') || (e.target as HTMLElement).closest('a')) return;
    setExpandedTreeId(prev => (prev === id ? null : id));
    setActiveMetric(null); // Reset metrics when toggling accordion
  };

  const toggleMetric = (metric: 'profit' | 'investment' | 'satisfaction', e: React.MouseEvent) => {
    e.stopPropagation();
    setActiveMetric(prev => (prev === metric ? null : metric));
  };

  useEffect(() => {
    fetchTrees();
  }, []);

  // Utility to generate Dynamic Card Background 
  // R = Profit (Red/Green), G = Satisfaction (Yellow/Greenish), B = Investment (Blue)
  const getDynamicBackground = (tree: any) => {
    const data = tree.healthData;
    const profit = Math.min(100, Math.max(0, (data?.fiatMonthlyProfit || 0) / 10)); // Normalize 0-100
    const inv = Math.min(100, Math.max(0, data?.inversionPct || 0)); // Already 0-100%
    const sat = Math.min(100, (data?.satisfaction || 0) * 20); // Scale 1-5 to 20-100

    const r = profit > 50 ? 20 : 60; // Redish if low profit
    const g = sat > 10 ? 40 : 20;    // Greenish if high sat
    const b = Math.round(30 + (inv / 100) * 90); // 30 (no inv) → 120 (full inv)
    return `rgba(${r}, ${g}, ${b}, 0.2)`; 
  };

  // Synthesize Chart Data generating parallel Group Data visually offset for the Difference Chart since API returns aggregated history
  const prepareChartData = (tree: any) => {
    const rawHistory = tree.history?.[timeRange] || [];
    return rawHistory.map((item: any) => {
        // Mock group data relatively for the visual Diff Chart execution if real group logic is missing
        const groupProfit = item.profit ? item.profit * 1.5 + 10 : 15;
        const groupInvestment = item.inversionPct ? Math.min(100, item.inversionPct * 1.2) : 20;
        const groupSatisfaction = item.satisfaction ? Math.min(5, item.satisfaction + 0.5) : 3;

        return {
          ...item,
          investment: item.inversionPct ?? 0, // use inversionPct for chart key 'investment'
          groupProfit,
          groupInvestment,
          groupSatisfaction,
          profitDiff: item.profit - groupProfit,
          investDiff: (item.inversionPct ?? 0) - groupInvestment,
          satDiff: item.satisfaction - groupSatisfaction
        };
    });
  };

  const renderTreeCard = (tree: any, isGlobal: boolean = false) => {
    const data = isGlobal ? tree.healthData : tree.personalHealthData;
    const hasProfit = data?.fiatMonthlyProfit >= 0;
    const isExpanded = expandedTreeId === tree.id;
    const chartData = prepareChartData(tree);

    return (
      <motion.div
        key={tree.id}
        layout
        style={{
          width: '100%', display: 'flex', flexDirection: 'column',
          padding: '1.25rem', background: getDynamicBackground(tree), 
          borderRadius: '16px', border: '1px solid rgba(255,255,255,0.05)',
          textAlign: 'left', backdropFilter: 'blur(10px)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.2)'
        }}
      >
        <div 
          onClick={(e) => toggleTree(tree.id, e)}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', width: '100%', cursor: 'pointer' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
            <div style={{
              width: '44px', height: '44px', borderRadius: '12px',
              background: 'rgba(255,255,255,0.1)',
              border: '1px solid rgba(255,255,255,0.1)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
            }}>
              <span style={{ fontSize: '1.5rem' }}>{tree.icono || '🌳'}</span>
            </div>
            <div>
              <OptimizedText 
                text={tree.name}
                style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--text-primary)' }}
              />
              <div style={{ fontSize: '0.75rem', color: isGlobal ? 'var(--text-secondary)' : 'var(--accent-primary)', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                {isGlobal ? <Globe size={10} /> : <div style={{width: 6, height: 6, borderRadius: '50%', background: 'var(--accent-success)'}} />}
                {isGlobal ? 'Ecosistema Público' : 'Miembro Activo'} • {tree._count?.members || 0} p.
              </div>
              {tree.locationPrivacy === 'EXACTA' && tree.direccionExacta && (
                 <a href={`geo:0,0?q=${encodeURIComponent(tree.direccionExacta)}`} target="_blank" rel="noreferrer" style={{ fontSize: '0.75rem', color: '#38bdf8', marginTop: '2px', display: 'inline-flex', alignItems: 'center', gap: '4px', textDecoration: 'none' }}>
                    <Navigation size={10} /> Ubicación Exacta
                 </a>
              )}
            </div>
          </div>
          <motion.div animate={{ rotate: isExpanded ? 90 : 0 }}>
            <ChevronRight size={20} stroke="rgba(255,255,255,0.2)" />
          </motion.div>
        </div>

        {/* Metrics Focus Configurator */}
        <div style={{ 
          display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem',
          paddingTop: '0.75rem', borderTop: '1px solid rgba(255,255,255,0.05)'
        }}>
          {/* Profit */}
          <div 
            className="metric-toggle hover-lift"
            onClick={(e) => toggleMetric('profit', e)}
            style={{ 
              display: 'flex', flexDirection: 'column', gap: '2px', cursor: 'pointer',
              padding: '6px', borderRadius: '8px',
              background: activeMetric === 'profit' ? 'rgba(255,255,255,0.08)' : 'transparent',
              opacity: activeMetric && activeMetric !== 'profit' ? 0.3 : 1, transition: 'all 0.2s', filter: activeMetric && activeMetric !== 'profit' ? 'grayscale(1)' : 'none'
            }}
          >
            <span style={{ fontSize: '0.65rem', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 600 }}>Rentabilidad</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', color: hasProfit ? 'var(--accent-success)' : '#ef4444', fontWeight: 700, fontSize: '0.9rem' }}>
              {hasProfit ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
              {formatCompactCurrency(data?.fiatMonthlyProfit || 0)}
            </div>
          </div>

          {/* Investment */}
          <div 
            className="metric-toggle hover-lift"
            onClick={(e) => toggleMetric('investment', e)}
            style={{ 
              display: 'flex', flexDirection: 'column', gap: '2px', cursor: 'pointer',
              padding: '6px', borderRadius: '8px',
              background: activeMetric === 'investment' ? 'rgba(255,255,255,0.08)' : 'transparent',
              opacity: activeMetric && activeMetric !== 'investment' ? 0.3 : 1, transition: 'all 0.2s', filter: activeMetric && activeMetric !== 'investment' ? 'grayscale(1)' : 'none'
            }}
          >
            <span style={{ fontSize: '0.65rem', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 600 }}>Inversión</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', color: 'var(--text-primary)', fontWeight: 700, fontSize: '0.85rem' }}>
              <Wallet size={14} color="#38bdf8" />
              {(data?.inversionPct || 0).toFixed(1)}%
            </div>
            <span style={{ fontSize: '0.58rem', color: '#38bdf8', opacity: 0.7, marginTop: '-1px' }}>Reinversión</span>
          </div>

          {/* Satisfaction */}
          <div 
            className="metric-toggle hover-lift"
            onClick={(e) => toggleMetric('satisfaction', e)}
            style={{ 
              display: 'flex', flexDirection: 'column', gap: '2px', cursor: 'pointer',
              padding: '6px', borderRadius: '8px',
              background: activeMetric === 'satisfaction' ? 'rgba(255,255,255,0.08)' : 'transparent',
              opacity: activeMetric && activeMetric !== 'satisfaction' ? 0.3 : 1, transition: 'all 0.2s', filter: activeMetric && activeMetric !== 'satisfaction' ? 'grayscale(1)' : 'none'
            }}
          >
            <span style={{ fontSize: '0.65rem', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 600 }}>Satisfacción</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', color: '#fbbf24', fontWeight: 700, fontSize: '0.9rem' }}>
              <Star size={14} fill="#fbbf24" stroke="none" />
              {data?.satisfaction || '---'}
            </div>
          </div>
        </div>

        {/* Dynamic Accordion Content vs Difference Area Charts */}
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: 'easeInOut' }}
              style={{ overflow: 'hidden' }}
            >
              <div style={{ marginTop: '1rem', background: 'rgba(0,0,0,0.15)', borderRadius: '12px', padding: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                    {isGlobal ? 'Sintetizador Grupal' : (activeMetric ? `Analizador de Delta (${activeMetric.toUpperCase()})` : 'Comparador Apilado')}
                  </span>
                  {!isGlobal && activeMetric && (
                     <div style={{ display: 'flex', gap: '0.5rem', fontSize: '0.65rem', color: 'var(--text-secondary)' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '3px'}}><div style={{width:8, height:8, background: 'var(--accent-primary)', borderRadius: '2px'}}/> Personal</span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '3px'}}><div style={{width:8, height:8, background: 'rgba(255,255,255,0.3)', borderRadius: '2px'}}/> Grupo</span>
                     </div>
                  )}
                </div>

                <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '1rem', height: !activeMetric && !isGlobal ? '380px' : '180px' }}>
                  {(!activeMetric && !isGlobal) ? (
                     // UNSTACKED DEFAULT MODE (Personal vs Group Separated)
                     <>
                       <div style={{ flex: 1, position: 'relative' }}>
                          <span style={{ position: 'absolute', top: 0, left: 10, fontSize: '0.6rem', color: 'var(--accent-primary)', zIndex: 10, fontWeight: 700, textTransform: 'uppercase' }}>Valor Personal</span>
                          <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={chartData} margin={{ top: 15, right: 0, left: -25, bottom: 0 }}>
                              <defs>
                                <linearGradient id="splitColorPersonal" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="5%" stopColor="var(--accent-primary)" stopOpacity={0.3}/>
                                  <stop offset="95%" stopColor="transparent" stopOpacity={0}/>
                                </linearGradient>
                              </defs>
                              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                              <XAxis dataKey="name" hide />
                              <YAxis hide domain={['auto', 'auto']} />
                              <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', fontSize: '0.7rem' }} />
                              <Area type="monotone" dataKey="profit" stroke="var(--accent-primary)" fill="url(#splitColorPersonal)" strokeWidth={2} />
                            </AreaChart>
                          </ResponsiveContainer>
                       </div>
                       <div style={{ flex: 1, position: 'relative' }}>
                          <span style={{ position: 'absolute', top: 0, left: 10, fontSize: '0.6rem', color: 'rgba(255,255,255,0.4)', zIndex: 10, fontWeight: 700, textTransform: 'uppercase' }}>Valor Grupal</span>
                          <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={chartData} margin={{ top: 15, right: 0, left: -25, bottom: 5 }}>
                              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 10 }} />
                              <YAxis hide domain={['auto', 'auto']} />
                              <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', fontSize: '0.7rem' }} />
                              <Area type="monotone" dataKey="groupProfit" stroke="rgba(255,255,255,0.3)" fill="none" strokeWidth={2} />
                            </AreaChart>
                          </ResponsiveContainer>
                       </div>
                     </>
                  ) : (
                     // COLLAPSED / DIFFERENCE AREA CHART / GLOBAL ISOLATED MODE
                     <ResponsiveContainer width="100%" height="100%">
                       <AreaChart data={chartData} margin={{ top: 10, right: 0, left: -25, bottom: 5 }}>
                         <defs>
                           <linearGradient id="splitColor" x1="0" y1="0" x2="0" y2="1">
                             <stop offset="5%" stopColor="var(--accent-success)" stopOpacity={0.3}/>
                             <stop offset="95%" stopColor="#ef4444" stopOpacity={0.3}/>
                           </linearGradient>
                         </defs>
                         <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                         <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 10 }} />
                         <YAxis hide domain={['auto', 'auto']} />
                         <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }} />
                         
                         {(!activeMetric && isGlobal) && (
                            <Area type="monotone" dataKey="groupProfit" stroke="rgba(255,255,255,0.2)" fill="none" strokeWidth={2} />
                         )}

                         {activeMetric === 'profit' && (
                           <>
                             <Area type="monotone" dataKey="groupProfit" stroke="rgba(255,255,255,0.3)" fill="none" strokeWidth={2} strokeDasharray="4 4" />
                             <Area type="monotone" dataKey="profit" stroke="var(--accent-success)" fill="url(#splitColor)" strokeWidth={2} />
                           </>
                         )}
                         {activeMetric === 'investment' && (
                           <>
                             <Area type="monotone" dataKey="groupInvestment" stroke="rgba(255,255,255,0.3)" fill="none" strokeWidth={2} strokeDasharray="4 4" />
                             <Area type="monotone" dataKey="investment" stroke="#38bdf8" fill="rgba(56,189,248,0.2)" strokeWidth={2} />
                           </>
                         )}
                         {activeMetric === 'satisfaction' && (
                           <>
                             <Area type="monotone" dataKey="groupSatisfaction" stroke="rgba(255,255,255,0.3)" fill="none" strokeWidth={2} strokeDasharray="4 4" />
                             <Area type="monotone" dataKey="satisfaction" stroke="#fbbf24" fill="rgba(251,191,36,0.2)" strokeWidth={2} />
                           </>
                         )}
                       </AreaChart>
                     </ResponsiveContainer>
                  )}
                </div>
                
                {/* Time Selectors */}
                <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', marginTop: '1rem' }}>
                  {['1D', '1S', '1M', '1A'].map((range) => (
                    <button
                      key={range}
                      onClick={(e) => { e.stopPropagation(); setTimeRange(range); }}
                      style={{
                        padding: '0.35rem 0.8rem', borderRadius: '100px', border: 'none',
                        fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer',
                        background: timeRange === range ? 'var(--accent-primary)' : 'rgba(255,255,255,0.05)',
                        color: timeRange === range ? 'white' : 'var(--text-secondary)',
                      }}
                    >
                      {range}
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    );
  };

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
        Cargando ecosistemas...
      </div>
    );
  }

  return (
    <div style={{ paddingBottom: '5rem', background: 'var(--bg-primary)', minHeight: '100vh' }}>
      {/* Header Sticky */}
      <div style={{
        padding: '1.25rem 1rem',
        borderBottom: '1px solid var(--border-color)',
        background: 'rgba(15, 23, 42, 0.4)',
        backdropFilter: 'blur(10px)',
        position: 'sticky',
        top: 0,
        zIndex: 50,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center'
      }}>
         <h1 style={{ margin: 0, fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <TreePine size={22} color="var(--accent-primary)" /> Árboles
         </h1>
      </div>
      
      {/* List */}
      <div style={{ padding: '1rem' }}>
        
        {/* Mis Árboles Section */}
        <div style={{ marginBottom: '2rem' }}>
           <h2 style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '1rem', marginLeft: '0.5rem' }}>Mis Árboles Activos</h2>
           {trees.length === 0 ? (
             <div style={{ padding: '3rem 1.5rem', textAlign: 'center', background: 'var(--surface-color)', borderRadius: '16px', border: '1px dashed var(--border-color)' }}>
               <p style={{ fontSize: '0.95rem', color: 'var(--text-secondary)' }}>Aún no participas en ecosistemas.</p>
               <button className="btn btn-primary" onClick={() => navigate('/trees/new')} style={{ marginTop: '1rem', scale: 0.9 }}>
                 Desplegar un Árbol
               </button>
             </div>
           ) : (
             <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
               {trees.map(tree => renderTreeCard(tree, false))}
             </div>
           )}
        </div>

        {/* Explorador Global Section */}
        {globalTrees?.length > 0 && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem', marginLeft: '0.5rem' }}>
              <h2 style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '1px', margin: 0 }}>Explorador Global</h2>
              <div style={{ height: '1px', flex: 1, background: 'linear-gradient(90deg, rgba(255,255,255,0.1) 0%, transparent 100%)' }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
               {globalTrees.map(tree => renderTreeCard(tree, true))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
