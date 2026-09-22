import { useState } from 'react';
import type { Circle } from '@/types/circles';
import { LIVE_CIRCLE } from '@/data/mockData';
import { CirclesDiscovery } from '@/components/circles/CirclesDiscovery';
import { CircleRoom } from '@/components/circles/room/CircleRoom';
import { HostModal } from '@/components/circles/HostModal';
import { BottomNav } from '@/components/layout/BottomNav';

type View = 'discovery' | 'room';

function App() {
  const [view, setView] = useState<View>('discovery');
  const [activeCircle, setActiveCircle] = useState<Circle | null>(null);
  const [showHostModal, setShowHostModal] = useState(false);

  const handleJoinCircle = (circle: Circle) => {
    setActiveCircle(circle);
    setView('room');
  };

  const handleLeaveRoom = () => {
    setView('discovery');
    setActiveCircle(null);
  };

  const handleStartCircle = (config: {
    title: string;
    topic: string;
    description: string;
    type: 'audio' | 'video';
  }) => {
    setShowHostModal(false);
    setActiveCircle({
      ...LIVE_CIRCLE,
      title: config.title,
      topic: config.topic,
      description: config.description,
      type: config.type,
    });
    setView('room');
  };

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-room-bg">
      <div className="flex min-h-0 flex-1">
        {view === 'discovery' ? (
          <CirclesDiscovery
            onJoinCircle={handleJoinCircle}
            onHostCircle={() => setShowHostModal(true)}
          />
        ) : (
          activeCircle && <CircleRoom circle={activeCircle} onLeave={handleLeaveRoom} />
        )}
      </div>

      <BottomNav onNavigate={nav => {
        if (nav === 'community') {
          setView('discovery');
        }
      }} />

      {showHostModal && (
        <HostModal onClose={() => setShowHostModal(false)} onStart={handleStartCircle} />
      )}
    </div>
  );
}

export default App;
