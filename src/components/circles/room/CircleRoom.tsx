import { ChevronRight, Radio, Signal, MoreHorizontal, X } from 'lucide-react';
import type { Circle } from '@/types/circles';
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

  return (
    <div className="flex h-full flex-col bg-room-bg">
      <div className="flex items-center justify-between border-b border-room-border bg-room-panel px-4 py-2.5">
        <div className="flex items-center gap-3">
          <button
            onClick={onLeave}
            className="flex items-center gap-1 text-xs font-medium text-gray-400 transition-colors hover:text-white"
            aria-label="Back to Circles"
          >
            <ChevronRight size={14} className="rotate-180" />
            Back to Circles
          </button>
          <div className="hidden items-center gap-2 sm:flex">
            <span className="text-sm font-bold text-white">{circle.title}</span>
            <span className="flex items-center gap-1.5 text-xs font-semibold text-brand-green">
              <span className="h-2 w-2 animate-pulse-live rounded-full bg-brand-green" />
              LIVE
            </span>
            {circle.isRecording && (
              <span className="flex items-center gap-1 text-xs font-semibold text-brand-red">
                <Radio size={12} />
                {recordingTime}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden items-center gap-1.5 text-xs font-medium text-brand-green sm:flex" role="status" aria-live="polite">
            <Signal size={14} />
            Excellent Connection
          </div>
          <button
            onClick={room.toggleMobilePanel}
            className="rounded-full p-1.5 text-gray-400 transition-colors hover:bg-room-hover hover:text-white lg:hidden"
            aria-label="Open moderation panel"
          >
            <MoreHorizontal size={16} />
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
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
            rightTab={room.state.rightTab}
            connectionQuality={room.state.connectionQuality}
            isRecording={room.state.isRecording}
            speakerLimit={room.state.speakerLimit}
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
          />
        </div>
      </div>

      {room.state.showMobilePanel && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/60 lg:hidden" onClick={room.closeMobilePanel}>
          <div
            className="animate-slide-up h-[85vh] w-full overflow-hidden rounded-t-2xl bg-room-panel"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-room-border px-4 py-3">
              <div className="flex items-center gap-2">
                {circle.isRecording && (
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
                rightTab={room.state.rightTab}
                connectionQuality={room.state.connectionQuality}
                isRecording={room.state.isRecording}
                speakerLimit={room.state.speakerLimit}
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
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
