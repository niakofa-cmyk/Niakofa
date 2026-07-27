import {
  Hand,
  Mic,
  MicOff,
  Video,
  VideoOff,
  LogOut,
  PhoneOff,
  ChevronDown,
  Users,
  Plus,
} from 'lucide-react';
import type { Participant } from '@/types/circles';
import { VideoTile } from './VideoTile';

interface CenterStageProps {
  host?: Participant;
  coHost?: Participant;
  speakers: Participant[];
  audienceParticipants: Participant[];
  currentUserId: string;
  isMicOn: boolean;
  isCameraOn: boolean;
  raisedHandsCount: number;
  onToggleMic: () => void;
  onToggleCamera: () => void;
  onLeave: () => void;
  onShowRaisedHands: () => void;
}

const REACTIONS = ['👋', '❤️', '😂', '😮', '🤔', '🔥', '💯'];

export function CenterStage({
  host,
  coHost,
  speakers,
  audienceParticipants,
  currentUserId,
  isMicOn,
  isCameraOn,
  raisedHandsCount,
  onToggleMic,
  onToggleCamera,
  onLeave,
  onShowRaisedHands,
}: CenterStageProps) {
  const visibleAudience = audienceParticipants.slice(0, 7);
  const remainingCount = Math.max(0, audienceParticipants.length - 7);

  return (
    <div className="flex h-full flex-col bg-room-bg">
      <div className="flex-1 overflow-y-auto p-4 lg:p-6">
        <div className="mx-auto max-w-3xl space-y-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {host && (
              <div>
                <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-gray-500">
                  Host
                </div>
                <VideoTile
                  participant={host}
                  size="large"
                  isCurrentUser={host.id === currentUserId}
                />
              </div>
            )}
            {coHost && (
              <div>
                <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-gray-500">
                  Co-Host
                </div>
                <VideoTile
                  participant={coHost}
                  size="large"
                  isCurrentUser={coHost.id === currentUserId}
                />
              </div>
            )}
          </div>

          {speakers.length > 0 && (
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
                  Speakers ({speakers.length})
                </span>
                <button className="text-[11px] font-medium text-brand-purple-light hover:text-brand-purple">
                  View All
                </button>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {speakers.map(p => (
                  <VideoTile
                    key={p.id}
                    participant={p}
                    size="small"
                    isCurrentUser={p.id === currentUserId}
                  />
                ))}
              </div>
            </div>
          )}

          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-gray-500">
                <Users size={12} />
                Audience ({audienceParticipants.length})
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {visibleAudience.map(p => (
                <div key={p.id} className="relative">
                  <img
                    src={p.avatar}
                    alt={p.name}
                    className="h-10 w-10 rounded-full object-cover ring-1 ring-room-border"
                  />
                  {p.hasRaisedHand && (
                    <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 ring-2 ring-room-bg">
                      <Hand size={9} className="text-white" />
                    </span>
                  )}
                </div>
              ))}
              {remainingCount > 0 && (
                <button className="flex h-10 items-center gap-1 rounded-full bg-room-card px-3 text-xs font-medium text-gray-400 ring-1 ring-room-border transition-colors hover:bg-room-hover hover:text-white">
                  <Plus size={12} />
                  {remainingCount} More
                </button>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-room-border bg-room-panel/50 p-3">
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <Hand size={14} className="text-amber-400" />
              <span>Want to speak?</span>
              <button
                onClick={onShowRaisedHands}
                className="ml-auto rounded-full bg-brand-purple px-3 py-1 text-xs font-semibold text-white transition-colors hover:bg-brand-purple-hover"
              >
                Raise Hand
              </button>
            </div>
          </div>

          <div className="pt-1">
            <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-gray-500">
              Reactions
            </div>
            <div className="flex flex-wrap gap-2">
              {REACTIONS.map(emoji => (
                <button
                  key={emoji}
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-room-card text-xl transition-transform hover:scale-110 hover:bg-room-hover"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="border-t border-room-border bg-room-panel px-4 py-3">
        <div className="mx-auto flex max-w-2xl items-end justify-center gap-3 sm:gap-5">
          <button
            onClick={onShowRaisedHands}
            className="relative flex flex-col items-center gap-1"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-purple transition-colors hover:bg-brand-purple-hover">
              <Hand size={20} className="text-white" />
            </div>
            {raisedHandsCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-red px-1 text-[10px] font-bold text-white ring-2 ring-room-panel">
                {raisedHandsCount}
              </span>
            )}
            <span className="text-[10px] font-medium text-gray-400">Raise Hand</span>
          </button>

          <button onClick={onToggleMic} className="flex flex-col items-center gap-1">
            <div
              className={`flex h-12 w-12 items-center justify-center rounded-full transition-colors ${
                isMicOn
                  ? 'bg-brand-green hover:bg-brand-green-dim'
                  : 'bg-red-500/20 hover:bg-red-500/30'
              }`}
            >
              {isMicOn ? (
                <Mic size={20} className="text-white" />
              ) : (
                <MicOff size={20} className="text-red-400" />
              )}
            </div>
            <span className="flex items-center gap-0.5 text-[10px] font-medium text-gray-400">
              Mic
              <ChevronDown size={10} />
            </span>
          </button>

          <button onClick={onToggleCamera} className="flex flex-col items-center gap-1">
            <div
              className={`flex h-12 w-12 items-center justify-center rounded-full transition-colors ${
                isCameraOn
                  ? 'bg-brand-green hover:bg-brand-green-dim'
                  : 'bg-red-500/20 hover:bg-red-500/30'
              }`}
            >
              {isCameraOn ? (
                <Video size={20} className="text-white" />
              ) : (
                <VideoOff size={20} className="text-red-400" />
              )}
            </div>
            <span className="flex items-center gap-0.5 text-[10px] font-medium text-gray-400">
              Camera
              <ChevronDown size={10} />
            </span>
          </button>

          <button className="flex flex-col items-center gap-1">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-room-card transition-colors hover:bg-room-hover">
              <LogOut size={18} className="text-gray-300" />
            </div>
            <span className="text-[10px] font-medium text-gray-400">Leave Stage</span>
          </button>

          <button
            onClick={onLeave}
            className="flex flex-col items-center gap-1"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-red transition-colors hover:bg-brand-red-hover">
              <PhoneOff size={20} className="text-white" />
            </div>
            <span className="text-[10px] font-medium text-gray-400">Leave Room</span>
          </button>
        </div>
      </div>
    </div>
  );
}
