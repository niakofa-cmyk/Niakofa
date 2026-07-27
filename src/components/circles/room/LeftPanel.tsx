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
            <span className="flex items-center gap-1.5 font-semibold text-brand-red">
              <Radio size={12} />
              {recordingTime}
            </span>
          )}
        </div>

        <div className="mt-2.5 space-y-1.5 text-xs text-gray-400">
          <div className="font-medium text-gray-300">{circle.topic}</div>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <Users size={12} />
              {circle.participantCount} in room
            </span>
            <span className="flex items-center gap-1">
              <Mic size={12} />
              {stageParticipants.length} on stage
            </span>
          </div>
        </div>
      </div>

      <div className="flex border-b border-room-border">
        <button
          onClick={() => onSetLeftTab('people')}
          className={`flex-1 py-2.5 text-xs font-semibold transition-colors ${
            leftTab === 'people'
              ? 'border-b-2 border-brand-purple text-white'
              : 'text-gray-500 hover:text-gray-300'
          }`}
        >
          People
        </button>
        <button
          onClick={() => onSetLeftTab('reactions')}
          className={`flex-1 py-2.5 text-xs font-semibold transition-colors ${
            leftTab === 'reactions'
              ? 'border-b-2 border-brand-purple text-white'
              : 'text-gray-500 hover:text-gray-300'
          }`}
        >
          Reactions
        </button>
      </div>

      {leftTab === 'people' ? (
        <div className="flex-1 overflow-y-auto">
          <div className="p-3">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
                On Stage ({stageParticipants.length})
              </h3>
            </div>
            <div className="space-y-1">
              {stageParticipants.map(p => (
                <div
                  key={p.id}
                  className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-room-hover"
                >
                  <img
                    src={p.avatar}
                    alt={p.name}
                    className="h-8 w-8 rounded-full object-cover ring-1 ring-room-border"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-medium text-white">
                      {p.name}
                      {p.id === currentUserId && (
                        <span className="ml-1 text-gray-500">(You)</span>
                      )}
                    </div>
                    <div className="text-[10px] capitalize text-gray-500">{p.role}</div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {p.isMicOn ? (
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-green/15">
                        <Mic size={11} className="text-brand-green" />
                      </div>
                    ) : (
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-red-500/15">
                        <MicOff size={11} className="text-red-400" />
                      </div>
                    )}
                    {p.isCameraOn ? (
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-purple/15">
                        <Video size={11} className="text-brand-purple-light" />
                      </div>
                    ) : (
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-700/30">
                        <VideoOff size={11} className="text-gray-500" />
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="border-t border-room-border p-3">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
                Audience ({audienceParticipants.length})
              </h3>
            </div>
            <div className="relative mb-2">
              <Search
                size={12}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500"
              />
              <input
                value={audienceSearch}
                onChange={e => setAudienceSearch(e.target.value)}
                placeholder="Search audience"
                className="w-full rounded-lg border border-room-border bg-room-card py-1.5 pl-7 pr-2 text-xs text-white placeholder-gray-500 outline-none focus:border-brand-purple"
              />
            </div>
            <div className="space-y-1">
              {visibleAudience.map(p => (
                <div
                  key={p.id}
                  className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-room-hover"
                >
                  <img
                    src={p.avatar}
                    alt={p.name}
                    className="h-7 w-7 rounded-full object-cover ring-1 ring-room-border"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-medium text-gray-300">
                      {p.name}
                      {p.id === currentUserId && (
                        <span className="ml-1 text-gray-500">(You)</span>
                      )}
                    </div>
                  </div>
                  {p.hasRaisedHand ? (
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-500/15">
                      <Hand size={11} className="text-amber-400" />
                    </div>
                  ) : (
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-700/30">
                      <MicOff size={11} className="text-gray-600" />
                    </div>
                  )}
                </div>
              ))}
            </div>
            {filteredAudience.length > 8 && !showAllAudience && (
              <button
                onClick={() => setShowAllAudience(true)}
                className="mt-2 w-full rounded-lg py-1.5 text-xs font-medium text-brand-purple-light transition-colors hover:bg-room-hover"
              >
                See all ({filteredAudience.length})
              </button>
            )}
            {showAllAudience && (
              <button
                onClick={() => setShowAllAudience(false)}
                className="mt-2 w-full rounded-lg py-1.5 text-xs font-medium text-gray-400 transition-colors hover:bg-room-hover"
              >
                Show less
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-4">
          <h3 className="mb-3 text-[11px] font-bold uppercase tracking-wider text-gray-500">
            Live Reactions
          </h3>
          <div className="grid grid-cols-4 gap-3">
            {REACTIONS.map(emoji => (
              <button
                key={emoji}
                className="flex aspect-square items-center justify-center rounded-full bg-room-card text-2xl transition-transform hover:scale-110 hover:bg-room-hover"
              >
                {emoji}
              </button>
            ))}
          </div>
          <p className="mt-4 text-xs text-gray-500">
            Tap a reaction to share it with the room. Reactions appear for everyone in real time.
          </p>
        </div>
      )}
    </aside>
  );
}
