/**
 * Mountable React component: <LegacyGameCanvas scene={...} /> replaces the
 * DOM/CSS-grid rendering path in legacy-chapter.tsx with a real PixiJS
 * game loop, per RUNTIME_ARCHITECTURE_UPDATE.md rollout step 2-3.
 *
 * Usage (inside legacy-chapter.tsx):
 *   <LegacyGameCanvas scene={capeCoastCompoundScene} characterId="kwame-mensah" />
 */

import { useEffect, useRef } from "react";
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

  useEffect(() => {
    let destroyed = false;
    const app = new Application();
    const pressedKeys = new Set<string>();
    let running = false;

    const onKeyDown = (e: KeyboardEvent) => {
      pressedKeys.add(e.key);
      if (e.key === "Shift") pressedKeys.add("running");
      if (e.key === " ") tryInteract();
      if (e.key === "j") combat.lightAttack(currentCombatTargets);
      if (e.key === "k") combat.heavyAttack(currentCombatTargets);
      if (e.key === "l") actorForJump();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      pressedKeys.delete(e.key);
      if (e.key === "Shift") pressedKeys.delete("running");
    };

    const player = new LegacyActorController({ x: 5, y: 5, facing: "down" });
    const combat = new LegacyCombatController(player);
    const currentCombatTargets: LegacyCombatTarget[] = []; // wire up from scene.npcSpawns + world-evolution NPC state

    function actorForJump() {
      combat.jump();
    }

    function tryInteract() {
      const target = scene.interactionPoints.find(
        (p) => Math.hypot(p.x - player.state.x, p.y - player.state.y) <= 1.2
      );
      if (target) {
        // Host page wires this to dialogue/vault/quest systems -- kept as a
        // plain console signal here since that wiring is app-specific.
        console.info("[legacy-game-canvas] interaction triggered:", target);
      }
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

        let dx = 0, dy = 0;
        for (const [key, vec] of Object.entries(KEY_TO_VECTOR)) {
          if (pressedKeys.has(key)) { dx += vec.dx; dy += vec.dy; }
        }
        const len = Math.hypot(dx, dy) || 1;
        player.tick(deltaMs, { dx: dx / len, dy: dy / len, running: pressedKeys.has("running") }, collisionQuery);
        combat.tick(deltaMs);

        const animState = combat.airborne ? (player.state.anim === "idle" ? "fall" : player.state.anim) : player.state.anim;
        playerSprite.sync(player, animState as any, player.state.facing);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- scene/manifests are treated as load-once per mount; swap key to force remount on scene change
  }, []);

  return <div ref={hostRef} style={{ width: "100%", height: "100%", position: "relative" }} />;
}
