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
                className="w-full rounded-lg border border-room-border bg-room-card py-2 pl-9 pr-3 text-sm text-white placeholder-gray-500 outline-none transition-colors focus:border-brand-purple"
                aria-label="Search circles"
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
                className="appearance-none rounded-lg border border-room-border bg-room-card py-2 pl-9 pr-8 text-sm text-white outline-none transition-colors focus:border-brand-purple"
                aria-label="Select city"
              >
                <option value="Atlanta">Atlanta</option>
                <option value="Charlotte">Charlotte</option>
                <option value="Houston">Houston</option>
                <option value="Memphis">Memphis</option>
                <option value="New Orleans">New Orleans</option>
              </select>
            </div>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="mx-auto max-w-5xl space-y-6">
          {liveCircles.length > 0 && (
            <section>
              <div className="mb-3 flex items-center gap-2">
                <span className="flex h-2 w-2 animate-pulse-live rounded-full bg-brand-green" />
                <h2 className="text-sm font-bold uppercase tracking-wider text-gray-400">
                  Live Now ({liveCircles.length})
                </h2>
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {liveCircles.map(circle => (
                  <CircleCard
                    key={circle.id}
                    circle={circle}
                    onJoin={() => onJoinCircle(circle)}
                  />
                ))}
              </div>
            </section>
          )}

          {scheduledCircles.length > 0 && (
            <section>
              <div className="mb-3 flex items-center gap-2">
                <Calendar size={14} className="text-gray-500" />
                <h2 className="text-sm font-bold uppercase tracking-wider text-gray-400">
                  Upcoming ({scheduledCircles.length})
                </h2>
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
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

          {filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <Search size={32} className="mb-3 text-gray-600" />
              <p className="text-sm text-gray-500">
                No circles found. Try a different search.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CircleCard({
  circle,
  onJoin,
}: {
  circle: Circle;
  onJoin: () => void;
}) {
  return (
    <div
      className={`group relative overflow-hidden rounded-2xl border bg-room-card p-4 transition-all hover:border-room-border-light hover:bg-room-hover ${
        circle.isLive ? 'border-brand-green/30' : 'border-room-border'
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="relative flex-shrink-0">
          <img
            src={circle.hostAvatar}
            alt={circle.hostName}
            className="h-12 w-12 rounded-full object-cover ring-2 ring-room-border"
          />
          {circle.isLive && (
            <span className="absolute -bottom-1 left-1/2 flex -translate-x-1/2 items-center gap-0.5 rounded-full bg-brand-green px-1.5 py-0.5 text-[8px] font-bold text-white">
              <Radio size={8} />
              LIVE
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="truncate text-sm font-bold text-white">{circle.title}</h3>
              <p className="truncate text-xs text-gray-500">{circle.topic}</p>
            </div>
            <button
              className="flex-shrink-0 text-gray-500 transition-colors hover:text-brand-amber"
              aria-label="Follow circle"
            >
              <Star size={16} />
            </button>
          </div>

          <div className="mt-2 flex items-center gap-3 text-[11px] text-gray-500">
            <span className="flex items-center gap-1">
              <MapPin size={11} />
              {circle.neighborhood}
            </span>
            <span className="flex items-center gap-1">
              {circle.type === 'video' ? <Video size={11} /> : <Mic size={11} />}
              {circle.type === 'video' ? 'Video' : 'Audio'}
            </span>
            {circle.isLive ? (
              <>
                <span className="flex items-center gap-1 text-brand-green">
                  <Users size={11} />
                  {circle.participantCount}
                </span>
                {circle.isRecording && (
                  <span className="flex items-center gap-1 text-brand-red">
                    <Radio size={10} />
                    REC
                  </span>
                )}
              </>
            ) : (
              circle.scheduledTime && (
                <span className="flex items-center gap-1 text-gray-400">
                  <Calendar size={11} />
                  {circle.scheduledTime}
                </span>
              )
            )}
          </div>

          <div className="mt-2 flex flex-wrap gap-1">
            {circle.tags.slice(0, 3).map(tag => (
              <span
                key={tag}
                className="rounded-full bg-room-hover px-2 py-0.5 text-[10px] font-medium text-gray-400"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between">
        <span className="text-[11px] text-gray-500">
          {circle.followersCount.toLocaleString()} followers
        </span>
        <button
          onClick={onJoin}
          className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold transition-colors ${
            circle.isLive
              ? 'bg-brand-green text-white hover:bg-brand-green-dim'
              : 'bg-room-hover text-gray-300 hover:bg-room-border'
          }`}
        >
          {circle.isLive ? (
            <>
              <Play size={12} />
              Join Circle
            </>
          ) : (
            'Set Reminder'
          )}
        </button>
      </div>
    </div>
  );
}
