import { useState, useRef, useEffect } from 'react';
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
  Copy,
  Check,
  AlertTriangle,
  type LucideIcon,
} from 'lucide-react';
import type {
  Participant,
  RaisedHandEntry,
  ChatMessage,
  RightPanelTab,
  ConnectionQuality,
  Role,
} from '@/types/circles';

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

function timeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ago`;
}

function RoleBadge({ role }: { role: Role }) {
  if (role === 'host') return <span className="rounded bg-brand-purple px-1 py-0.5 text-[9px] font-bold text-white">HOST</span>;
  if (role === 'co-host') return <span className="rounded bg-blue-500 px-1 py-0.5 text-[9px] font-bold text-white">CO-HOST</span>;
  return null;
}

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
  const [showInvite, setShowInvite] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [copied, setCopied] = useState(false);
  const [localSpeakerLimit, setLocalSpeakerLimit] = useState(speakerLimit);
  const [chatEnabled, setChatEnabled] = useState(true);
  const [recordingAllowed, setRecordingAllowed] = useState(true);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const conn = CONNECTION_LABELS[connectionQuality];

  const stageParticipants = participants.filter(
    p => p.role === 'host' || p.role === 'co-host' || p.role === 'speaker'
  );

  const sortedRaisedHands = [...raisedHands].sort((a, b) => a.timestamp - b.timestamp);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages.length]);

  const handleCopyLink = () => {
    navigator.clipboard?.writeText('https://niakofa.com/circle/southside-community').catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleEndCircle = () => {
    setShowEndConfirm(false);
    onEndCircle();
  };

  return (
    <aside className="flex h-full w-full flex-col bg-room-panel">
      <div className="flex items-center justify-between border-b border-room-border px-3 py-2.5">
        <div className={`flex items-center gap-1.5 text-xs font-medium ${conn.color}`} role="status" aria-live="polite">
          <Signal size={14} />
          {conn.label}
        </div>
        <div className="flex items-center gap-2">
          <button className="rounded-full p-1 text-gray-400 hover:bg-room-hover hover:text-white" aria-label="More options">
            <MoreHorizontal size={16} />
          </button>
          <div className="flex items-center" role="tablist">
            <button
              onClick={() => onSetRightTab('room')}
              role="tab"
              aria-selected={rightTab === 'room'}
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
              role="tab"
              aria-selected={rightTab === 'chat'}
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
          <div className="mb-4" role="region" aria-label="Raised hands queue">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
                Raised Hands ({sortedRaisedHands.length})
              </h3>
              {sortedRaisedHands.length > 0 && (
                <button className="text-[11px] font-medium text-brand-purple-light hover:text-brand-purple">
                  View All
                </button>
              )}
            </div>
            {sortedRaisedHands.length === 0 ? (
              <p className="rounded-lg bg-room-card px-3 py-4 text-center text-xs text-gray-500">
                No raised hands right now.
              </p>
            ) : (
              <div className="space-y-2">
                {sortedRaisedHands.map((rh, idx) => (
                  <div key={rh.participantId} className="flex items-center gap-2.5 rounded-lg bg-room-card p-2">
                    <div className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-[10px] font-bold text-amber-400">
                      {idx + 1}
                    </div>
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
                        <span className="text-gray-600">·</span>
                        {timeAgo(rh.timestamp)}
                      </div>
                    </div>
                    <button
                      onClick={() => onBringUp(rh.participantId)}
                      className="rounded-md bg-brand-purple px-2.5 py-1 text-[11px] font-semibold text-white transition-colors hover:bg-brand-purple-hover"
                      aria-label={`Bring up ${rh.participant.name} to speak`}
                    >
                      Bring Up
                    </button>
                    <button
                      onClick={() => onDismiss(rh.participantId)}
                      className="flex h-6 w-6 items-center justify-center rounded-md bg-room-hover text-gray-400 transition-colors hover:text-white"
                      aria-label={`Dismiss ${rh.participant.name}'s raised hand`}
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
              <RoomControlButton icon={UserPlus} label="Invite" onClick={() => setShowInvite(s => !s)} />
              <RoomControlButton icon={Settings} label="Settings" onClick={() => setShowSettings(s => !s)} />
            </div>

            {showInvite && (
              <div className="mt-2 animate-fade-in rounded-lg bg-room-card p-3">
                <div className="mb-2 flex items-center justify-between">
                  <h4 className="text-xs font-semibold text-white">Invite to Circle</h4>
                  <button
                    onClick={() => setShowInvite(false)}
                    className="rounded-full p-1 text-gray-400 hover:bg-room-hover hover:text-white"
                    aria-label="Close invite panel"
                  >
                    <X size={14} />
                  </button>
                </div>
                <div className="flex items-center gap-2 rounded-lg bg-room-hover px-3 py-2">
                  <span className="flex-1 truncate text-xs text-gray-300">
                    niakofa.com/circle/southside-community
                  </span>
                  <button
                    onClick={handleCopyLink}
                    className="flex items-center gap-1 text-xs font-medium text-brand-purple-light hover:text-brand-purple"
                  >
                    {copied ? <Check size={12} className="text-brand-green" /> : <Copy size={12} />}
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <button className="rounded-lg bg-room-hover py-2 text-xs font-medium text-gray-300 transition-colors hover:bg-room-border">
                    Share via Messages
                  </button>
                  <button className="rounded-lg bg-room-hover py-2 text-xs font-medium text-gray-300 transition-colors hover:bg-room-border">
                    Share to Profile
                  </button>
                </div>
              </div>
            )}

            {showSettings && (
              <div className="mt-2 animate-fade-in rounded-lg bg-room-card p-3">
                <div className="mb-3 flex items-center justify-between">
                  <h4 className="text-xs font-semibold text-white">Circle Settings</h4>
                  <button
                    onClick={() => setShowSettings(false)}
                    className="rounded-full p-1 text-gray-400 hover:bg-room-hover hover:text-white"
                    aria-label="Close settings panel"
                  >
                    <X size={14} />
                  </button>
                </div>
                <div className="space-y-3">
                  <div>
                    <label className="mb-1 block text-[11px] font-medium text-gray-400">Speaker Limit</label>
                    <input
                      type="number"
                      value={localSpeakerLimit}
                      onChange={e => setLocalSpeakerLimit(Number(e.target.value) || 0)}
                      min={1}
                      max={50}
                      className="w-full rounded-lg border border-room-border bg-room-hover px-3 py-1.5 text-xs text-white outline-none focus:border-brand-purple"
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-medium text-gray-400">Allow Chat</span>
                    <button
                      onClick={() => setChatEnabled(v => !v)}
                      className={`relative h-5 w-9 rounded-full transition-colors ${chatEnabled ? 'bg-brand-purple' : 'bg-room-border'}`}
                      role="switch"
                      aria-checked={chatEnabled}
                      aria-label="Toggle chat"
                    >
                      <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${chatEnabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
                    </button>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-medium text-gray-400">Allow Recording</span>
                    <button
                      onClick={() => setRecordingAllowed(v => !v)}
                      className={`relative h-5 w-9 rounded-full transition-colors ${recordingAllowed ? 'bg-brand-purple' : 'bg-room-border'}`}
                      role="switch"
                      aria-checked={recordingAllowed}
                      aria-label="Toggle recording permission"
                    >
                      <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${recordingAllowed ? 'translate-x-4' : 'translate-x-0.5'}`} />
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="mt-2 grid grid-cols-2 gap-2">
              <button
                onClick={onToggleRecording}
                className={`flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold transition-colors ${
                  isRecording
                    ? 'bg-brand-red/20 text-brand-red hover:bg-brand-red/30'
                    : 'bg-brand-red text-white hover:bg-brand-red-hover'
                }`}
                aria-label={isRecording ? 'Stop recording' : 'Start recording'}
              >
                <Radio size={13} />
                {isRecording ? 'Stop Rec' : 'Start Rec'}
              </button>
              <button
                onClick={() => setShowEndConfirm(true)}
                className="flex items-center justify-center gap-1.5 rounded-lg bg-brand-red py-2 text-xs font-semibold text-white transition-colors hover:bg-brand-red-hover"
                aria-label="End circle"
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
              <div className="animate-fade-in rounded-lg bg-room-card p-3">
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
                    aria-label="Close moderation panel"
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
                        aria-label={`Select ${p.name} for moderation`}
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
          <div className="flex-1 space-y-3 overflow-y-auto p-3" role="log" aria-live="polite" aria-label="Chat messages">
            {chatMessages.length === 0 ? (
              <p className="text-center text-xs text-gray-500">No messages yet. Start the conversation!</p>
            ) : (
              chatMessages.map(msg => (
                <div key={msg.id} className="group flex gap-2.5">
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
                      <RoleBadge role={msg.participant.role} />
                      <span className="text-[10px] text-gray-500">
                        {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p className="text-xs text-gray-300">{msg.text}</p>
                  </div>
                </div>
              ))
            )}
            <div ref={chatEndRef} />
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
                aria-label="Type a chat message"
              />
              <button
                onClick={onSendChat}
                className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-purple text-white transition-colors hover:bg-brand-purple-hover disabled:opacity-40"
                aria-label="Send message"
                disabled={!chatInput.trim()}
              >
                <Send size={13} />
              </button>
            </div>
          </div>
        </div>
      )}

      {showEndConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4" onClick={() => setShowEndConfirm(false)}>
          <div
            className="animate-slide-up w-full max-w-sm rounded-2xl border border-room-border bg-room-panel p-5 shadow-2xl"
            onClick={e => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="end-circle-title"
          >
            <div className="mb-3 flex items-center gap-2.5">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-red/20">
                <AlertTriangle size={20} className="text-brand-red" />
              </div>
              <h3 id="end-circle-title" className="text-base font-bold text-white">End Circle?</h3>
            </div>
            <p className="mb-4 text-sm text-gray-400">
              All participants will be removed and the session will end. The recording will remain available in past recordings.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowEndConfirm(false)}
                className="flex-1 rounded-lg border border-room-border bg-room-card py-2.5 text-sm font-medium text-gray-300 transition-colors hover:bg-room-hover"
              >
                Cancel
              </button>
              <button
                onClick={handleEndCircle}
                className="flex-1 rounded-lg bg-brand-red py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-red-hover"
              >
                End Circle
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
