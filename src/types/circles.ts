export type Role = 'host' | 'co-host' | 'speaker' | 'audience';
export type ConnectionQuality = 'excellent' | 'good' | 'weak' | 'reconnecting' | 'disconnected';
export type CircleType = 'audio' | 'video';
export type RightPanelTab = 'room' | 'chat';
export type LeftPanelTab = 'people' | 'reactions';

export interface Participant {
  id: string;
  name: string;
  shortName: string;
  avatar: string;
  role: Role;
  isMicOn: boolean;
  isCameraOn: boolean;
  hasRaisedHand: boolean;
}

export interface RaisedHandEntry {
  participantId: string;
  participant: Participant;
  timestamp: number;
}

export interface Circle {
  id: string;
  title: string;
  topic: string;
  city: string;
  neighborhood: string;
  isLive: boolean;
  participantCount: number;
  stageCount: number;
  isRecording: boolean;
  type: CircleType;
  description: string;
  hostName: string;
  hostAvatar: string;
  followersCount: number;
  tags: string[];
  scheduledTime?: string;
}

export interface ChatMessage {
  id: string;
  participantId: string;
  participant: Participant;
  text: string;
  timestamp: Date;
}

export interface RoomState {
  participants: Participant[];
  raisedHands: RaisedHandEntry[];
  currentUserId: string;
  isRecording: boolean;
  connectionQuality: ConnectionQuality;
  rightTab: RightPanelTab;
  leftTab: LeftPanelTab;
  chatMessages: ChatMessage[];
  isMicOn: boolean;
  isCameraOn: boolean;
  showMobilePanel: boolean;
  speakerLimit: number;
  chatInput: string;
}
