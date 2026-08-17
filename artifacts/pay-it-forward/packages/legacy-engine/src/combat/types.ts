export interface AABB {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface HitEvent {
  attackerId: string;
  targetId: string;
  clip: string;
  frame: number;
  damage: number;
  knockback: number;
  stagger: boolean;
}

export interface DamageEvent {
  targetId: string;
  amount: number;
  remainingHealth: number;
  lethal: boolean;
  knockbackX: number;
  knockbackY: number;
}

export function intersectsAABB(a: AABB, b: AABB): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}
