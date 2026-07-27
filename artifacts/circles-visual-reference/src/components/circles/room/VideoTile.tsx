import { Mic, MicOff, VideoOff } from 'lucide-react';
import type { Participant, Role } from '@/types/circles';

interface VideoTileProps {
  participant: Participant;
  size?: 'large' | 'medium' | 'small';
  label?: string;
  isCurrentUser?: boolean;
}

const ROLE_LABEL: Record<Role, string> = {
  host: 'HOST',
  'co-host': 'CO-HOST',
  speaker: 'SPEAKER',
  audience: 'AUDIENCE',
};

const ROLE_BADGE_COLOR: Record<Role, string> = {
  host: 'bg-brand-purple text-white',
  'co-host': 'bg-blue-500 text-white',
  speaker: 'bg-emerald-600 text-white',
  audience: 'bg-gray-600 text-white',
};

export function VideoTile({
  participant,
  size = 'medium',
  label,
  isCurrentUser = false,
}: VideoTileProps) {
  const sizeClasses = {
    large: 'aspect-[4/3]',
    medium: 'aspect-[4/3]',
    small: 'aspect-[4/3]',
  };

  return (
    <div
      className={`relative ${sizeClasses[size]} w-full overflow-hidden rounded-2xl bg-room-card ring-1 ring-room-border`}
    >
      {participant.isCameraOn ? (
        <img
          src={participant.avatar}
          alt={participant.name}
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-room-card">
          <img
            src={participant.avatar}
            alt={participant.name}
            className="h-16 w-16 rounded-full object-cover opacity-60"
          />
        </div>
      )}

      {!participant.isCameraOn && (
        <div className="absolute right-2 top-2 rounded-md bg-black/60 p-1">
          <VideoOff size={12} className="text-gray-300" />
        </div>
      )}

      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent px-3 pb-2.5 pt-8">
        <div className="flex items-end justify-between gap-2">
          <div className="min-w-0">
            {label && (
              <div className="mb-0.5 text-[10px] font-bold uppercase tracking-wider text-white/70">
                {label}
              </div>
            )}
            <div className="flex items-center gap-1.5">
              <span
                className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${ROLE_BADGE_COLOR[participant.role]}`}
              >
                {ROLE_LABEL[participant.role]}
              </span>
              <span className="truncate text-sm font-semibold text-white">
                {participant.name}
                {isCurrentUser && <span className="ml-1 text-white/60">(You)</span>}
              </span>
            </div>
          </div>
          <div
            className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full ${
              participant.isMicOn ? 'bg-brand-green/20' : 'bg-red-500/20'
            }`}
          >
            {participant.isMicOn ? (
              <Mic size={13} className="text-brand-green" />
            ) : (
              <MicOff size={13} className="text-red-400" />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
