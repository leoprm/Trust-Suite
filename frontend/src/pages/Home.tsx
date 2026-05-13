import ChatPanel from '../components/chat/ChatPanel';
import NeedDetail from '../components/detail/NeedDetail';
import { useUIStore } from '../store/uiStore';

function Home() {
  const activeNeedId = useUIStore((s) => s.activeNeedId);
  const setActiveNeed = useUIStore((s) => s.setActiveNeed);

  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
      {/* Main chat area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <ChatPanel activeNeedId={activeNeedId} />
      </div>

      {/* Detail panel (conditionally shown) */}
      {activeNeedId && (
        <NeedDetail
          needId={activeNeedId}
          onClose={() => setActiveNeed(null)}
        />
      )}
    </div>
  );
}

export default Home;
