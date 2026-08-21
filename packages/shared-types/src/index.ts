export interface FamilyMemberRef {
  id: string;
  displayName: string;
  birthYear?: number;
  deathYear?: number;
  occupation?: string;
  locationLabel?: string;
}

export interface LegacyCharacterSeed {
  familyMemberId: string;
  eraYear: number;
  age: number;
  occupation?: string;
  locationId?: string;
  clothingProfile?: string;
  skills?: string[];
}

export interface LegacyLaunchContext {
  mode: "mock" | "live";
  familyId?: string;
  characterId?: string;
  sessionToken?: string;
  gameHour?: number;
}

export interface LegacyRuntimeSave {
  sceneId: string;
  familyMemberId?: string;
  position: { x: number; y: number };
  worldVersion: number;
}