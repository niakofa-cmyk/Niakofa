import { useState } from 'react';
import {
  ChevronRight,
  Radio,
  Signal,
  MoreHorizontal,
  X,
  Users,
  MessageCircle,
  Hand,
  Mic,
  MicOff,
  Video,
  VideoOff,
  LogOut,
  PhoneOff,
  ChevronDown,
} from 'lucide-react';
import type { Circle, MobileView } from '@/types/circles';
import { useCircleRoom } from '@/hooks/useCircleRoom';
import { useRecordingTimer } from '@/hooks/useRecordingTimer';
import { LeftPanel } from './LeftPanel';
import { CenterStage } from './CenterStage';
import { RightPanel } from './RightPanel';

interface CircleRoomProps {
  circle: Circle;
  onLeave: () => void;
}

export function CircleRoom({ circle, onLeave }: CircleRoomProps) {
  const room = useCircleRoom();
  const recordingTime = useRecordingTimer(room.state.isRecording);
  const [mobileView, setMobileView] = useState<MobileView>('stage');

  const isAudience = room.currentUserRole === 'audience';
  const _isOnStage = room.currentUserRole === 'host' || room.currentUserRole === 'co-host' || room.currentUserRole === 'speaker';

  return (
    <div className="flex h-full flex-col bg-room-bg">
      {/* Desktop header */}
      <div className="hidden items-center justify-between border-b border-room-border bg-room-panel px-4 py-2.5 lg:flex">
        <div className="flex items-center gap-3">
          <button
            onClick={onLeave}
            className="flex items-center gap-1 text-xs font-medium text-gray-400 transition-colors hover:text-white"
            aria-label="Back to Circles"
          >
            <ChevronRight size={14} className="rotate-180" />
            Back to Circles
          </button>
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-white">{circle.title}</span>
            <span className="flex items-center gap-1.5 text-xs font-semibold text-brand-green">
              <span className="h-2 w-2 animate-pulse-live rounded-full bg-brand-green" />
              LIVE
            </span>
            {room.state.isRecording && (
              <span className="flex items-center gap-1 text-xs font-semibold text-brand-red">
                <Radio size={12} />
                {recordingTime}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs font-medium text-brand-green" role="status" aria-live="polite">
            <Signal size={14} />
            Excellent Connection
          </div>
          <button
            onClick={room.toggleMobilePanel}
            className="rounded-full p-1.5 text-gray-400 transition-colors hover:bg-room-hover hover:text-white xl:hidden"
            aria-label="Open moderation panel"
          >
            <MoreHorizontal size={16} />
          </button>
        </div>
      </div>

      {/* Mobile header */}
      <div className="flex items-center justify-between border-b border-room-border bg-room-panel px-3 py-2 lg:hidden">
        <button
          onClick={onLeave}
          className="flex items-center gap-1 text-xs font-medium text-gray-400"
          aria-label="Back to Circles"
        >
          <ChevronRight size={14} className="rotate-180" />
          Back
        </button>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-brand-green">
            <span className="h-2 w-2 animate-pulse-live rounded-full bg-brand-green" />
            LIVE
          </span>
          {room.state.isRecording && (
            <span className="flex items-center gap-1 text-xs font-semibold text-brand-red">
              <Radio size={10} />
              {recordingTime}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 text-xs font-medium text-brand-green">
          <Signal size={12} />
        </div>
      </div>

      {/* Desktop 3-column layout */}
      <div className="hidden min-h-0 flex-1 lg:flex">
        <div className="hidden w-64 flex-shrink-0 border-r border-room-border lg:block">
          <LeftPanel
            circle={circle}
            stageParticipants={room.stageParticipants}
            audienceParticipants={room.audienceParticipants}
            currentUserId={room.state.currentUserId}
            leftTab={room.state.leftTab}
            recordingTime={recordingTime}
            onSetLeftTab={room.setLeftTab}
            onLeave={onLeave}
          />
        </div>

        <div className="min-w-0 flex-1">
          <CenterStage
            host={room.host}
            coHost={room.coHost}
            speakers={room.speakers}
            audienceParticipants={room.audienceParticipants}
            currentUserId={room.state.currentUserId}
            currentUserRole={room.currentUserRole}
            isMicOn={room.state.isMicOn}
            isCameraOn={room.state.isCameraOn}
            raisedHandsCount={room.state.raisedHands.length}
            onToggleMic={room.toggleMic}
            onToggleCamera={room.toggleCamera}
            onLeave={onLeave}
            onShowRaisedHands={room.toggleMobilePanel}
            onRaiseHand={room.raiseHand}
          />
        </div>

        <div className="hidden w-80 flex-shrink-0 border-l border-room-border xl:block">
          <RightPanel
            raisedHands={room.state.raisedHands}
            participants={room.state.participants}
            currentUserId={room.state.currentUserId}
            currentUserRole={room.currentUserRole}
            rightTab={room.state.rightTab}
            connectionQuality={room.state.connectionQuality}
            isRecording={room.state.isRecording}
            settings={room.state.settings}
            chatMessages={room.state.chatMessages}
            chatInput={room.state.chatInput}
            onSetRightTab={room.setRightTab}
            onBringUp={room.bringUpSpeaker}
            onDismiss={room.dismissHand}
            onMuteAll={room.muteAll}
            onLowerAll={room.lowerAll}
            onMakeCoHost={room.makeCoHost}
            onRemove={room.removeParticipant}
            onMute={room.muteParticipant}
            onMoveToAudience={room.moveToAudience}
            onToggleRecording={room.toggleRecording}
            onEndCircle={onLeave}
            onSetChatInput={room.setChatInput}
            onSendChat={room.sendChatMessage}
            onDeleteChat={room.deleteChatMessage}
            onUpdateSettings={room.updateSettings}
          />
        </div>
      </div>

      {/* Mobile layout */}
      <div className="flex min-h-0 flex-1 flex-col lg:hidden">
        <div className="flex-1 overflow-hidden">
          {mobileView === 'stage' && (
            <CenterStage
              host={room.host}
              coHost={room.coHost}
              speakers={room.speakers}
              audienceParticipants={room.audienceParticipants}
              currentUserId={room.state.currentUserId}
              currentUserRole={room.currentUserRole}
              isMicOn={room.state.isMicOn}
              isCameraOn={room.state.isCameraOn}
              raisedHandsCount={room.state.raisedHands.length}
              onToggleMic={room.toggleMic}
              onToggleCamera={room.toggleCamera}
              onLeave={onLeave}
              onShowRaisedHands={() => setMobileView('raised')}
              onRaiseHand={room.raiseHand}
            />
          )}
          {mobileView === 'people' && (
            <LeftPanel
              circle={circle}
              stageParticipants={room.stageParticipants}
              audienceParticipants={room.audienceParticipants}
              currentUserId={room.state.currentUserId}
              leftTab={room.state.leftTab}
              recordingTime={recordingTime}
              onSetLeftTab={room.setLeftTab}
              onLeave={onLeave}
            />
          )}
          {(mobileView === 'chat' || mobileView === 'raised') && (
            <RightPanel
              raisedHands={room.state.raisedHands}
              participants={room.state.participants}
              currentUserId={room.state.currentUserId}
              currentUserRole={room.currentUserRole}
              rightTab={mobileView === 'chat' ? 'chat' : 'room'}
              connectionQuality={room.state.connectionQuality}
              isRecording={room.state.isRecording}
              settings={room.state.settings}
              chatMessages={room.state.chatMessages}
              chatInput={room.state.chatInput}
              onSetRightTab={tab => setMobileView(tab === 'chat' ? 'chat' : 'raised')}
              onBringUp={room.bringUpSpeaker}
              onDismiss={room.dismissHand}
              onMuteAll={room.muteAll}
              onLowerAll={room.lowerAll}
              onMakeCoHost={room.makeCoHost}
              onRemove={room.removeParticipant}
              onMute={room.muteParticipant}
              onMoveToAudience={room.moveToAudience}
              onToggleRecording={room.toggleRecording}
              onEndCircle={onLeave}
              onSetChatInput={room.setChatInput}
              onSendChat={room.sendChatMessage}
              onDeleteChat={room.deleteChatMessage}
              onUpdateSettings={room.updateSettings}
            />
          )}
        </div>

        {/* Mobile bottom tab bar */}
        <div className="flex items-center justify-around border-t border-room-border bg-room-panel px-2 py-1.5">
          <MobileTabButton
            icon={<Users size={18} />}
            label="Stage"
            active={mobileView === 'stage'}
            onClick={() => setMobileView('stage')}
          />
          <MobileTabButton
            icon={<Users size={18} />}
            label="People"
            active={mobileView === 'people'}
            onClick={() => setMobileView('people')}
          />
          <MobileTabButton
            icon={<Hand size={18} />}
            label="Raised"
            active={mobileView === 'raised'}
            badge={room.state.raisedHands.length}
            onClick={() => setMobileView('raised')}
          />
          <MobileTabButton
            icon={<MessageCircle size={18} />}
            label="Chat"
            active={mobileView === 'chat'}
            onClick={() => setMobileView('chat')}
          />
        </div>

        {/* Mobile control bar */}
        <div className="flex items-center justify-center gap-2 border-t border-room-border bg-room-panel px-3 py-2.5">
          {isAudience ? (
            <>
              <MobileControlButton
                icon={<Hand size={18} />}
                label="Raise Hand"
                onClick={room.raiseHand}
                variant="primary"
              />
              <MobileControlButton
                icon={<LogOut size={18} />}
                label="Leave"
                onClick={onLeave}
                variant="danger"
              />
            </>
          ) : (
            <>
              <MobileControlButton
                icon={room.state.isMicOn ? <Mic size={18} /> : <MicOff size={18} />}
                label={room.state.isMicOn ? 'Mute' : 'Unmute'}
                onClick={room.toggleMic}
                active={room.state.isMicOn}
              />
              <MobileControlButton
                icon={room.state.isCameraOn ? <Video size={18} /> : <VideoOff size={18} />}
                label="Cam"
                onClick={room.toggleCamera}
                active={room.state.isCameraOn}
              />
              {room.currentUserRole === 'speaker' && (
                <MobileControlButton
                  icon={<ChevronDown size={18} />}
                  label="Leave Stage"
                  onClick={onLeave}
                />
              )}
              <MobileControlButton
                icon={<PhoneOff size={18} />}
                label="Leave"
                onClick={onLeave}
                variant="danger"
              />
            </>
          )}
        </div>
      </div>

      {/* Desktop mobile panel overlay (for lg screens without xl right panel) */}
      {room.state.showMobilePanel && (
        <div className="fixed inset-0 z-50 hidden items-end bg-black/60 lg:flex xl:hidden" onClick={room.closeMobilePanel}>
          <div
            className="animate-slide-up h-[85vh] w-96 max-w-full overflow-hidden rounded-t-2xl bg-room-panel"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-room-border px-4 py-3">
              <div className="flex items-center gap-2">
                {room.state.isRecording && (
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-brand-red">
                    <Radio size={12} />
                    {recordingTime}
                  </span>
                )}
                <span className="flex items-center gap-1.5 text-xs font-semibold text-brand-green">
                  <span className="h-2 w-2 animate-pulse-live rounded-full bg-brand-green" />
                  LIVE
                </span>
              </div>
              <button
                onClick={room.closeMobilePanel}
                className="rounded-full p-1.5 text-gray-400 hover:bg-room-hover hover:text-white"
                aria-label="Close moderation panel"
              >
                <X size={18} />
              </button>
            </div>
            <div className="h-[calc(85vh-50px)]">
              <RightPanel
                raisedHands={room.state.raisedHands}
                participants={room.state.participants}
                currentUserId={room.state.currentUserId}
                currentUserRole={room.currentUserRole}
                rightTab={room.state.rightTab}
                connectionQuality={room.state.connectionQuality}
                isRecording={room.state.isRecording}
                settings={room.state.settings}
                chatMessages={room.state.chatMessages}
                chatInput={room.state.chatInput}
                onSetRightTab={room.setRightTab}
                onBringUp={room.bringUpSpeaker}
                onDismiss={room.dismissHand}
                onMuteAll={room.muteAll}
                onLowerAll={room.lowerAll}
                onMakeCoHost={room.makeCoHost}
                onRemove={room.removeParticipant}
                onMute={room.muteParticipant}
                onMoveToAudience={room.moveToAudience}
                onToggleRecording={room.toggleRecording}
                onEndCircle={onLeave}
                onSetChatInput={room.setChatInput}
                onSendChat={room.sendChatMessage}
                onDeleteChat={room.deleteChatMessage}
                onUpdateSettings={room.updateSettings}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MobileTabButton({
  icon,
  label,
  active,
  onClick,
  badge,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
  badge?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`relative flex flex-col items-center gap-0.5 rounded-lg px-3 py-1.5 transition-colors ${
        active ? 'text-brand-purple-light' : 'text-gray-500'
      }`}
      aria-label={label}
    >
      <div className="relative">
        {icon}
        {badge !== undefined && badge > 0 && (
          <span className="absolute -right-1.5 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-red px-1 text-[8px] font-bold text-white">
            {badge}
          </span>
        )}
      </div>
      <span className="text-[9px] font-medium">{label}</span>
    </button>
  );
}

function MobileControlButton({
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
  const base = 'flex flex-col items-center gap-0.5 rounded-xl px-3 py-1.5 transition-colors text-[10px] font-medium';
  const styles = {
    default: active
      ? 'bg-brand-green/20 text-brand-green'
      : 'bg-room-card text-gray-300',
    primary: 'bg-brand-purple text-white',
    danger: 'bg-brand-red/20 text-brand-red',
  };

  return (
    <button onClick={onClick} className={`${base} ${styles[variant]}`} aria-label={label}>
      {icon}
      <span>{label}</span>
    </button>
  );
}
