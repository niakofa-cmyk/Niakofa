import { Home, Calendar, ShoppingBag, MessageCircle, Bell, Users, User } from 'lucide-react';
import { useState } from 'react';

interface BottomNavProps {
  onNavigate?: (item: string) => void;
}

export function BottomNav({ onNavigate }: BottomNavProps) {
  const [active, setActive] = useState('community');

  const items = [
    { id: 'home', label: 'Home', icon: Home, badge: 0 },
    { id: 'events', label: 'Events', icon: Calendar, badge: 0 },
    { id: 'marketplace', label: 'Market', icon: ShoppingBag, badge: 0 },
    { id: 'messages', label: 'Messages', icon: MessageCircle, badge: 8 },
    { id: 'notifications', label: 'Alerts', icon: Bell, badge: 12 },
    { id: 'community', label: 'Community', icon: Users, badge: 0 },
    { id: 'profile', label: 'Profile', icon: User, badge: 0 },
  ];

  const handleClick = (id: string) => {
    setActive(id);
    onNavigate?.(id);
  };

  return (
    <nav className="hidden items-center justify-between border-t border-room-border bg-room-panel px-2 py-2 sm:flex sm:px-4">
      {items.map(item => {
        const Icon = item.icon;
        const isActive = active === item.id;
        return (
          <button
            key={item.id}
            onClick={() => handleClick(item.id)}
            className={`relative flex flex-1 flex-col items-center gap-0.5 rounded-lg py-1 transition-colors ${
              isActive ? 'text-brand-purple-light' : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            <div className="relative">
              <Icon size={18} />
              {item.badge > 0 && (
                <span className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-red px-1 text-[9px] font-bold text-white">
                  {item.badge}
                </span>
              )}
            </div>
            <span className="text-[9px] font-medium sm:text-[10px]">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
