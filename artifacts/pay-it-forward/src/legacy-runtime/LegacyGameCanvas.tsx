/**
 * LegacyGameCanvas.tsx — PixiJS living-world host component.
 *
 * ARCHITECTURE (10-Layer model per NIAKOFA_LEGACY_REFERENCE.md)
 * ──────────────────────────────────────────────────────────────
 * Layer 1  Renderer      PixiJS WebGL, 60fps ticker, 6-layer scene stack
 * Layer 2  World         Continuously running Cape Coast tile map
 * Layer 3  Character     Kwame 6-direction movement (direction.ts)
 * Layer 4  Animation     Idle/walk/run/interact/hurt/talk (kwame-manifest.ts)
 * Layer 5  Collision     Wall-sliding AABB from scene.collision (FSM lines 98-99)
 * Layer 6  NPC AI        NPCController schedules: dawn/morning/afternoon/evening/night
 * Layer 7  Combat        LegacyCombatFSM + LegacyBattleScene (separate component)
 * Layer 8  Quest runtime Activity system (evaluateInteraction) + world triggers
 * Layer 9  Living        Fishing FSM, weather (external), time of day, relationships
 * Layer 10 Legacy engine KwameAttributeSystem — every action → XP → levels → Vault
 *
 * NPC & Attribute systems designed from:
 *   • Eldiron entity.rs + collision_world.rs (MIT — architecture reference)
 *   • MMOCore PlayerAttributes + FishingManager (design reference ONLY — not copied)
 */

import { useEffect, useRef, useState } from "react";
import { Application, Graphics, Texture } from "pixi.js";
import { LegacyActorController } from "@/lib/legacy-animation-fsm";
import { LegacyCombatController, type LegacyCombatTarget } from "@/lib/legacy-combat-fsm";
import type { LegacyMapScene } from "@/lib/legacy-map-engine";
import { TILE_SIZE_PX } from "@/lib/legacy-map-engine";
import { buildSceneContainers, renderStaticLayers, depthSortActors } from "./legacy-scene-renderer";
import { LegacyActorSprite } from "./legacy-actor-sprite";
import {
  loadCharacterFrameSet,
  loadEnvironmentTextures,
  type CharacterManifest,
  type EnvironmentManifestEntry,
} from "./legacy-asset-loader";
import { evaluateInteraction } from "./legacy-world/runtime-interaction";
import {
  startFishingRuntime,
  updateFishingRuntime,
  fishingHook,
  fishingLand,
  cancelFishing,
  getFishingState,
} from "./legacy-world/fishing-runtime";
import { applyWorldMutations, createEmptyWorldState, type MinimalWorldState } from "./legacy-world/mutations";
import type { WorldActivity } from "./legacy-world/types";
import { NPCController, CAPE_COAST_NPCS } from "./legacy-npc";
import { KwameAttributeSystem } from "./legacy-attributes";

// ─── Props ──────────────────────────────────────────────────────────────────

export interface LegacyGameCanvasProps {
  scene: LegacyMapScene;
  environmentAssets: EnvironmentManifestEntry[];
  environmentBaseUrl: string;
  characterManifest: CharacterManifest;
  /** Game hour 0–23, controlled externally (weather/day-night cycle). Defaults to 9 (morning). */
  gameHour?: number;
  /** Called each frame with the player's world position. */
  onPlayerPositionChange?: (x: number, y: number) => void;
}

// ─── Constants ───────────────────────────────────────────────────────────────

// TILE_SIZE_PX imported from @/lib/legacy-map-engine — single source of truth.

const KEY_TO_VECTOR: Record<string, { dx: number; dy: number }> = {
  ArrowUp:    { dx:  0, dy: -1 },
  ArrowDown:  { dx:  0, dy:  1 },
  ArrowLeft:  { dx: -1, dy:  0 },
  ArrowRight: { dx:  1, dy:  0 },
  w: { dx:  0, dy: -1 },
  s: { dx:  0, dy:  1 },
  a: { dx: -1, dy:  0 },
  d: { dx:  1, dy:  0 },
};

// NPC placeholder rectangle: 24×36px, feet at tile center
const NPC_WIDTH_PX  = 24;
const NPC_HEIGHT_PX = 36;

// ─── Component ───────────────────────────────────────────────────────────────

export function LegacyGameCanvas({
  scene,
  environmentAssets,
  environmentBaseUrl,
  characterManifest,
  gameHour = 9,
  onPlayerPositionChange,
}: LegacyGameCanvasProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [prompt, setPrompt] = useState<string | null>(null);
  const [focusedActivity, setFocusedActivity] = useState<WorldActivity | null>(null);
  const [npcPrompt, setNpcPrompt] = useState<string | null>(null);
  const [attributeNotice, setAttributeNotice] = useState<string | null>(null);

  const worldStateRef = useRef<MinimalWorldState>(createEmptyWorldState());
  const gameHourRef   = useRef<number>(gameHour);
  const attrSystemRef = useRef<KwameAttributeSystem>(
    new KwameAttributeSystem(undefined, (attr, level) => {
      setAttributeNotice(`${KwameAttributeSystem.label(attr)} reached level ${level}!`);
      setTimeout(() => setAttributeNotice(null), 4000);
    })
  );

  // Keep gameHour ref current without restarting the PixiJS loop
  useEffect(() => { gameHourRef.current = gameHour; }, [gameHour]);

  useEffect(() => {
    let destroyed = false;
    const app = new Application();
    const pressedKeys = new Set<string>();
    let running = false;
    let focusedActivityLocal: WorldActivity | null = null;
    let talkingNpcId: string | null = null;

    // ── Layer 6: NPC controllers (Eldiron entity.rs pattern) ──────────────────
    const npcControllers = CAPE_COAST_NPCS.map(def => new NPCController(def));

    // ── Layer 10: Attribute system (MMOCore design reference) ────────────────
    const attrs = attrSystemRef.current;

    // ─── Input handlers ────────────────────────────────────────────────────
    const onKeyDown = (e: KeyboardEvent) => {
      // Prevent Space from scrolling the page while the game canvas is active
      if (e.key === " " || e.key === "ArrowUp" || e.key === "ArrowDown" ||
          e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
      }

      pressedKeys.add(e.key);
      if (e.key === "Shift") pressedKeys.add("running");

      // Fishing sub-controls — world keeps rendering underneath
      if (focusedActivityLocal?.type === "fishing") {
        const phase = getFishingState()?.phase;
        if ((e.key === " " || e.key === "j") && phase === "bite")    { fishingHook(); return; }
        if ((e.key === " " || e.key === "j") && phase === "reeling") { fishingLand(); return; }
        if (e.key === "Escape") { cancelFishing(); return; }
        return;
      }

      if (e.key === " ") tryInteractOrTalk();
      // 'e' — inspect: examine nearby object or landmark (hand-drawn INSPECT atlas, 6 frames)
      if (e.key === "e" || e.key === "E") {
        player.playAction("inspect");
        attrs.processEvent({ type: "quest_objective", objectiveType: "inspect" });
      }
      // 'f' — pick up: collect item near player (hand-drawn PICK_UP atlas, 8 frames)
      if (e.key === "f" || e.key === "F") {
        player.playAction("pick_up");
        attrs.processEvent({ type: "quest_objective", objectiveType: "pick_up" });
      }
      if (e.key === "j") combat.lightAttack(currentCombatTargets);
      if (e.key === "k") combat.heavyAttack(currentCombatTargets);
      if (e.key === "l") combat.jump();
    };

    const onKeyUp = (e: KeyboardEvent) => {
      pressedKeys.delete(e.key);
      if (e.key === "Shift") pressedKeys.delete("running");
    };

    // ─── Player + combat controllers ────────────────────────────────────────
    const player = new LegacyActorController({ x: 5, y: 5, facing: "down" });
    const combat = new LegacyCombatController(player);
    const currentCombatTargets: LegacyCombatTarget[] = [];

    // ─── Multi-line NPC dialogue state ────────────────────────────────────────
    // Tracks how far into each NPC's dialogue array the player has progressed.
    const npcLineIndex = new Map<string, number>();

    // ─── Collision query (Layer 5 + 6) ────────────────────────────────────────
    // Checks both wall AABB (scene.collision) and NPC body occupancy.
    // NPCs act as soft obstacles — sleeping NPCs are always passable.
    const NPC_BLOCK_RADIUS = 0.62;  // tiles — half-body width of an NPC placeholder
    const collisionQuery = {
      canOccupy(x: number, y: number): boolean {
        // Wall check (Eldiron AABB style)
        const wallBlocked = scene.collision.some(
          c => c.solid && x >= c.x && x < c.x + c.widthTiles && y >= c.y && y < c.y + c.heightTiles
        );
        if (wallBlocked) return false;
        // NPC body check — block player if an active NPC occupies that tile
        for (const ctrl of npcControllers) {
          if (ctrl.state.behaviorState === "sleeping") continue;
          const d = Math.hypot(x - ctrl.state.x, y - ctrl.state.y);
          if (d < NPC_BLOCK_RADIUS) return false;
        }
        return true;
      },
    };

    // ─── Interaction + dialogue (Layer 6 + 8) ────────────────────────────────
    // Multi-line dialogue: Space advances through each line; after the last
    // line one more Space press ends the conversation (Eldiron dialogue flow).
    function tryInteractOrTalk() {
      // Currently in a conversation — advance or close
      if (talkingNpcId) {
        const ctrl = npcControllers.find(c => c.definition.id === talkingNpcId);
        if (!ctrl) { talkingNpcId = null; setNpcPrompt(null); return; }

        const lines = ctrl.definition.dialogueLines;
        const currentIdx = npcLineIndex.get(talkingNpcId) ?? 0;
        const nextIdx = currentIdx + 1;

        if (nextIdx < lines.length) {
          // Advance to next line
          npcLineIndex.set(talkingNpcId, nextIdx);
          setNpcPrompt(`${ctrl.definition.name}: "${lines[nextIdx]}"`);
        } else {
          // Reached end — close dialogue
          ctrl.endTalking();
          ctrl.improveRelationship(5);
          attrs.processEvent({ type: "npc_talked", npcId: talkingNpcId });
          npcLineIndex.delete(talkingNpcId);
          talkingNpcId = null;
          setNpcPrompt(null);
        }
        return;
      }

      // Check NPC proximity first (takes priority over world activities)
      const nearNpc = npcControllers.find(c => c.state.isNearPlayer && c.definition.talkable);
      if (nearNpc) {
        talkingNpcId = nearNpc.definition.id;
        npcLineIndex.set(nearNpc.definition.id, 0);
        const line = nearNpc.startTalking();  // returns line[0] already
        setNpcPrompt(`${nearNpc.definition.name}: "${line}"`);
        return;
      }

      // World activity interaction (fishing, memory-echo, quest-objective)
      tryWorldInteract();
    }

    function tryWorldInteract() {
      const interaction = evaluateInteraction({ x: player.state.x, y: player.state.y });
      if (!interaction.activity) return;

      if (interaction.activity.type === "fishing") {
        focusedActivityLocal = interaction.activity;
        setFocusedActivity(interaction.activity);
        startFishingRuntime(
          interaction.activity,
          { playerId: "kwame-mensah", locationId: interaction.location!.id, worldVersion: worldStateRef.current.worldVersion },
          (result, mutations) => {
            // Layer 9 + 10: fishing results → attribute XP
            if (result && "fish" in result) {
              attrs.processEvent({ type: "fish_caught", fishRarity: (result as any).rarity ?? 1 });
            }
            if (result && "memoryEcho" in result && (result as any).memoryEcho) {
              attrs.processEvent({ type: "river_memory", depth: 1 });
            }
            worldStateRef.current = applyWorldMutations(mutations, worldStateRef.current);
            focusedActivityLocal = null;
            setFocusedActivity(null);
          }
        );
        return;
      }

      // Non-fishing activities
      const mutations = interaction.activity.onComplete(
        {},
        { playerId: "kwame-mensah", locationId: interaction.location!.id, worldVersion: worldStateRef.current.worldVersion }
      );
      worldStateRef.current = applyWorldMutations(mutations, worldStateRef.current);

      // Quest objective → attribute XP (Layer 10)
      if (interaction.activity.type === "quest-objective") {
        attrs.processEvent({ type: "quest_objective", objectiveType: interaction.activity.id });
      }
    }

    // ─── Boot ─────────────────────────────────────────────────────────────────
    async function boot() {
      await app.init({ background: "#1a0f08", resizeTo: hostRef.current ?? undefined, antialias: true });
      if (destroyed || !hostRef.current) return;
      hostRef.current.appendChild(app.canvas);

      const [envTextures, frameSet] = await Promise.all([
        loadEnvironmentTextures(environmentBaseUrl, environmentAssets),
        loadCharacterFrameSet(characterManifest),
      ]);

      const { root, layerContainers, actorLayer } = buildSceneContainers();
      renderStaticLayers(scene, layerContainers, envTextures);
      app.stage.addChild(root);

      // ── Player sprite ───────────────────────────────────────────────────
      const playerSprite = new LegacyActorSprite(frameSet, frameSet["idle:down"] ?? [Texture.WHITE]);
      actorLayer.addChild(playerSprite.view);

      // ── NPC placeholder graphics (Layer 6 — Eldiron entity pattern) ────
      // Each NPC gets a colored Graphics rect and a name label until real
      // sprite sheets are delivered. Feet are anchored to the tile center.
      const npcGfxMap: Map<string, Graphics> = new Map();
      for (const ctrl of npcControllers) {
        const gfx = new Graphics();
        gfx.rect(
          -NPC_WIDTH_PX  / 2,
          -NPC_HEIGHT_PX,
          NPC_WIDTH_PX,
          NPC_HEIGHT_PX
        ).fill({ color: ctrl.definition.placeholderColor, alpha: 0.92 });
        // Name label (simple text via Graphics label string — Canvas 2D fallback)
        gfx.label = ctrl.definition.name;
        actorLayer.addChild(gfx);
        npcGfxMap.set(ctrl.definition.id, gfx);
      }

      window.addEventListener("keydown", onKeyDown);
      window.addEventListener("keyup",   onKeyUp);
      running = true;

      // ─── Game ticker (60fps) ──────────────────────────────────────────────
      app.ticker.add((ticker) => {
        if (!running) return;
        const deltaMs = ticker.deltaMS;

        if (focusedActivityLocal) {
          // Focused mode: world renders, movement stops (fishing minigame etc.)
          updateFishingRuntime(deltaMs);
        } else {
          // ── NPC ticks FIRST (Layer 6) so collision query uses current-frame
          //    NPC positions when the player moves (eliminates one-frame stale).
          for (const ctrl of npcControllers) {
            ctrl.tick(
              deltaMs,
              { x: player.state.x, y: player.state.y },
              gameHourRef.current,
              collisionQuery.canOccupy.bind(collisionQuery)
            );

            // Sync NPC placeholder graphics to world position
            const gfx = npcGfxMap.get(ctrl.definition.id);
            if (gfx) {
              gfx.x = ctrl.state.x * TILE_SIZE_PX + TILE_SIZE_PX / 2;
              gfx.y = ctrl.state.y * TILE_SIZE_PX + TILE_SIZE_PX;
              // Dim sleeping NPCs; highlight nearby ones
              gfx.alpha = ctrl.state.behaviorState === "sleeping" ? 0.35
                : ctrl.state.isNearPlayer ? 1.0
                : 0.85;
            }
          }

          // ── Player movement (Layer 3, 4, 5) ──────────────────────────────
          let dx = 0, dy = 0;
          for (const [key, vec] of Object.entries(KEY_TO_VECTOR)) {
            if (pressedKeys.has(key)) { dx += vec.dx; dy += vec.dy; }
          }
          const len = Math.hypot(dx, dy) || 1;

          // Clamp player to world bounds before ticking movement
          const worldMaxX = scene.widthTiles  - 1;
          const worldMaxY = scene.heightTiles - 1;
          player.state.x = Math.max(0, Math.min(worldMaxX, player.state.x));
          player.state.y = Math.max(0, Math.min(worldMaxY, player.state.y));

          player.tick(deltaMs, { dx: dx / len, dy: dy / len, running: pressedKeys.has("running") }, collisionQuery);
          combat.tick(deltaMs);

          // ── World interaction prompt (Layer 8) ────────────────────────────
          if (!talkingNpcId) {
            const interaction = evaluateInteraction({ x: player.state.x, y: player.state.y });
            const nearNpc = npcControllers.find(c => c.state.isNearPlayer && c.definition.talkable);
            if (nearNpc) {
              setPrompt(`Talk to ${nearNpc.definition.name}`);
            } else {
              setPrompt(interaction.prompt);
            }
          }

          // ── Player sprite sync ─────────────────────────────────────────────
          const animState = combat.airborne
            ? (player.state.anim === "idle" ? "fall" : player.state.anim)
            : player.state.anim;
          playerSprite.sync(player, animState as any, player.state.facing);
        }

        // ── Camera follow with world-boundary clamping ────────────────────────
        // 1. Compute ideal centered-on-player target
        const px = player.state.x * TILE_SIZE_PX + TILE_SIZE_PX / 2;
        const py = player.state.y * TILE_SIZE_PX + TILE_SIZE_PX / 2;
        const targetX = app.screen.width  / 2 - px;
        const targetY = app.screen.height / 2 - py;
        // 2. Clamp so camera never scrolls past world edges
        const worldW = scene.widthTiles  * TILE_SIZE_PX;
        const worldH = scene.heightTiles * TILE_SIZE_PX;
        const minCamX = Math.min(0, app.screen.width  - worldW);
        const minCamY = Math.min(0, app.screen.height - worldH);
        const clampedX = Math.min(0, Math.max(minCamX, targetX));
        const clampedY = Math.min(0, Math.max(minCamY, targetY));
        // 3. Smooth lerp toward clamped position
        root.x += (clampedX - root.x) * 0.12;
        root.y += (clampedY - root.y) * 0.12;

        // ── Depth-sort all actors (player + NPCs) ─────────────────────────────
        depthSortActors(actorLayer);
        onPlayerPositionChange?.(player.state.x, player.state.y);
      });
    }

    boot();

    return () => {
      destroyed = true;
      running   = false;
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup",   onKeyUp);
      app.destroy(true, { children: true });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── HUD overlays (React layer over PixiJS canvas) ────────────────────────

  return (
    <div ref={hostRef} style={{ width: "100%", height: "100%", position: "relative" }}>

      {/* World interaction prompt (Layer 8) */}
      {prompt && !focusedActivity && !npcPrompt && (
        <div style={HUD_PROMPT_STYLE}>
          {prompt} <span style={{ opacity: 0.6 }}>[Space]</span>
        </div>
      )}

      {/* Fishing HUD (Layer 9) */}
      {focusedActivity?.type === "fishing" && (
        <div style={HUD_PROMPT_STYLE}>
          Fishing… <span style={{ opacity: 0.6 }}>[Space] hook/land · [Esc] cancel</span>
        </div>
      )}

      {/* NPC dialogue box (Layer 6) */}
      {npcPrompt && (
        <div style={NPC_DIALOGUE_STYLE}>
          <div style={{ fontSize: 13, lineHeight: 1.5, color: "#f0d9a8" }}>{npcPrompt}</div>
          <div style={{ fontSize: 11, opacity: 0.55, marginTop: 6 }}>[Space] to continue</div>
        </div>
      )}

      {/* Attribute level-up toast (Layer 10) */}
      {attributeNotice && (
        <div style={ATTR_NOTICE_STYLE}>
          ✦ {attributeNotice}
        </div>
      )}

      {/* Control legend */}
      <div style={CONTROL_LEGEND_STYLE}>
        <span>↑↓←→ / WASD — move</span>
        <span>Shift — run</span>
        <span>Space — interact / talk</span>
        <span>E — inspect</span>
        <span>F — pick up</span>
        <span>J/K — attack</span>
        <span>L — jump</span>
      </div>
    </div>
  );
}

// ─── HUD styles ──────────────────────────────────────────────────────────────

const HUD_PROMPT_STYLE: React.CSSProperties = {
  position: "absolute",
  bottom: 24,
  left: "50%",
  transform: "translateX(-50%)",
  background: "rgba(26,15,8,0.88)",
  color: "#f0d9a8",
  padding: "7px 16px",
  borderRadius: 7,
  fontSize: 14,
  whiteSpace: "nowrap",
  pointerEvents: "none",
};

const NPC_DIALOGUE_STYLE: React.CSSProperties = {
  position: "absolute",
  bottom: 60,
  left: "50%",
  transform: "translateX(-50%)",
  width: "min(480px, 90%)",
  background: "rgba(20,12,6,0.94)",
  border: "1px solid rgba(214,158,46,0.35)",
  color: "#e8d4a0",
  padding: "14px 18px",
  borderRadius: 9,
  fontSize: 14,
  pointerEvents: "none",
};

const ATTR_NOTICE_STYLE: React.CSSProperties = {
  position: "absolute",
  top: 20,
  left: "50%",
  transform: "translateX(-50%)",
  background: "rgba(20,12,6,0.92)",
  border: "1px solid rgba(214,158,46,0.55)",
  color: "#d6a02e",
  padding: "8px 18px",
  borderRadius: 7,
  fontSize: 13,
  fontWeight: 600,
  letterSpacing: "0.03em",
  pointerEvents: "none",
  animation: "fadeIn 0.3s ease-out",
};

const CONTROL_LEGEND_STYLE: React.CSSProperties = {
  position: "absolute",
  bottom: 6,
  right: 10,
  display: "flex",
  gap: 10,
  fontSize: 10,
  color: "rgba(240,217,168,0.35)",
  pointerEvents: "none",
};
