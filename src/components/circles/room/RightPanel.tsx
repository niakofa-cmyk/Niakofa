import { useState } from 'react';
import {
  Signal,
  MoreHorizontal,
  Hand,
  X,
  VolumeX,
  ChevronDown,
  Share2,
  UserPlus,
  Settings,
  Radio,
  PhoneOff,
  UserCog,
  UserMinus,
  Shield,
  Flag,
  MicOff,
  ArrowDownToLine,
  Send,
  type LucideIcon,
} from 'lucide-react';
import type { Participant, RaisedHandEntry, ChatMessage, RightPanelTab, ConnectionQuality } from '@/types/circles';

interface RightPanelProps {
  raisedHands: RaisedHandEntry[];
  participants: Participant[];
  currentUserId: string;
  rightTab: RightPanelTab;
  connectionQuality: ConnectionQuality;
  isRecording: boolean;
  speakerLimit: number;
  chatMessages: ChatMessage[];
  chatInput: string;
  onSetRightTab: (tab: RightPanelTab) => void;
  onBringUp: (id: string) => void;
  onDismiss: (id: string) => void;
  onMuteAll: () => void;
  onLowerAll: () => void;
  onMakeCoHost: (id: string) => void;
  onRemove: (id: string) => void;
  onMute: (id: string) => void;
  onMoveToAudience: (id: string) => void;
  onToggleRecording: () => void;
  onEndCircle: () => void;
  onSetChatInput: (value: string) => void;
  onSendChat: () => void;
}

const CONNECTION_LABELS: Record<ConnectionQuality, { label: string; color: string }> = {
  excellent: { label: 'Excellent Connection', color: 'text-brand-green' },
  good: { label: 'Good Connection', color: 'text-emerald-400' },
  weak: { label: 'Weak Connection', color: 'text-amber-400' },
  reconnecting: { label: 'Reconnecting...', color: 'text-amber-400' },
  disconnected: { label: 'Disconnected', color: 'text-brand-red' },
};

export function RightPanel(props: RightPanelProps) {
  const {
    raisedHands,
    participants,
    currentUserId,
    rightTab,
    connectionQuality,
    isRecording,
    speakerLimit,
    chatMessages,
    chatInput,
    onSetRightTab,
    onBringUp,
    onDismiss,
    onMuteAll,
    onLowerAll,
    onMakeCoHost,
    onRemove,
    onMute,
    onMoveToAudience,
    onToggleRecording,
    onEndCircle,
    onSetChatInput,
    onSendChat,
  } = props;

  const [selectedParticipant, setSelectedParticipant] = useState<Participant | null>(null);
  const conn = CONNECTION_LABELS[connectionQuality];

  const stageParticipants = participants.filter(
    p => p.role === 'host' || p.role === 'co-host' || p.role === 'speaker'
  );

  return (
    <aside className="flex h-full w-full flex-col bg-room-panel">
      <div className="flex items-center justify-between border-b border-room-border px-3 py-2.5">
        <div className={`flex items-center gap-1.5 text-xs font-medium ${conn.color}`}>
          <Signal size={14} />
          {conn.label}
        </div>
        <div className="flex items-center gap-2">
          <button className="rounded-full p-1 text-gray-400 hover:bg-room-hover hover:text-white">
            <MoreHorizontal size={16} />
          </button>
          <div className="flex items-center">
            <button
              onClick={() => onSetRightTab('room')}
              className={`px-3 py-1 text-xs font-semibold transition-colors ${
                rightTab === 'room'
                  ? 'border-b-2 border-brand-purple text-white'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              Room
            </button>
            <button
              onClick={() => onSetRightTab('chat')}
              className={`px-3 py-1 text-xs font-semibold transition-colors ${
                rightTab === 'chat'
                  ? 'border-b-2 border-brand-purple text-white'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              Chat
            </button>
          </div>
        </div>
      </div>

      {rightTab === 'room' ? (
        <div className="flex-1 overflow-y-auto p-3">
          <div className="mb-4">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
                Raised Hands ({raisedHands.length})
              </h3>
              {raisedHands.length > 0 && (
                <button className="text-[11px] font-medium text-brand-purple-light hover:text-brand-purple">
                  View All
                </button>
              )}
            </div>
            {raisedHands.length === 0 ? (
              <p className="rounded-lg bg-room-card px-3 py-4 text-center text-xs text-gray-500">
                No raised hands right now.
              </p>
            ) : (
              <div className="space-y-2">
                {raisedHands.map(rh => (
                  <div
                    key={rh.participantId}
                    className="flex items-center gap-2.5 rounded-lg bg-room-card p-2"
                  >
                    <img
                      src={rh.participant.avatar}
                      alt={rh.participant.name}
                      className="h-8 w-8 rounded-full object-cover ring-1 ring-room-border"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-medium text-white">
                        {rh.participant.name}
                      </div>
                      <div className="flex items-center gap-1 text-[10px] text-gray-500">
                        <Hand size={10} className="text-amber-400" />
                        Wants to speak
                      </div>
                    </div>
                    <button
                      onClick={() => onBringUp(rh.participantId)}
                      className="rounded-md bg-brand-purple px-2.5 py-1 text-[11px] font-semibold text-white transition-colors hover:bg-brand-purple-hover"
                    >
                      Bring Up
                    </button>
                    <button
                      onClick={() => onDismiss(rh.participantId)}
                      className="flex h-6 w-6 items-center justify-center rounded-md bg-room-hover text-gray-400 transition-colors hover:text-white"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mb-4">
            <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-gray-500">
              Room Controls
            </h3>
            <div className="grid grid-cols-3 gap-2">
              <RoomControlButton icon={VolumeX} label="Mute All" onClick={onMuteAll} />
              <RoomControlButton icon={ChevronDown} label="Lower All" onClick={onLowerAll} />
              <RoomControlButton icon={MicOff} label={`Limit ${speakerLimit}`} />
              <RoomControlButton icon={Share2} label="Share" />
              <RoomControlButton icon={UserPlus} label="Invite" />
              <RoomControlButton icon={Settings} label="Settings" />
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button
                onClick={onToggleRecording}
                className={`flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold transition-colors ${
                  isRecording
                    ? 'bg-brand-red/20 text-brand-red hover:bg-brand-red/30'
                    : 'bg-brand-red text-white hover:bg-brand-red-hover'
                }`}
              >
                <Radio size={13} />
                {isRecording ? 'Stop Rec' : 'Start Rec'}
              </button>
              <button
                onClick={onEndCircle}
                className="flex items-center justify-center gap-1.5 rounded-lg bg-brand-red py-2 text-xs font-semibold text-white transition-colors hover:bg-brand-red-hover"
              >
                <PhoneOff size={13} />
                End Circle
              </button>
            </div>
          </div>

          <div>
            <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-gray-500">
              Host Controls
            </h3>
            {selectedParticipant ? (
              <div className="rounded-lg bg-room-card p-3">
                <div className="mb-3 flex items-center gap-2.5">
                  <img
                    src={selectedParticipant.avatar}
                    alt={selectedParticipant.name}
                    className="h-10 w-10 rounded-full object-cover ring-1 ring-room-border"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-white">
                      {selectedParticipant.name}
                    </div>
                    <div className="text-[11px] capitalize text-gray-500">
                      {selectedParticipant.role}
                    </div>
                  </div>
                  <button
                    onClick={() => setSelectedParticipant(null)}
                    className="rounded-full p-1 text-gray-400 hover:bg-room-hover hover:text-white"
                  >
                    <X size={14} />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <HostControlButton
                    icon={UserCog}
                    label="Make Co-Host"
                    onClick={() => {
                      onMakeCoHost(selectedParticipant.id);
                      setSelectedParticipant(null);
                    }}
                  />
                  <HostControlButton
                    icon={ArrowDownToLine}
                    label="To Audience"
                    onClick={() => {
                      onMoveToAudience(selectedParticipant.id);
                      setSelectedParticipant(null);
                    }}
                  />
                  <HostControlButton
                    icon={MicOff}
                    label="Mute"
                    onClick={() => {
                      onMute(selectedParticipant.id);
                      setSelectedParticipant(null);
                    }}
                  />
                  <HostControlButton
                    icon={UserMinus}
                    label="Remove"
                    onClick={() => {
                      onRemove(selectedParticipant.id);
                      setSelectedParticipant(null);
                    }}
                  />
                  <HostControlButton icon={Shield} label="Block" onClick={() => setSelectedParticipant(null)} />
                  <HostControlButton icon={Flag} label="Report" onClick={() => setSelectedParticipant(null)} />
                </div>
              </div>
            ) : (
              <>
                <p className="mb-2 text-[11px] text-gray-500">
                  Select a participant to moderate:
                </p>
                <div className="space-y-1">
                  {stageParticipants
                    .filter(p => p.id !== currentUserId)
                    .map(p => (
                      <button
                        key={p.id}
                        onClick={() => setSelectedParticipant(p)}
                        className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-room-hover"
                      >
                        <img
                          src={p.avatar}
                          alt={p.name}
                          className="h-7 w-7 rounded-full object-cover ring-1 ring-room-border"
                        />
                        <span className="flex-1 truncate text-xs font-medium text-gray-300">
                          {p.name}
                        </span>
                        <span className="text-[10px] capitalize text-gray-500">{p.role}</span>
                      </button>
                    ))}
                </div>
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="flex h-full flex-col">
          <div className="flex-1 space-y-3 overflow-y-auto p-3">
            {chatMessages.map(msg => (
              <div key={msg.id} className="flex gap-2.5">
                <img
                  src={msg.participant.avatar}
                  alt={msg.participant.name}
                  className="h-7 w-7 flex-shrink-0 rounded-full object-cover ring-1 ring-room-border"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="text-xs font-semibold text-white">
                      {msg.participant.name}
                    </span>
                    <span className="text-[10px] text-gray-500">
                      {msg.timestamp.toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                  <p className="text-xs text-gray-300">{msg.text}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="border-t border-room-border p-3">
            <div className="flex items-center gap-2 rounded-lg bg-room-card px-3 py-2">
              <input
                value={chatInput}
                onChange={e => onSetChatInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') onSendChat();
                }}
                placeholder="Send a message..."
                className="flex-1 bg-transparent text-xs text-white placeholder-gray-500 outline-none"
              />
              <button
                onClick={onSendChat}
                className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-purple text-white transition-colors hover:bg-brand-purple-hover"
              >
                <Send size={13} />
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}

function RoomControlButton({
  icon: Icon,
  label,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-1 rounded-lg bg-room-card py-2.5 transition-colors hover:bg-room-hover"
    >
      <Icon size={16} className="text-gray-300" />
      <span className="text-[10px] font-medium text-gray-400">{label}</span>
    </button>
  );
}

function HostControlButton({
  icon: Icon,
  label,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-1 rounded-lg bg-room-hover py-2.5 transition-colors hover:bg-room-border"
    >
      <Icon size={15} className="text-gray-300" />
      <span className="text-[10px] font-medium text-gray-400">{label}</span>
    </button>
  );
}
