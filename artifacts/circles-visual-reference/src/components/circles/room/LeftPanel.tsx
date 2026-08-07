import { useState } from 'react';
import {
  Mic,
  MicOff,
  Hand,
  Video,
  VideoOff,
  Users,
  ChevronRight,
  Radio,
  Search,
} from 'lucide-react';
import type { Circle, Participant, LeftPanelTab } from '@/types/circles';

interface LeftPanelProps {
  circle: Circle;
  stageParticipants: Participant[];
  audienceParticipants: Participant[];
  currentUserId: string;
  leftTab: LeftPanelTab;
  recordingTime: string;
  onSetLeftTab: (tab: LeftPanelTab) => void;
  onLeave: () => void;
}

const REACTIONS = ['👋', '❤️', '😂', '😮', '🤔', '🔥', '💯'];

export function LeftPanel({
  circle,
  stageParticipants,
  audienceParticipants,
  currentUserId,
  leftTab,
  recordingTime,
  onSetLeftTab,
  onLeave,
}: LeftPanelProps) {
  const [audienceSearch, setAudienceSearch] = useState('');
  const [showAllAudience, setShowAllAudience] = useState(false);

  const filteredAudience = audienceSearch
    ? audienceParticipants.filter(p =>
        p.name.toLowerCase().includes(audienceSearch.toLowerCase())
      )
    : audienceParticipants;

  const visibleAudience = showAllAudience ? filteredAudience : filteredAudience.slice(0, 8);

  return (
    <aside className="flex h-full w-full flex-col bg-room-panel">
      <div className="border-b border-room-border p-3">
        <button
          onClick={onLeave}
          className="mb-3 flex items-center gap-1.5 text-xs font-medium text-gray-400 transition-colors hover:text-white"
        >
          <ChevronRight size={14} className="rotate-180" />
          Back to Circles
        </button>

        <h2 className="text-base font-bold text-white">{circle.title}</h2>

        <div className="mt-2 flex items-center gap-3 text-xs">
          <span className="flex items-center gap-1.5 font-semibold text-brand-green">
            <span className="h-2 w-2 animate-pulse-live rounded-full bg-brand-green" />
            LIVE
          </span>
          {circle.isRecording && (
            <span className="flex items-center gap-1 font-semibold text-brand-red">
              <Radio size={12} />
              {recordingTime}
            </span>
          )}
          <span className="text-gray-500">{circle.topic}</span>
        </div>
      </div>

      <div className="flex border-b border-room-border" role="tablist">
        <button
          onClick={() => onSetLeftTab('people')}
          role="tab"
          aria-selected={leftTab === 'people'}
          className={`flex-1 py-2 text-xs font-semibold transition-colors ${
            leftTab === 'people'
              ? 'border-b-2 border-brand-purple text-white'
              : 'text-gray-500 hover:text-gray-300'
          }`}
        >
          People ({stageParticipants.length + audienceParticipants.length})
        </button>
        <button
          onClick={() => onSetLeftTab('reactions')}
          role="tab"
          aria-selected={leftTab === 'reactions'}
          className={`flex-1 py-2 text-xs font-semibold transition-colors ${
            leftTab === 'reactions'
              ? 'border-b-2 border-brand-purple text-white'
              : 'text-gray-500 hover:text-gray-300'
          }`}
        >
          Reactions
        </button>
      </div>

      {leftTab === 'people' ? (
        <div className="flex-1 overflow-y-auto p-3">
          <div className="mb-4">
            <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-gray-500">
              On Stage ({stageParticipants.length})
            </h3>
            <div className="space-y-1.5">
              {stageParticipants.map(p => (
                <div
                  key={p.id}
                  className="flex items-center gap-2.5 rounded-lg px-2 py-1.5"
                >
                  <div className="relative flex-shrink-0">
                    <img
                      src={p.avatar}
                      alt={p.name}
                      className="h-8 w-8 rounded-full object-cover ring-1 ring-room-border"
                    />
                    {p.isOnline && (
                      <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-brand-green ring-2 ring-room-panel" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-xs font-medium text-white">
                        {p.name}
                        {p.id === currentUserId && (
                          <span className="ml-1 text-gray-500">(You)</span>
                        )}
                      </span>
                      {p.role === 'host' && (
                        <span className="rounded bg-brand-purple px-1 py-0.5 text-[8px] font-bold text-white">
                          HOST
                        </span>
                      )}
                      {p.role === 'co-host' && (
                        <span className="rounded bg-brand-blue px-1 py-0.5 text-[8px] font-bold text-white">
                          CO-HOST
                        </span>
                      )}
                    </div>
                  </div>
                  <div
                    className={`flex h-6 w-6 items-center justify-center rounded-full ${
                      p.isMicOn ? 'bg-brand-green/20' : 'bg-red-500/20'
                    }`}
                  >
                    {p.isMicOn ? (
                      <Mic size={11} className="text-brand-green" />
                    ) : (
                      <MicOff size={11} className="text-red-400" />
                    )}
                  </div>
                  {circle.type === 'video' && (
                    <div
                      className={`flex h-6 w-6 items-center justify-center rounded-full ${
                        p.isCameraOn ? 'bg-brand-green/20' : 'bg-room-hover'
                      }`}
                    >
                      {p.isCameraOn ? (
                        <Video size={11} className="text-brand-green" />
                      ) : (
                        <VideoOff size={11} className="text-gray-500" />
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-gray-500">
                <Users size={12} />
                Audience ({audienceParticipants.length})
              </h3>
            </div>
            <div className="relative mb-2">
              <Search
                size={12}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-600"
              />
              <input
                value={audienceSearch}
                onChange={e => setAudienceSearch(e.target.value)}
                placeholder="Search audience..."
                className="w-full rounded-lg border border-room-border bg-room-card py-1.5 pl-7 pr-2 text-[11px] text-white placeholder-gray-600 outline-none focus:border-brand-purple"
                aria-label="Search audience members"
              />
            </div>
            <div className="space-y-1">
              {visibleAudience.map(p => (
                <div
                  key={p.id}
                  className="flex items-center gap-2.5 rounded-lg px-2 py-1.5"
                >
                  <div className="relative flex-shrink-0">
                    <img
                      src={p.avatar}
                      alt={p.name}
                      className="h-7 w-7 rounded-full object-cover ring-1 ring-room-border"
                    />
                    {p.isOnline && (
                      <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full bg-brand-green ring-2 ring-room-panel" />
                    )}
                  </div>
                  <span className="flex-1 truncate text-xs text-gray-400">{p.name}</span>
                  {p.hasRaisedHand && (
                    <Hand size={12} className="text-amber-400" />
                  )}
                </div>
              ))}
            </div>
            {filteredAudience.length > 8 && (
              <button
                onClick={() => setShowAllAudience(v => !v)}
                className="mt-2 w-full rounded-lg py-1.5 text-center text-[11px] font-medium text-brand-purple-light transition-colors hover:text-brand-purple"
              >
                {showAllAudience ? 'Show Less' : `See All (${filteredAudience.length})`}
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-3">
          <div className="grid grid-cols-4 gap-2">
            {REACTIONS.map(emoji => (
              <button
                key={emoji}
                className="flex h-12 items-center justify-center rounded-lg bg-room-card text-2xl transition-transform hover:scale-110 hover:bg-room-hover"
                aria-label={`Send ${emoji} reaction`}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}
    </aside>
  );
}
