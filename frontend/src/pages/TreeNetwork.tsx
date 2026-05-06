import { useState, useEffect, useRef, useCallback } from 'react';
// @ts-ignore
import ForceGraph2D from 'react-force-graph-2d';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../lib/api';
import { Network, ZoomIn, ZoomOut, LocateFixed, ChevronRight, MapPin, Search, Navigation } from 'lucide-react';

export default function TreeNetwork() {
  const [graphData, setGraphData] = useState<{ nodes: any[], links: any[] }>({ nodes: [], links: [] });
  const [loading, setLoading] = useState(true);
  const { centerId } = useParams<{ centerId?: string }>();
  const [dimensions, setDimensions] = useState({ width: window.innerWidth, height: window.innerHeight - 80 });
  const [selectedNode, setSelectedNode] = useState<any>(null);
  
  const [pathInfo, setPathInfo] = useState<any[]>([]);

  // Búsqueda Zonal States
  const [hashtagQuery, setHashtagQuery] = useState('');
  const [locationQuery, setLocationQuery] = useState('');
  const [suggestions, setSuggestions] = useState<{tag: string, count: number}[]>([]);
  const [providers, setProviders] = useState<any[]>([]);
  const [showProviders, setShowProviders] = useState(false);
  const [requestModal, setRequestModal] = useState<{ isOpen: boolean, treeId: string | null, hashtag: string }>({ isOpen: false, treeId: null, hashtag: '' });
  const [requestDescription, setRequestDescription] = useState('');

  const containerRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<any>(null);
  const navigate = useNavigate();
  const isMobile = window.innerWidth <= 768;

  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight
        });
      }
    };
    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    fetchNetwork(centerId || null);
  }, [centerId]);

  const fetchNetwork = async (centerId: string | null) => {
    setLoading(true);
    try {
      let activeCenter = centerId;
      if (!activeCenter) {
         activeCenter = localStorage.getItem('lastVisitedTreeId') || null;
      }
      const url = activeCenter ? `/trees/network/${activeCenter}` : '/trees/network/default';
      const { data } = await api.get(url);
      
      // Pin center node to 0,0 to naturally force a radial tree around it
      data.nodes.forEach((n: any) => {
        if (n.isCenter) {
          n.fx = 0;
          n.fy = 0;
        }
      });
      
      setGraphData(data);
      
      setTimeout(() => {
        if (fgRef.current && data.nodes.length > 0) {
          const phi = 1.618;
          fgRef.current.d3Force('charge').strength(-250 * phi);
          fgRef.current.d3Force('link').distance(60 * phi);
          fgRef.current.zoomToFit(400, 50);
        }
      }, 500);
    } catch (error: any) {
      console.error('Error fetching network', error);
      // If we got a 403/404 on a specific center, try default
      if ((error.response?.status === 403 || error.response?.status === 404) && centerId) {
        localStorage.removeItem('lastVisitedTreeId');
        fetchNetwork(null);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleNodeClick = useCallback(
    (node: any) => {
      setSelectedNode(node);
      // Recenter camera on node
      if (fgRef.current) {
        fgRef.current.centerAt(node.x, node.y, 400);
      }
    },
    []
  );

  const handleRecenter = () => {
    if (fgRef.current && graphData.nodes.length > 0) {
      const centerNode = graphData.nodes.find((n: any) => n.isCenter) || graphData.nodes[0];
      if (centerNode) {
        fgRef.current.centerAt(centerNode.x, centerNode.y, 400);
        fgRef.current.zoom(2.5, 400);
      }
    }
  };


  useEffect(() => {
    if (!selectedNode) {
      graphData.nodes.forEach((n: any) => { n.isHighlighted = false; });
      graphData.links.forEach((l: any) => { l.isHighlighted = false; });
      setPathInfo([]);
      if (fgRef.current) fgRef.current.d3ReheatSimulation();
      return;
    }
    // Instead of BFS to center, we just find direct neighbors
    const details: any[] = [];
    
    // Reset highlights
    graphData.nodes.forEach((n: any) => { n.isHighlighted = false; });
    graphData.links.forEach((l: any) => { l.isHighlighted = false; });
    
    graphData.links.forEach((l: any) => {
      const s = typeof l.source === 'object' ? l.source.id : l.source;
      const t = typeof l.target === 'object' ? l.target.id : l.target;
      
      if (s === selectedNode.id || t === selectedNode.id) {
        l.isHighlighted = true;
        const neighborId = s === selectedNode.id ? t : s;
        
        const fromNode = graphData.nodes.find((n: any) => n.id === selectedNode.id);
        const toNode = graphData.nodes.find((n: any) => n.id === neighborId);
        
        if (toNode) toNode.isHighlighted = true;
        
        details.push({
          from: fromNode?.name || selectedNode.id,
          to: toNode?.name || neighborId,
          percentage: l.sharedPercentage
        });
      }
    });

    const sNode = graphData.nodes.find((n: any) => n.id === selectedNode.id);
    if (sNode) sNode.isHighlighted = true;
    
    setPathInfo(details);

    // Wake up the graph to guarantee color and particle updates
    if (fgRef.current) {
       fgRef.current.d3ReheatSimulation();
    }
    
  }, [selectedNode, graphData]);

  // Handle Autocomplete Suggestions
  useEffect(() => {
    if (hashtagQuery.length < 2) {
      setSuggestions([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const { data } = await api.get(`/discovery/hashtags`, {
          params: { sector: locationQuery, city: locationQuery }
        });
        setSuggestions(data);
      } catch (e) {
        console.error(e);
      }
    }, 400); // 400ms debounce
    return () => clearTimeout(timer);
  }, [hashtagQuery, locationQuery]);

  const handleSearchProviders = async () => {
    if (!hashtagQuery) return;
    try {
       const { data } = await api.get('/discovery/providers', {
         params: { hashtag: hashtagQuery, sector: locationQuery, city: locationQuery }
       });
       setProviders(data);
       setShowProviders(true);
    } catch (e) {
       console.error(e);
       alert("Error buscando proveedores.");
    }
  };

  const submitProviderRequest = async () => {
    if (!requestModal.treeId || !requestDescription.trim()) return;
    try {
      await api.post('/discovery/request', {
        treeId: requestModal.treeId,
        hashtag: requestModal.hashtag,
        description: requestDescription
      });
      alert("¡Solicitud enviada con éxito al árbol proveedor!");
      setRequestModal({ isOpen: false, treeId: null, hashtag: '' });
      setRequestDescription('');
    } catch (e) {
      alert("Error enviando solicitud.");
    }
  };

  return (
    <div style={{ width: '100%', height: 'calc(100vh - 64px)', position: 'relative', overflow: 'hidden' }} ref={containerRef}>
      
      {/* UI Overlay */}
      <div style={{ 
        position: 'absolute', top: isMobile ? '1rem' : '1.5rem', left: isMobile ? '1rem' : '1.5rem', zIndex: 10, 
        pointerEvents: 'none' 
      }}>
        <h1 style={{ margin: 0, fontSize: isMobile ? '1.25rem' : '1.75rem', display: 'flex', alignItems: 'center', gap: '0.75rem', pointerEvents: 'auto' }}>
          <Network size={isMobile ? 22 : 28} stroke="var(--accent-primary)" />
          {isMobile ? 'Mapa de Ecosistemas' : 'Explorador de Ecosistemas'}
        </h1>
        {!isMobile && (
          <p style={{ margin: '0.5rem 0 0 0', color: 'var(--text-secondary)', maxWidth: '400px', pointerEvents: 'auto' }}>
            Visualizando conexiones a 3 saltos de distancia. <br />
            <b>Click:</b> Recentrar mapa. <b>Doble Click:</b> Entrar al entorno.
          </p>
        )}
      </div>

      {loading && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 15, background: 'rgba(15, 23, 42, 0.5)' }}>
          <div className="text-secondary">Analizando enlaces planetarios...</div>
        </div>
      )}

      {/* Discovery Floating Panel */}
      <div style={{ position: 'absolute', top: isMobile ? '6rem' : '1.5rem', right: '1.5rem', zIndex: 30, width: isMobile ? 'calc(100% - 3rem)' : '340px', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
         <div className="glass-panel" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem', border: '1px solid var(--border-color)', boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }}>
            <h3 style={{ margin: 0, fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Search size={18} stroke="var(--accent-primary)" /> Buscador Zonal y Proveedores
            </h3>
            <div style={{ position: 'relative' }}>
              <input 
                type="text" 
                className="input-field w-full" 
                placeholder="Busco... ej: #Plomeria"
                value={hashtagQuery}
                onChange={e => setHashtagQuery(e.target.value)}
              />
              {suggestions.length > 0 && hashtagQuery.length > 1 && (
                <div style={{ position: 'absolute', top: '105%', left: 0, right: 0, background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', maxHeight: '160px', overflowY: 'auto', zIndex: 40 }}>
                   {suggestions.map((s, i) => (
                     <div 
                       key={i} 
                       className="hover-lift" 
                       onClick={() => { setHashtagQuery(s.tag); setSuggestions([]); }}
                       style={{ padding: '0.5rem 1rem', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', borderBottom: '1px solid rgba(255,255,255,0.05)' }}
                     >
                       <span>{s.tag}</span>
                       <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>{s.count} requests cerca</span>
                     </div>
                   ))}
                </div>
              )}
            </div>
            <div>
              <input 
                type="text" 
                className="input-field w-full" 
                placeholder="Sector o Ciudad"
                value={locationQuery}
                onChange={e => setLocationQuery(e.target.value)}
              />
            </div>
            <button className="btn btn-primary w-full" onClick={handleSearchProviders}>Buscar Árboles Capacitados</button>
         </div>

         {showProviders && (
           <div className="glass-panel hover-lift" style={{ padding: '1rem', border: '1px solid var(--border-color)', maxHeight: '300px', overflowY: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem', alignItems: 'center' }}>
                <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{providers.length} Resultados Locales</span>
                <button onClick={() => setShowProviders(false)} className="text-secondary" style={{ fontSize: '0.8rem' }}>Cerrar</button>
              </div>
              {providers.length === 0 ? (
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>No hay clústers proveedores en tu sector todavía.</p>
              ) : (
                <div className="flex flex-col gap-3">
                  {providers.map(p => (
                    <div key={p.id} style={{ background: 'rgba(255,255,255,0.02)', padding: '0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                      <div className="flex items-center gap-2 mb-2">
                        <div style={{ fontSize: '1.5rem' }}>{p.icono || '🌳'}</div>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{p.name}</div>
                          <div style={{ fontSize: '0.75rem', color: p.exactMatch ? 'var(--accent-success)' : 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                            <Navigation size={10} /> {p.exactMatch ? `Mismo Sector (${p.sector})` : p.city} | XP: {p.treeXp}
                          </div>
                        </div>
                      </div>
                      <button 
                        className="btn btn-outline w-full" 
                        style={{ fontSize: '0.8rem', padding: '0.4rem', borderStyle: 'dashed' }}
                        onClick={() => setRequestModal({ isOpen: true, treeId: p.id, hashtag: hashtagQuery })}
                      >
                        Solicitar Ayuda
                      </button>
                    </div>
                  ))}
                </div>
              )}
           </div>
         )}
      </div>

      {requestModal.isOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)', padding: '1rem' }}>
           <div className="glass-panel" style={{ width: '100%', maxWidth: '400px', padding: '2rem', background: 'var(--bg-card)' }}>
             <h3 style={{ margin: '0 0 1rem 0', fontWeight: 600, fontSize: '1.2rem' }}>Describir Solicitud</h3>
             <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>Se creará una petición para {requestModal.hashtag} en el Árbol Proveedor seleccionado.</p>
             <textarea 
               className="input-field w-full mb-4" 
               rows={4} 
               placeholder="Ej: Necesito arreglar una fuga urgente debajo del lavamanos..."
               value={requestDescription}
               onChange={e => setRequestDescription(e.target.value)}
             />
             <div className="flex gap-2">
                <button className="btn btn-ghost flex-1" onClick={() => setRequestModal({ isOpen: false, treeId: null, hashtag: '' })}>Cancelar</button>
                <button className="btn btn-primary flex-1" onClick={submitProviderRequest} disabled={!requestDescription.trim()}>Enviar Solicitud</button>
             </div>
           </div>
        </div>
      )}

      {/* Internal Controls Overlay */}
      <div style={{ position: 'absolute', bottom: isMobile ? '7rem' : '2rem', right: '1.5rem', zIndex: 10, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {selectedNode && !selectedNode.isCenter && (
          <button 
            onClick={() => navigate(`/trees/network/${selectedNode.id}`)}
            style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'var(--surface-color)', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', border: '1px solid var(--border-color)', boxShadow: '0 4px 12px rgba(0,0,0,0.3)' }}
            title="Fijar Entorno como Centro"
          >
            <MapPin size={24} />
          </button>
        )}
        <button 
          onClick={handleRecenter}
          style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'var(--accent-primary)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.3)' }}
          title="Centrar en Origen"
        >
          <LocateFixed size={24} />
        </button>
        {!isMobile && (
          <>
            <button 
              onClick={() => fgRef.current?.zoom(fgRef.current.zoom() * 1.2, 400)}
              style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'var(--bg-glass)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
            >
              <ZoomIn size={18} />
            </button>
            <button 
              onClick={() => fgRef.current?.zoom(fgRef.current.zoom() / 1.2, 400)}
              style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'var(--bg-glass)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
            >
              <ZoomOut size={18} />
            </button>
          </>
        )}
      </div>

      {/* Selected Node Detail (Mobile/Desktop Overlay) */}
      {selectedNode && (
        <div style={{ 
          position: 'absolute', 
          bottom: '1.5rem', 
          left: '1.5rem', 
          right: '1.5rem', 
          zIndex: 20,
          background: 'var(--surface-color)',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border-color)',
          padding: '1.25rem',
          boxShadow: '0 -4px 20px rgba(0,0,0,0.3)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          maxWidth: isMobile ? 'none' : '400px'
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'rgba(59,130,246,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-primary)', flexShrink: 0 }}>
                <Network size={24} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.1rem' }}>{selectedNode.name}</h3>
                <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  {selectedNode.val} miembros activos
                </p>
              </div>
            </div>

            {pathInfo.length > 0 && (
               <div style={{ marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px solid rgba(255,255,255,0.1)', fontSize: '0.8rem', color: 'var(--text-secondary)', maxHeight: '100px', overflowY: 'auto' }}>
                  <strong style={{ color: 'var(--text-primary)' }}>Conexiones Directas:</strong>
                  <ul style={{ paddingLeft: '1.2rem', margin: '0.25rem 0 0 0' }}>
                     {pathInfo.map((p, i) => (
                        <li key={i}>{p.to} ({p.percentage?.toFixed(1) || 0}%)</li>
                     ))}
                  </ul>
               </div>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: isMobile ? 'row' : 'column', gap: '0.5rem', marginTop: isMobile ? '1rem' : 0 }}>
             <button 
               onClick={() => setSelectedNode(null)}
               className="btn btn-ghost"
               style={{ padding: '0.5rem' }}
             >
               Cerrar
             </button>
             <button 
               onClick={() => navigate(`/trees/${selectedNode.id}`)}
               className="btn btn-primary"
               style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.6rem 1rem' }}
             >
               Entrar <ChevronRight size={16} />
             </button>
          </div>
        </div>
      )}

      {/* Force Graph Render */}
      {!loading && graphData.nodes.length === 0 && (
         <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <p style={{ color: 'var(--text-secondary)' }}>No perteneces a ningún entorno aún. Crea uno para comenzar a explorar.</p>
         </div>
      )}

      {graphData.nodes.length > 0 && (
        <ForceGraph2D
          ref={fgRef}
          width={dimensions.width}
          height={dimensions.height}
          graphData={graphData}
          enableNodeDrag={false}
          nodeVal={(node: any) => Math.log10((node.val || 0) + 1) * 2 + 1}
          nodeLabel={(node: any) => `
            <div style="background: rgba(15, 23, 42, 0.95); padding: 12px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1); font-family: sans-serif; box-shadow: 0 4px 12px rgba(0,0,0,0.5);">
              <div style="font-weight: bold; font-size: 14px; margin-bottom: 4px; color: #fff;">${node.name || 'Desconocido'}</div>
              <div style="font-size: 12px; color: #94a3b8;">Personas: <span style="color: #6ee7b7; font-weight: 600;">${node.val || 0}</span></div>
              ${node.isCenter ? '<div style="margin-top: 6px; font-size: 10px; color: #8B4513; font-weight: bold; text-transform: uppercase;">⌖ Raíz Actual</div>' : ''}
              ${node.isMember && !node.isCenter ? '<div style="margin-top: 6px; font-size: 10px; color: #8B4513; font-weight: bold; text-transform: uppercase;">🌿 Eres Miembro</div>' : ''}
            </div>
          `}
          nodeColor={(node: any) => {
            if (node.isCenter) return '#ffffff'; // Blanco para la Raíz
            if (selectedNode) {
               if (node.id === selectedNode.id) return '#ffffff'; // Blanco para seleccionado
               if (!node.isHighlighted) return 'rgba(148, 163, 184, 0.1)'; 
            }
            if (node.isMember) return '#5c4033'; // Tronco (Dark brown)
            if (node.hopDistance === 1) return '#22c55e'; // Verde Hojas (Green)
            if (node.hopDistance === 2) return '#38bdf8'; // Azul Cielo (Sky blue)
            return '#94a3b8'; // fallback
          }}
          nodeRelSize={5}
          nodePointerAreaPaint={(node: any, color: string, ctx: any) => {
            if (node.x === undefined || node.y === undefined) return;
            const val = Math.log10((node.val || 0) + 1) * 2 + 1;
            const r = Math.sqrt(val) * 5; 
            ctx.fillStyle = color;
            
            // Círculo del nodo
            ctx.beginPath();
            ctx.arc(node.x, node.y, r + 5, 0, 2 * Math.PI, false);
            ctx.fill();
            
            // Área extendida para el texto visible
            ctx.fillRect(node.x - 40, node.y + r + 5, 80, 25);
          }}
          nodeCanvasObjectMode={() => 'after'}
          nodeCanvasObject={(node: any, ctx: any, globalScale: number) => {
            if (node.x === undefined || node.y === undefined) return;
            const label = node.name || '';
            const fontSize = 12 / globalScale;
            ctx.font = `${fontSize}px Sans-Serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
            
            // Sync with nodeVal scaling logic
            const val = Math.log10((node.val || 0) + 1) * 2 + 1;
            const r = Math.sqrt(val) * 5; 
            
            ctx.fillText(label, node.x, node.y + r + (fontSize * 1.5));
          }}
          linkColor={(link: any) => {
             if (selectedNode) {
                return link.isHighlighted ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.02)';
             }
             return 'rgba(255,255,255,0.1)';
          }}
          linkWidth={(link: any) => {
             const base = Math.max(1, (link.sharedPercentage || 0) / 15);
             if (link.isHighlighted) return base * 2.5; 
             return base;
          }}
          linkDirectionalParticles={(link: any) => link.isHighlighted ? 4 : 0}
          linkDirectionalParticleWidth={3}
          linkDirectionalParticleSpeed={(d: any) => d.value * 0.005}
          onNodeClick={handleNodeClick}
          onBackgroundClick={() => setSelectedNode(null)}
          d3AlphaDecay={0.05}
          d3VelocityDecay={0.4}
        />
      )}
    </div>
  );
}
