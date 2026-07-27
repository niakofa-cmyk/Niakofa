import { useState } from 'react';
import {
  Search,
  Plus,
  MapPin,
  Users,
  Mic,
  Video,
  Radio,
  Star,
  Play,
  Calendar,
} from 'lucide-react';
import type { Circle } from '@/types/circles';
import { DISCOVERY_CIRCLES } from '@/data/mockData';

interface CirclesDiscoveryProps {
  onJoinCircle: (circle: Circle) => void;
  onHostCircle: () => void;
}

export function CirclesDiscovery({ onJoinCircle, onHostCircle }: CirclesDiscoveryProps) {
  const [search, setSearch] = useState('');
  const [city, setCity] = useState('Atlanta');

  const filtered = DISCOVERY_CIRCLES.filter(c => {
    const q = search.toLowerCase();
    return (
      !q ||
      c.title.toLowerCase().includes(q) ||
      c.topic.toLowerCase().includes(q) ||
      c.neighborhood.toLowerCase().includes(q) ||
      c.tags.some(t => t.toLowerCase().includes(q))
    );
  });

  const liveCircles = filtered.filter(c => c.isLive);
  const scheduledCircles = filtered.filter(c => !c.isLive);

  return (
    <div className="flex h-full flex-col bg-room-bg">
      <header className="border-b border-room-border bg-room-panel px-4 py-4 sm:px-6">
        <div className="mx-auto max-w-5xl">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-white">Circles</h1>
              <p className="mt-0.5 text-xs text-gray-500">
                Live audio and video rooms in your community
              </p>
            </div>
            <button
              onClick={onHostCircle}
              className="flex items-center gap-1.5 rounded-full bg-brand-purple px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-purple-hover"
            >
              <Plus size={16} />
              Host a Circle
            </button>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"
              />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search circles, topics, neighborhoods..."
                className="w-full rounded-lg border border-room-border bg-room-card py-2.5 pl-9 pr-3 text-sm text-white placeholder-gray-500 outline-none focus:border-brand-purple"
              />
            </div>
            <div className="relative">
              <MapPin
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"
              />
              <select
                value={city}
                onChange={e => setCity(e.target.value)}
                className="appearance-none rounded-lg border border-room-border bg-room-card py-2.5 pl-9 pr-8 text-sm text-white outline-none focus:border-brand-purple"
              >
                <option>Atlanta</option>
                <option>Charlotte</option>
                <option>Houston</option>
                <option>Memphis</option>
                <option>New Orleans</option>
              </select>
            </div>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
        <div className="mx-auto max-w-5xl space-y-6">
          <section>
            <div className="mb-3 flex items-center gap-2">
              <span className="h-2 w-2 animate-pulse-live rounded-full bg-brand-green" />
              <h2 className="text-sm font-bold uppercase tracking-wider text-gray-400">
                Live Now ({liveCircles.length})
              </h2>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {liveCircles.map(circle => (
                <CircleCard
                  key={circle.id}
                  circle={circle}
                  onJoin={() => onJoinCircle(circle)}
                />
              ))}
            </div>
          </section>

          {scheduledCircles.length > 0 && (
            <section>
              <div className="mb-3 flex items-center gap-2">
                <Calendar size={14} className="text-gray-500" />
                <h2 className="text-sm font-bold uppercase tracking-wider text-gray-400">
                  Upcoming ({scheduledCircles.length})
                </h2>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {scheduledCircles.map(circle => (
                  <CircleCard
                    key={circle.id}
                    circle={circle}
                    onJoin={() => onJoinCircle(circle)}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function CircleCard({ circle, onJoin }: { circle: Circle; onJoin: () => void }) {
  return (
    <div className="group flex flex-col overflow-hidden rounded-xl border border-room-border bg-room-card transition-colors hover:border-brand-purple/50 hover:bg-room-hover">
      <div className="relative h-28 overflow-hidden">
        <img
          src={circle.hostAvatar}
          alt={circle.hostName}
          className="h-full w-full object-cover opacity-40 transition-opacity group-hover:opacity-60"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-room-card via-room-card/40 to-transparent" />
        <div className="absolute left-3 top-3 flex items-center gap-2">
          {circle.isLive ? (
            <span className="flex items-center gap-1 rounded-full bg-brand-green/90 px-2 py-0.5 text-[10px] font-bold uppercase text-white">
              <span className="h-1.5 w-1.5 rounded-full bg-white" />
              Live
            </span>
          ) : (
            <span className="flex items-center gap-1 rounded-full bg-gray-700/90 px-2 py-0.5 text-[10px] font-bold uppercase text-white">
              <Calendar size={10} />
              {circle.scheduledTime}
            </span>
          )}
          {circle.isRecording && (
            <span className="flex items-center gap-1 rounded-full bg-brand-red/90 px-2 py-0.5 text-[10px] font-bold uppercase text-white">
              <Radio size={10} />
              REC
            </span>
          )}
        </div>
        <div className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full bg-black/40">
          {circle.type === 'video' ? (
            <Video size={13} className="text-white" />
          ) : (
            <Mic size={13} className="text-white" />
          )}
        </div>
      </div>

      <div className="flex flex-1 flex-col p-3">
        <h3 className="text-sm font-bold text-white">{circle.title}</h3>
        <p className="mt-0.5 text-xs text-brand-purple-light">{circle.topic}</p>
        <p className="mt-1.5 line-clamp-2 text-xs text-gray-400">{circle.description}</p>

        <div className="mt-2 flex flex-wrap gap-1">
          {circle.tags.map(tag => (
            <span
              key={tag}
              className="rounded-full bg-room-hover px-2 py-0.5 text-[10px] font-medium text-gray-400"
            >
              {tag}
            </span>
          ))}
        </div>

        <div className="mt-3 flex items-center gap-2">
          <img
            src={circle.hostAvatar}
            alt={circle.hostName}
            className="h-6 w-6 rounded-full object-cover ring-1 ring-room-border"
          />
          <span className="text-[11px] text-gray-400">{circle.hostName}</span>
          <span className="flex items-center gap-0.5 text-[11px] text-gray-500">
            <Star size={10} className="text-amber-400" />
            {circle.followersCount.toLocaleString()}
          </span>
        </div>

        <div className="mt-3 flex items-center justify-between">
          <div className="flex items-center gap-3 text-[11px] text-gray-500">
            <span className="flex items-center gap-1">
              <Users size={11} />
              {circle.participantCount}
            </span>
            <span className="flex items-center gap-1">
              <Mic size={11} />
              {circle.stageCount}
            </span>
            <span className="flex items-center gap-1">
              <MapPin size={11} />
              {circle.neighborhood}
            </span>
          </div>
          <button
            onClick={onJoin}
            className="flex items-center gap-1 rounded-full bg-brand-purple px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-brand-purple-hover"
          >
            <Play size={12} />
            {circle.isLive ? 'Join' : 'Remind'}
          </button>
        </div>
      </div>
    </div>
  );
}
