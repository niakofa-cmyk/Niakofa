/**
 * Mountable React component: <LegacyGameCanvas scene={...} /> replaces the
 * DOM/CSS-grid rendering path in legacy-chapter.tsx with a real PixiJS
 * game loop, per RUNTIME_ARCHITECTURE_UPDATE.md rollout step 2-3.
 *
 * Usage (inside legacy-chapter.tsx):
 *   <LegacyGameCanvas scene={capeCoastCompoundScene} characterId="kwame-mensah" />
 */

import { useEffect, useRef, useState } from "react";
import { Application, Texture } from "pixi.js";
import { LegacyActorController } from "./legacy-animation-fsm";
import { LegacyCombatController, type LegacyCombatTarget } from "./legacy-combat-fsm";
import type { LegacyMapScene } from "./legacy-map-engine";
import { buildSceneContainers, renderStaticLayers, depthSortActors } from "./legacy-scene-renderer";
import { LegacyActorSprite } from "./legacy-actor-sprite";
import {
  loadCharacterFrameSet,
  loadEnvironmentTextures,
  type CharacterManifest,
  type EnvironmentManifestEntry,
} from "./legacy-asset-loader";
import { evaluateInteraction } from "./legacy-world/runtime-interaction";
import { startFishingRuntime, updateFishingRuntime, fishingHook, fishingLand, cancelFishing, getFishingState } from "./legacy-world/fishing-runtime";
import { applyWorldMutations, createEmptyWorldState, type MinimalWorldState } from "./legacy-world/mutations";
import type { WorldActivity } from "./legacy-world/types";

export interface LegacyGameCanvasProps {
  scene: LegacyMapScene;
  environmentAssets: EnvironmentManifestEntry[];
  environmentBaseUrl: string;
  characterManifest: CharacterManifest;
  /** Called each frame with the player's world position -- e.g. to drive a minimap or trigger LegacyInteractionPoint checks in the host page. */
  onPlayerPositionChange?: (x: number, y: number) => void;
}

const KEY_TO_VECTOR: Record<string, { dx: number; dy: number }> = {
  ArrowUp: { dx: 0, dy: -1 },
  ArrowDown: { dx: 0, dy: 1 },
  ArrowLeft: { dx: -1, dy: 0 },
  ArrowRight: { dx: 1, dy: 0 },
  w: { dx: 0, dy: -1 },
  s: { dx: 0, dy: 1 },
  a: { dx: -1, dy: 0 },
  d: { dx: 1, dy: 0 },
};

export function LegacyGameCanvas(props: LegacyGameCanvasProps) {
  const { scene, environmentAssets, environmentBaseUrl, characterManifest, onPlayerPositionChange } = props;
  const hostRef = useRef<HTMLDivElement>(null);
  const [prompt, setPrompt] = useState<string | null>(null);
  const [focusedActivity, setFocusedActivity] = useState<WorldActivity | null>(null);
  const worldStateRef = useRef<MinimalWorldState>(createEmptyWorldState());

  useEffect(() => {
    let destroyed = false;
    const app = new Application();
    const pressedKeys = new Set<string>();
    let running = false;
    let focusedActivityLocal: WorldActivity | null = null;

    const onKeyDown = (e: KeyboardEvent) => {
      pressedKeys.add(e.key);
      if (e.key === "Shift") pressedKeys.add("running");

      if (focusedActivityLocal?.type === "fishing") {
        // While fishing, Space/J/K drive the fishing state machine instead
        // of the world -- the PixiJS world stays mounted and rendering
        // underneath, per the "never navigate away" rule.
        const phase = getFishingState()?.phase;
        if ((e.key === " " || e.key === "j") && phase === "bite") fishingHook();
        else if ((e.key === " " || e.key === "j") && phase === "reeling") fishingLand();
        else if (e.key === "Escape") { cancelFishing(); }
        return;
      }

      if (e.key === " ") tryInteract();
      if (e.key === "j") combat.lightAttack(currentCombatTargets);
      if (e.key === "k") combat.heavyAttack(currentCombatTargets);
      if (e.key === "l") combat.jump();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      pressedKeys.delete(e.key);
      if (e.key === "Shift") pressedKeys.delete("running");
    };

    const player = new LegacyActorController({ x: 5, y: 5, facing: "down" });
    const combat = new LegacyCombatController(player);
    const currentCombatTargets: LegacyCombatTarget[] = [];

    function tryInteract() {
      const interaction = evaluateInteraction({ x: player.state.x, y: player.state.y });
      if (!interaction.activity) return;

      if (interaction.activity.type === "fishing") {
        focusedActivityLocal = interaction.activity;
        setFocusedActivity(interaction.activity);
        startFishingRuntime(
          interaction.activity,
          { playerId: "kwame-mensah", locationId: interaction.location!.id, worldVersion: worldStateRef.current.worldVersion },
          (_result, mutations) => {
            worldStateRef.current = applyWorldMutations(mutations, worldStateRef.current);
            focusedActivityLocal = null;
            setFocusedActivity(null);
          }
        );
        return;
      }

      // Non-fishing activities (dialogue, memory-echo, quest-objective):
      // dispatched inline immediately with a stub result. Real dialogue/
      // vault UI wiring is app-specific -- see README limitations.
      const mutations = interaction.activity.onComplete(
        {},
        { playerId: "kwame-mensah", locationId: interaction.location!.id, worldVersion: worldStateRef.current.worldVersion }
      );
      worldStateRef.current = applyWorldMutations(mutations, worldStateRef.current);
      console.info("[legacy-game-canvas] activity completed inline:", interaction.activity.id, mutations);
    }

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

      const playerSprite = new LegacyActorSprite(frameSet, frameSet["idle:down"] ?? [Texture.WHITE]);
      actorLayer.addChild(playerSprite.view);

      window.addEventListener("keydown", onKeyDown);
      window.addEventListener("keyup", onKeyUp);
      running = true;

      const collisionQuery = {
        canOccupy(x: number, y: number) {
          return !scene.collision.some(
            (c) => c.solid && x >= c.x && x < c.x + c.widthTiles && y >= c.y && y < c.y + c.heightTiles
          );
        },
      };

      app.ticker.add((ticker) => {
        if (!running) return;
        const deltaMs = ticker.deltaMS;

        if (focusedActivityLocal) {
          // World keeps rendering (weather, NPCs, lighting could still
          // animate here) but the player actor stops taking movement input
          // -- this IS the "focused" runtime mode from the design doc, not
          // a separate screen.
          updateFishingRuntime(deltaMs);
        } else {
          let dx = 0, dy = 0;
          for (const [key, vec] of Object.entries(KEY_TO_VECTOR)) {
            if (pressedKeys.has(key)) { dx += vec.dx; dy += vec.dy; }
          }
          const len = Math.hypot(dx, dy) || 1;
          player.tick(deltaMs, { dx: dx / len, dy: dy / len, running: pressedKeys.has("running") }, collisionQuery);
          combat.tick(deltaMs);

          const interaction = evaluateInteraction({ x: player.state.x, y: player.state.y });
          setPrompt(interaction.prompt);

          const animState = combat.airborne ? (player.state.anim === "idle" ? "fall" : player.state.anim) : player.state.anim;
          playerSprite.sync(player, animState as any, player.state.facing);
        }

        depthSortActors(actorLayer);
        onPlayerPositionChange?.(player.state.x, player.state.y);
      });
    }

    boot();

    return () => {
      destroyed = true;
      running = false;
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      app.destroy(true, { children: true });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div ref={hostRef} style={{ width: "100%", height: "100%", position: "relative" }}>
      {prompt && !focusedActivity && (
        <div style={{ position: "absolute", bottom: 24, left: "50%", transform: "translateX(-50%)", background: "rgba(26,15,8,0.85)", color: "#f0d9a8", padding: "6px 14px", borderRadius: 6, fontSize: 14 }}>
          {prompt} <span style={{ opacity: 0.6 }}>[Space]</span>
        </div>
      )}
      {focusedActivity?.type === "fishing" && (
        <div style={{ position: "absolute", bottom: 24, left: "50%", transform: "translateX(-50%)", background: "rgba(26,15,8,0.85)", color: "#f0d9a8", padding: "6px 14px", borderRadius: 6, fontSize: 14 }}>
          Fishing... <span style={{ opacity: 0.6 }}>[Space] hook/land · [Esc] cancel</span>
        </div>
      )}
    </div>
  );
}
