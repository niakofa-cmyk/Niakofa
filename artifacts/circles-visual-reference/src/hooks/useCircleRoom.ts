import { useState, _useEffect, useRef, useCallback } from 'react';
import type {
  Participant,
  RaisedHandEntry,
  RoomState,
  RightPanelTab,
  LeftPanelTab,
  ChatMessage,
  RoomSettings,
} from '@/types/circles';
import { MOCK_PARTICIPANTS, LIVE_CIRCLE, MOCK_CHAT_MESSAGES } from '@/data/mockData';

const CURRENT_USER_ID = 'marcus';

const DEFAULT_SETTINGS: RoomSettings = {
  speakerLimit: 18,
  chatEnabled: true,
  recordingAllowed: true,
  slowMode: false,
  slowModeInterval: 5,
  roomVisibility: 'public',
};

function buildInitialRaisedHands(participants: Participant[]): RaisedHandEntry[] {
  return participants
    .filter(p => p.hasRaisedHand)
    .map((p, i) => ({
      participantId: p.id,
      participant: p,
      timestamp: Date.now() - (5 - i) * 60 * 1000,
    }));
}

export function useCircleRoom() {
  const [state, setState] = useState<RoomState>({
    participants: MOCK_PARTICIPANTS,
    raisedHands: buildInitialRaisedHands(MOCK_PARTICIPANTS),
    currentUserId: CURRENT_USER_ID,
    isRecording: LIVE_CIRCLE.isRecording,
    connectionQuality: 'excellent',
    rightTab: 'room',
    leftTab: 'people',
    chatMessages: MOCK_CHAT_MESSAGES,
    isMicOn: true,
    isCameraOn: true,
    showMobilePanel: false,
    settings: DEFAULT_SETTINGS,
    chatInput: '',
  });

  const lastChatTimeRef = useRef(0);

  const updateParticipant = useCallback((id: string, updates: Partial<Participant>) => {
    setState(s => ({
      ...s,
      participants: s.participants.map(p => (p.id === id ? { ...p, ...updates } : p)),
      raisedHands: s.raisedHands.map(rh =>
        rh.participantId === id
          ? { ...rh, participant: { ...rh.participant, ...updates } }
          : rh
      ),
    }));
  }, []);

  const toggleMic = useCallback(() => {
    setState(s => {
      const next = !s.isMicOn;
      return {
        ...s,
        isMicOn: next,
        participants: s.participants.map(p =>
          p.id === s.currentUserId ? { ...p, isMicOn: next } : p
        ),
      };
    });
  }, []);

  const toggleCamera = useCallback(() => {
    setState(s => {
      const next = !s.isCameraOn;
      return {
        ...s,
        isCameraOn: next,
        participants: s.participants.map(p =>
          p.id === s.currentUserId ? { ...p, isCameraOn: next } : p
        ),
      };
    });
  }, []);

  const bringUpSpeaker = useCallback((participantId: string) => {
    setState(s => ({
      ...s,
      participants: s.participants.map(p =>
        p.id === participantId
          ? { ...p, role: 'speaker', hasRaisedHand: false, isMicOn: false }
          : p
      ),
      raisedHands: s.raisedHands.filter(rh => rh.participantId !== participantId),
    }));
  }, []);

  const dismissHand = useCallback((participantId: string) => {
    setState(s => ({
      ...s,
      raisedHands: s.raisedHands.filter(rh => rh.participantId !== participantId),
      participants: s.participants.map(p =>
        p.id === participantId ? { ...p, hasRaisedHand: false } : p
      ),
    }));
  }, []);

  const muteParticipant = useCallback((participantId: string) => {
    updateParticipant(participantId, { isMicOn: false });
  }, [updateParticipant]);

  const muteAll = useCallback(() => {
    setState(s => ({
      ...s,
      participants: s.participants.map(p =>
        p.role === 'speaker' ? { ...p, isMicOn: false } : p
      ),
    }));
  }, []);

  const lowerAll = useCallback(() => {
    setState(s => ({
      ...s,
      raisedHands: [],
      participants: s.participants.map(p => ({ ...p, hasRaisedHand: false })),
    }));
  }, []);

  const makeCoHost = useCallback((participantId: string) => {
    updateParticipant(participantId, { role: 'co-host' });
  }, [updateParticipant]);

  const moveToAudience = useCallback((participantId: string) => {
    updateParticipant(participantId, {
      role: 'audience',
      isMicOn: false,
      isCameraOn: false,
    });
  }, [updateParticipant]);

  const removeParticipant = useCallback((participantId: string) => {
    setState(s => ({
      ...s,
      participants: s.participants.filter(p => p.id !== participantId),
      raisedHands: s.raisedHands.filter(rh => rh.participantId !== participantId),
    }));
  }, []);

  const toggleRecording = useCallback(() => {
    setState(s => {
      if (!s.settings.recordingAllowed) return s;
      return { ...s, isRecording: !s.isRecording };
    });
  }, []);

  const raiseHand = useCallback(() => {
    setState(s => {
      const isOnStage = s.participants.find(p => p.id === s.currentUserId)?.role !== 'audience';
      if (isOnStage) return s;
      return {
        ...s,
        participants: s.participants.map(p =>
          p.id === s.currentUserId ? { ...p, hasRaisedHand: !p.hasRaisedHand } : p
        ),
        raisedHands: (() => {
          const existing = s.raisedHands.find(rh => rh.participantId === s.currentUserId);
          if (existing) {
            return s.raisedHands.filter(rh => rh.participantId !== s.currentUserId);
          }
          const p = s.participants.find(pp => pp.id === s.currentUserId);
          return p
            ? [...s.raisedHands, { participantId: s.currentUserId, participant: p, timestamp: Date.now() }]
            : s.raisedHands;
        })(),
      };
    });
  }, []);

  const setRightTab = useCallback((tab: RightPanelTab) => {
    setState(s => ({ ...s, rightTab: tab }));
  }, []);

  const setLeftTab = useCallback((tab: LeftPanelTab) => {
    setState(s => ({ ...s, leftTab: tab }));
  }, []);

  const toggleMobilePanel = useCallback(() => {
    setState(s => ({ ...s, showMobilePanel: !s.showMobilePanel }));
  }, []);

  const closeMobilePanel = useCallback(() => {
    setState(s => ({ ...s, showMobilePanel: false }));
  }, []);

  const setChatInput = useCallback((value: string) => {
    setState(s => ({ ...s, chatInput: value }));
  }, []);

  const sendChatMessage = useCallback(() => {
    setState(s => {
      if (!s.settings.chatEnabled) return s;
      if (!s.chatInput.trim()) return s;
      if (s.settings.slowMode) {
        const now = Date.now();
        if (now - lastChatTimeRef.current < s.settings.slowModeInterval * 1000) return s;
        lastChatTimeRef.current = now;
      }
      const currentUser = s.participants.find(p => p.id === s.currentUserId);
      if (!currentUser) return s;
      const newMsg: ChatMessage = {
        id: Date.now().toString(),
        participantId: s.currentUserId,
        participant: currentUser,
        text: s.chatInput.trim(),
        timestamp: new Date(),
      };
      return {
        ...s,
        chatMessages: [...s.chatMessages, newMsg],
        chatInput: '',
      };
    });
  }, []);

  const deleteChatMessage = useCallback((messageId: string) => {
    setState(s => ({
      ...s,
      chatMessages: s.chatMessages.map(m =>
        m.id === messageId ? { ...m, isDeleted: true } : m
      ),
    }));
  }, []);

  const updateSettings = useCallback((updates: Partial<RoomSettings>) => {
    setState(s => ({ ...s, settings: { ...s.settings, ...updates } }));
  }, []);

  const stageParticipants = state.participants.filter(
    p => p.role === 'host' || p.role === 'co-host' || p.role === 'speaker'
  );
  const audienceParticipants = state.participants.filter(p => p.role === 'audience');
  const host = state.participants.find(p => p.role === 'host');
  const coHost = state.participants.find(p => p.role === 'co-host');
  const speakers = state.participants.filter(p => p.role === 'speaker');
  const currentUser = state.participants.find(p => p.id === state.currentUserId);
  const currentUserRole = currentUser?.role ?? 'audience';

  return {
    state,
    circle: LIVE_CIRCLE,
    stageParticipants,
    audienceParticipants,
    host,
    coHost,
    speakers,
    currentUser,
    currentUserRole,
    toggleMic,
    toggleCamera,
    bringUpSpeaker,
    dismissHand,
    muteParticipant,
    muteAll,
    lowerAll,
    makeCoHost,
    moveToAudience,
    removeParticipant,
    toggleRecording,
    raiseHand,
    setRightTab,
    setLeftTab,
    toggleMobilePanel,
    closeMobilePanel,
    setChatInput,
    sendChatMessage,
    deleteChatMessage,
    updateSettings,
  };
}
