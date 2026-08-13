import { useState, useCallback, useRef, useEffect } from 'react';
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
import type { Participant, Role } from '@/types/circles';
import { VideoTile } from './VideoTile';

interface CenterStageProps {
  host?: Participant;
  coHost?: Participant;
  speakers: Participant[];
  audienceParticipants: Participant[];
  currentUserId: string;
  currentUserRole: Role;
  isMicOn: boolean;
  isCameraOn: boolean;
  raisedHandsCount: number;
  onToggleMic: () => void;
  onToggleCamera: () => void;
  onLeave: () => void;
  onShowRaisedHands: () => void;
  onRaiseHand: () => void;
}

const REACTIONS = ['👏', '❤️', '😂', '😮', '👍', '🔥', '💯'];

interface FloatingReaction {
  id: string;
  emoji: string;
  x: number;
}

export function CenterStage({
  host,
  coHost,
  speakers,
  audienceParticipants,
  currentUserId,
  currentUserRole,
  isMicOn,
  isCameraOn,
  _raisedHandsCount,
  onToggleMic,
  onToggleCamera,
  onLeave,
  _onShowRaisedHands,
  onRaiseHand,
}: CenterStageProps) {
  const [floatingReactions, setFloatingReactions] = useState<FloatingReaction[]>([]);
  const reactionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const addReaction = useCallback((emoji: string) => {
    const id = Date.now().toString() + Math.random().toString(36).slice(2, 6);
    const x = Math.random() * 70 + 15;
    setFloatingReactions(prev => [...prev, { id, emoji, x }]);
    if (reactionTimerRef.current) clearTimeout(reactionTimerRef.current);
    reactionTimerRef.current = setTimeout(() => {
      setFloatingReactions(prev => prev.filter(r => r.id !== id));
    }, 1800);
  }, []);

  useEffect(() => {
    return () => {
      if (reactionTimerRef.current) clearTimeout(reactionTimerRef.current);
    };
  }, []);

  const visibleAudience = audienceParticipants.slice(0, 6);
  const remainingCount = Math.max(0, audienceParticipants.length - 6);

  const isAudience = currentUserRole === 'audience';
  const _isOnStage = currentUserRole === 'host' || currentUserRole === 'co-host' || currentUserRole === 'speaker';

  return (
    <div className="relative flex h-full flex-col bg-room-bg">
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
                <button
                  className="text-[11px] font-medium text-brand-purple-light hover:text-brand-purple"
                  aria-label="View all speakers"
                >
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
            <div className="flex flex-wrap gap-3">
              {visibleAudience.map(p => (
                <div key={p.id} className="flex w-14 flex-col items-center gap-1">
                  <div className="relative">
                    <img
                      src={p.avatar}
                      alt={p.name}
                      className="h-12 w-12 rounded-full object-cover ring-1 ring-room-border"
                    />
                    {p.hasRaisedHand && (
                      <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 ring-2 ring-room-bg">
                        <Hand size={9} className="text-white" />
                      </span>
                    )}
                  </div>
                  <span className="truncate text-[10px] text-gray-400">{p.shortName}</span>
                </div>
              ))}
              {remainingCount > 0 && (
                <button
                  className="flex w-14 flex-col items-center gap-1"
                  aria-label={`Show ${remainingCount} more audience members`}
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-room-card ring-1 ring-room-border transition-colors hover:bg-room-hover">
                    <Plus size={16} className="text-gray-400" />
                  </div>
                  <span className="text-[10px] text-gray-500">+{remainingCount}</span>
                </button>
              )}
            </div>
          </div>

          {isAudience && (
            <div className="rounded-xl border border-brand-purple/30 bg-brand-purple/10 p-3">
              <div className="flex items-center gap-2 text-xs text-gray-300">
                <Hand size={14} className="text-amber-400" />
                <span>Want to speak? Raise your hand and the host can bring you on stage.</span>
                <button
                  onClick={onRaiseHand}
                  className="ml-auto rounded-full bg-brand-purple px-3 py-1 text-xs font-semibold text-white transition-colors hover:bg-brand-purple-hover"
                  aria-label="Raise your hand to speak"
                >
                  Raise Hand
                </button>
              </div>
            </div>
          )}

          <div className="pt-1">
            <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-gray-500">
              Reactions
            </div>
            <div className="flex flex-wrap gap-2">
              {REACTIONS.map(emoji => (
                <button
                  key={emoji}
                  onClick={() => addReaction(emoji)}
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-room-card text-lg transition-transform hover:scale-110 hover:bg-room-hover"
                  aria-label={`Send ${emoji} reaction`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {floatingReactions.map(r => (
          <div
            key={r.id}
            className="animate-reaction-float pointer-events-none absolute bottom-32 text-3xl"
            style={{ left: `${r.x}%` }}
          >
            {r.emoji}
          </div>
        ))}
      </div>

      <div className="border-t border-room-border bg-room-panel px-4 py-3">
        <div className="mx-auto flex max-w-3xl items-center justify-center gap-2">
          {isAudience ? (
            <>
              <ControlButton
                icon={<Hand size={18} />}
                label="Raise Hand"
                onClick={onRaiseHand}
                variant="primary"
              />
              <ControlButton
                icon={<LogOut size={18} />}
                label="Leave"
                onClick={onLeave}
                variant="danger"
              />
            </>
          ) : (
            <>
              <ControlButton
                icon={isMicOn ? <Mic size={18} /> : <MicOff size={18} />}
                label={isMicOn ? 'Mute' : 'Unmute'}
                onClick={onToggleMic}
                active={isMicOn}
              />
              <ControlButton
                icon={isCameraOn ? <Video size={18} /> : <VideoOff size={18} />}
                label={isCameraOn ? 'Cam Off' : 'Cam On'}
                onClick={onToggleCamera}
                active={isCameraOn}
              />
              {currentUserRole === 'speaker' && (
                <ControlButton
                  icon={<ChevronDown size={18} />}
                  label="Leave Stage"
                  onClick={onLeave}
                />
              )}
              <ControlButton
                icon={<PhoneOff size={18} />}
                label="Leave"
                onClick={onLeave}
                variant="danger"
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ControlButton({
  icon,
  label,
  onClick,
  variant = 'default',
  active,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  variant?: 'default' | 'primary' | 'danger';
  active?: boolean;
}) {
  const base = 'flex flex-col items-center gap-1 rounded-xl px-4 py-2 transition-colors text-xs font-medium';
  const styles = {
    default: active
      ? 'bg-brand-green/20 text-brand-green hover:bg-brand-green/30'
      : 'bg-room-card text-gray-300 hover:bg-room-hover',
    primary: 'bg-brand-purple text-white hover:bg-brand-purple-hover',
    danger: 'bg-brand-red/20 text-brand-red hover:bg-brand-red/30',
  };

  return (
    <button onClick={onClick} className={`${base} ${styles[variant]}`} aria-label={label}>
      {icon}
      <span>{label}</span>
    </button>
  );
}
