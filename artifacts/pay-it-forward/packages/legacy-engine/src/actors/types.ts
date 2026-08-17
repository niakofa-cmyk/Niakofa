export type ActorStateName =
  | "idle"
  | "walk"
  | "attack"
  | "dodge"
  | "interact"
  | "hurt"
  | "stagger"
  | "recovery"
  | "defeated";

export interface Vector2 {
  x: number;
  y: number;
}

export interface ActorConfig {
  id: string;
  maxHealth: number;
  /** Which clip id to play for a given state, e.g. { idle: "kwame_idle", attack: "kwame_attack_01" } */
  clipForState: Partial<Record<ActorStateName, string>>;
}
