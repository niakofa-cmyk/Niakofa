/**
 * Applies WorldMutations to persistent world state. Replace the `any`
 * currentState type with the real legacy-demo-state.ts state shape when
 * wiring into the actual repo -- kept generic here since that file wasn't
 * part of what's inspectable in this session (see the repo-mismatch note
 * in the delivery README).
 */

import type { WorldMutation } from "./types";

export interface MinimalWorldState {
  journal: { id: string; title: string; body: string; tags: string[]; ts: number }[];
  locationState: Record<string, string>;
  memoryEchoes: Record<string, string[]>;
  relationships: Record<string, number>;
  inventory: Record<string, number>;
  questEchoes: string[];
  worldVersion: number;
}

export function createEmptyWorldState(): MinimalWorldState {
  return { journal: [], locationState: {}, memoryEchoes: {}, relationships: {}, inventory: {}, questEchoes: [], worldVersion: 0 };
}

export function applyWorldMutations(mutations: WorldMutation[], currentState: MinimalWorldState): MinimalWorldState {
  const next: MinimalWorldState = {
    ...currentState,
    journal: [...currentState.journal],
    locationState: { ...currentState.locationState },
    memoryEchoes: { ...currentState.memoryEchoes },
    relationships: { ...currentState.relationships },
    inventory: { ...currentState.inventory },
    questEchoes: [...currentState.questEchoes],
  };

  for (const m of mutations) {
    switch (m.type) {
      case "journal-entry":
        next.journal.push({ id: cryptoRandomId(), title: m.title, body: m.body, tags: m.tags ?? [], ts: Date.now() });
        break;
      case "set-location-state":
        next.locationState[m.locationId] = m.state;
        break;
      case "add-memory-echo":
        next.memoryEchoes[m.locationId] = [...(next.memoryEchoes[m.locationId] ?? []), m.memoryId];
        break;
      case "relationship-delta":
        next.relationships[m.npcId] = (next.relationships[m.npcId] ?? 0) + m.delta;
        break;
      case "grant-item":
        next.inventory[m.itemId] = (next.inventory[m.itemId] ?? 0) + (m.qty ?? 1);
        break;
      case "quest-echo":
        if (!next.questEchoes.includes(m.questId)) next.questEchoes.push(m.questId);
        break;
      case "spawn-npc":
      case "unlock-path":
      case "change-building":
        // Structural world mutations -- wire into the real scene/NPC systems
        // once legacy-map-engine.ts's scene mutation API exists; logged, not
        // silently dropped, so gaps are visible during integration.
        console.info("[legacy-world/mutations] unhandled mutation kind (needs scene-level wiring):", m);
        break;
      default: {
        const _exhaustive: never = m;
        console.warn("Unhandled mutation", _exhaustive);
      }
    }
  }

  next.worldVersion += 1;
  return next;
}

function cryptoRandomId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
