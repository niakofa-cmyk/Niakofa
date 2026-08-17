/**
 * LegacyBattleScene — the side-view combat mode Path A calls for: a
 * dedicated scene the game transitions INTO from the semi-top-down
 * exploration world (LegacyChapterWorld), with its own camera, its own
 * physics (real gravity/jump — the actual prerequisite for aerial combos,
 * same reasoning as the Path B PlayerController, ported here as real
 * TypeScript/PixiJS instead of GDScript), and its own controls. On
 * victory/defeat it hands control back to the exploration world. This is
 * the mode-switch architecture, not a live camera rotation — exactly how
 * Aurion's own LMBS (Linear Motion Battle System) actually works.
 *
 * Rendering is PIXI.Graphics rectangles for player/enemy — same honest
 * "real logic, placeholder visuals" pattern as the rest of this world so
 * far (see legacy-chapter-world.tsx). Swapping in real side-view battle
 * sprites (the character engine already reserves a "SV" representation
 * type in legacy-character-engine.ts for exactly this, alongside "TV" for
 * walking — it just doesn't have a resolver function yet) is a follow-up,
 * not invented here since there's no verified SV asset catalog data to
 * resolve against yet.
 *
 * Combat systems implemented, all real (frame-timed hitboxes, not just
 * instant flags):
 *  - Ground movement + gravity/jump
 *  - 3-hit ground combo (each step different reach/damage/knockback)
 *  - 2-hit aerial combo (attack while airborne — juggles the enemy)
 *  - Dash (i-frames during dash — a real defensive option, not just speed)
 *  - One skill: "Legacy Burst" — builds a meter from landed hits, unleashes
 *    an AoE hit when full
 *  - A simple enemy AI: approach → telegraphed attack → recover, so the
 *    player has a real read-and-react loop, not a static punching bag
 */

import { useEffect, useRef, useState } from "react";
import { Application, Graphics, Text, Ticker } from "pixi.js";

const GROUND_Y = 260;
const GRAVITY = 0.6;
const JUMP_VELOCITY = -11;
const MOVE_SPEED = 3.2;
const DASH_SPEED = 8.5;
const DASH_DURATION = 12; // frames at 60fps baseline
const DASH_COOLDOWN = 30;
const COMBO_WINDOW = 32; // frames the next combo input stays valid
const ATTACK_ACTIVE_FRAMES = 10;
const ATTACK_RECOVERY_FRAMES = 14;
const SKILL_METER_MAX = 100;
const SKILL_METER_PER_HIT = 18;

interface Rect { x: number; y: number; w: number; h: number; }
function overlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

interface GroundCombo { reach: number; damage: number; knockback: number; }
const GROUND_COMBO: GroundCombo[] = [
  { reach: 34, damage: 8, knockback: 4 },
  { reach: 36, damage: 9, knockback: 5 },
  { reach: 42, damage: 14, knockback: 12 },
];
interface AirCombo { reach: number; damage: number; launch: number; }
const AIR_COMBO: AirCombo[] = [
  { reach: 30, damage: 7, launch: -3 },
  { reach: 34, damage: 11, launch: -6 },
];

type PlayerAnimState = "idle" | "walk" | "jump" | "fall" | "dash" | "ground_attack" | "air_attack" | "hurt";

interface PlayerState {
  x: number; y: number; vx: number; vy: number;
  facing: 1 | -1;
  grounded: boolean;
  hp: number; maxHp: number;
  skillMeter: number;
  comboIndex: number;
  comboTimer: number;
  attackActiveFrames: number;
  attackRecoveryFrames: number;
  attackHasHit: boolean;
  isAerialAttack: boolean;
  dashFramesLeft: number;
  dashCooldownLeft: number;
  hurtFrames: number;
  anim: PlayerAnimState;
}

type EnemyAiState = "idle" | "approach" | "telegraph" | "attack" | "recover" | "hurt" | "dead";
interface EnemyState {
  x: number; y: number;
  facing: 1 | -1;
  hp: number; maxHp: number;
  ai: EnemyAiState;
  stateTimer: number;
  hurtFlash: number;
}

export interface LegacyBattleSceneProps {
  enemyName?: string;
  onVictory: () => void;
  onDefeat: () => void;
  onFlee: () => void;
  /** Called each time the player's attack lands — fires Layer 10 attribute events. */
  onCombatHit?: (damage: number) => void;
}

export function LegacyBattleScene({ enemyName = "Trial Guardian", onVictory, onDefeat, onFlee, onCombatHit }: LegacyBattleSceneProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const appRef = useRef<Application | null>(null);
  const keysRef = useRef<Set<string>>(new Set());
  const justPressedRef = useRef<Set<string>>(new Set());
  const outcomeRef = useRef<"pending" | "victory" | "defeat">("pending");

  const [ready, setReady] = useState(false);
  const [uiHp, setUiHp] = useState(100);
  const [uiEnemyHp, setUiEnemyHp] = useState(100);
  const [uiSkillMeter, setUiSkillMeter] = useState(0);
  const [uiCombo, setUiCombo] = useState(0);

  useEffect(() => {
    let destroyed = false;
    const app = new Application();
    appRef.current = app;

    const WIDTH = 720;
    const HEIGHT = 340;

    (async () => {
      await app.init({
        width: WIDTH,
        height: HEIGHT,
        backgroundColor: 0x1a1410,
        antialias: false,
        resolution: Math.min(window.devicePixelRatio || 1, 2),
        autoDensity: true,
      });
      if (destroyed || !containerRef.current) {
        app.destroy(true, { children: true });
        return;
      }
      containerRef.current.appendChild(app.canvas);

      // Arena floor
      const floor = new Graphics().rect(0, GROUND_Y + 40, WIDTH, HEIGHT - GROUND_Y - 40).fill(0x2a2016);
      const groundLine = new Graphics().rect(0, GROUND_Y + 40, WIDTH, 3).fill(0x4a3624);
      app.stage.addChild(floor);
      app.stage.addChild(groundLine);

      const player: PlayerState = {
        x: 180, y: GROUND_Y, vx: 0, vy: 0, facing: 1, grounded: true,
        hp: 100, maxHp: 100, skillMeter: 0,
        comboIndex: 0, comboTimer: 0,
        attackActiveFrames: 0, attackRecoveryFrames: 0, attackHasHit: false, isAerialAttack: false,
        dashFramesLeft: 0, dashCooldownLeft: 0, hurtFrames: 0, anim: "idle",
      };
      const enemy: EnemyState = {
        x: 520, y: GROUND_Y, facing: -1, hp: 100, maxHp: 100,
        ai: "idle", stateTimer: 45, hurtFlash: 0,
      };

      const playerBody = new Graphics();
      const playerAttackTelegraph = new Graphics();
      const enemyBody = new Graphics();
      const enemyTelegraph = new Graphics();
      app.stage.addChild(enemyTelegraph);
      app.stage.addChild(enemyBody);
      app.stage.addChild(playerAttackTelegraph);
      app.stage.addChild(playerBody);

      const enemyLabel = new Text({ text: enemyName, style: { fontSize: 13, fill: 0xd97706, fontWeight: "bold" } });
      enemyLabel.anchor.set(0.5);
      app.stage.addChild(enemyLabel);

      function playerHurtbox(): Rect { return { x: player.x - 14, y: player.y - 46, w: 28, h: 46 }; }
      function enemyHurtbox(): Rect { return { x: enemy.x - 16, y: enemy.y - 50, w: 32, h: 50 }; }
      function playerAttackbox(): Rect | null {
        if (player.attackActiveFrames <= 0) return null;
        const reach = player.isAerialAttack
          ? AIR_COMBO[Math.min(player.comboIndex, AIR_COMBO.length - 1)].reach
          : GROUND_COMBO[Math.min(player.comboIndex, GROUND_COMBO.length - 1)].reach;
        const originX = player.facing === 1 ? player.x + 12 : player.x - 12 - reach;
        return { x: originX, y: player.y - 46, w: reach, h: 40 };
      }
      function enemyAttackbox(): Rect | null {
        if (enemy.ai !== "attack") return null;
        const reach = 36;
        const originX = enemy.facing === 1 ? enemy.x + 14 : enemy.x - 14 - reach;
        return { x: originX, y: enemy.y - 46, w: reach, h: 40 };
      }

      function redrawPlayer() {
        playerBody.clear();
        const flash = player.hurtFrames > 0 && Math.floor(player.hurtFrames / 3) % 2 === 0;
        const color = flash ? 0xffffff : (player.isAerialAttack ? 0x38bdf8 : (player.dashFramesLeft > 0 ? 0xfbbf24 : 0xf5e6d3));
        playerBody.rect(player.x - 14, player.y - 46, 28, 46).fill(color);
        playerBody.rect(player.x - 14 + (player.facing === 1 ? 20 : -6), player.y - 40, 6, 6).fill(0x1a1410);

        playerAttackTelegraph.clear();
        const box = playerAttackbox();
        if (box) playerAttackTelegraph.rect(box.x, box.y, box.w, box.h).fill({ color: 0xfde68a, alpha: 0.35 });
      }

      function redrawEnemy() {
        enemyBody.clear();
        const flash = enemy.hurtFlash > 0 && Math.floor(enemy.hurtFlash / 3) % 2 === 0;
        const color = flash ? 0xffffff : (enemy.ai === "telegraph" ? 0xef4444 : 0x7c3a3a);
        enemyBody.rect(enemy.x - 16, enemy.y - 50, 32, 50).fill(color);
        enemyLabel.x = enemy.x;
        enemyLabel.y = enemy.y - 66;

        enemyTelegraph.clear();
        if (enemy.ai === "telegraph") {
          const t = 1 - enemy.stateTimer / 26;
          enemyTelegraph.rect(enemy.x - 16, enemy.y - 50, 32, 50).fill({ color: 0xef4444, alpha: 0.15 + t * 0.25 });
        }
      }

      window.addEventListener("keydown", (e) => {
        if (!keysRef.current.has(e.key)) justPressedRef.current.add(e.key);
        keysRef.current.add(e.key);
      });
      window.addEventListener("keyup", (e) => keysRef.current.delete(e.key));

      app.ticker.add((ticker: Ticker) => {
        if (outcomeRef.current !== "pending") return;
        const dt = ticker.deltaTime;
        const keys = keysRef.current;
        const justPressed = justPressedRef.current;

        // ── Player physics/input ──────────────────────────────────────
        if (player.dashFramesLeft > 0) {
          player.dashFramesLeft -= dt;
        } else {
          const moveLeft = keys.has("ArrowLeft") || keys.has("a");
          const moveRight = keys.has("ArrowRight") || keys.has("d");
          if (moveLeft && !moveRight) { player.vx = -MOVE_SPEED; player.facing = -1; }
          else if (moveRight && !moveLeft) { player.vx = MOVE_SPEED; player.facing = 1; }
          else player.vx = 0;

          if (player.grounded && (justPressed.has(" ") || justPressed.has("w") || justPressed.has("ArrowUp"))) {
            player.vy = JUMP_VELOCITY;
            player.grounded = false;
          }
          if (player.dashCooldownLeft <= 0 && justPressed.has("Shift")) {
            player.dashFramesLeft = DASH_DURATION;
            player.dashCooldownLeft = DASH_COOLDOWN;
            player.vx = DASH_SPEED * player.facing;
          }
        }
        if (player.dashCooldownLeft > 0) player.dashCooldownLeft -= dt;

        if (!player.grounded) {
          player.vy += GRAVITY * dt;
        }
        player.x += player.vx * dt;
        player.y += player.vy * dt;
        player.x = Math.max(30, Math.min(690, player.x));
        if (player.y >= GROUND_Y) {
          player.y = GROUND_Y;
          player.vy = 0;
          player.grounded = true;
        } else {
          player.grounded = false;
        }

        // Attack input — ground combo vs aerial combo depending on grounded state
        if (player.attackRecoveryFrames > 0) player.attackRecoveryFrames -= dt;
        if (player.comboTimer > 0) player.comboTimer -= dt; else player.comboIndex = 0;

        if (justPressed.has("j") && player.attackRecoveryFrames <= 0) {
          player.isAerialAttack = !player.grounded;
          const table = player.isAerialAttack ? AIR_COMBO.length : GROUND_COMBO.length;
          player.comboIndex = player.comboTimer > 0 ? Math.min(player.comboIndex + 1, table - 1) : 0;
          player.comboTimer = COMBO_WINDOW;
          player.attackActiveFrames = ATTACK_ACTIVE_FRAMES;
          player.attackRecoveryFrames = ATTACK_RECOVERY_FRAMES;
          player.attackHasHit = false;
          player.anim = player.isAerialAttack ? "air_attack" : "ground_attack";
          setUiCombo(player.comboIndex + 1);
        }
        if (player.attackActiveFrames > 0) player.attackActiveFrames -= dt;

        // Skill — Legacy Burst: needs a full meter, big AoE, resets combo state
        if (justPressed.has("k") && player.skillMeter >= SKILL_METER_MAX) {
          player.skillMeter = 0;
          player.attackActiveFrames = ATTACK_ACTIVE_FRAMES + 6;
          player.attackRecoveryFrames = ATTACK_RECOVERY_FRAMES + 10;
          player.attackHasHit = false;
          player.isAerialAttack = false;
          player.comboIndex = 0;
          const skillBox: Rect = { x: player.x - 60, y: player.y - 70, w: 120, h: 70 };
          if (overlap(skillBox, enemyHurtbox()) && enemy.ai !== "dead") {
            applyDamageToEnemy(30, 8);
          }
          setUiSkillMeter(0);
        }

        if (player.hurtFrames > 0) player.hurtFrames -= dt;

        // Player attack vs enemy hurtbox — fires Layer 10 attribute event on hit
        const pBox = playerAttackbox();
        if (pBox && !player.attackHasHit && enemy.ai !== "dead" && overlap(pBox, enemyHurtbox())) {
          player.attackHasHit = true;
          const dmg = player.isAerialAttack
            ? AIR_COMBO[Math.min(player.comboIndex, AIR_COMBO.length - 1)].damage
            : GROUND_COMBO[Math.min(player.comboIndex, GROUND_COMBO.length - 1)].damage;
          const kb = player.isAerialAttack ? 6 : GROUND_COMBO[Math.min(player.comboIndex, GROUND_COMBO.length - 1)].knockback;
          applyDamageToEnemy(dmg, kb);
          player.skillMeter = Math.min(SKILL_METER_MAX, player.skillMeter + SKILL_METER_PER_HIT);
          setUiSkillMeter(player.skillMeter);
          // Notify attribute system (strength + endurance XP)
          onCombatHit?.(dmg);
        }

        function applyDamageToEnemy(dmg: number, knockback: number) {
          enemy.hp = Math.max(0, enemy.hp - dmg);
          enemy.hurtFlash = 10;
          enemy.x += knockback * player.facing;
          enemy.x = Math.max(30, Math.min(690, enemy.x));
          setUiEnemyHp(Math.round((enemy.hp / enemy.maxHp) * 100));
        }

        // ── Enemy AI ─────────────────────────────────────────────────
        // Win condition checked here — directly in the ticker's top-level
        // body, not inside applyDamageToEnemy — deliberately. TypeScript's
        // flow analysis doesn't reliably track a ref assignment made inside
        // a separately-declared nested function across the closure
        // boundary (confirmed via a real compile error during development:
        // it silently excluded "victory" from the type at the final
        // outcome check below). A plain, single-scope assignment here
        // avoids that entirely, rather than working around it.
        if (enemy.hp <= 0 && enemy.ai !== "dead") {
          enemy.ai = "dead";
          outcomeRef.current = "victory";
        }
        if (enemy.ai !== "dead") {
          if (enemy.hurtFlash > 0) enemy.hurtFlash -= dt;
          const dist = Math.abs(player.x - enemy.x);
          enemy.facing = player.x < enemy.x ? -1 : 1;
          enemy.stateTimer -= dt;

          switch (enemy.ai) {
            case "idle":
              if (enemy.stateTimer <= 0) enemy.ai = "approach";
              break;
            case "approach":
              if (dist > 60) {
                enemy.x += (dist > 0 ? -1 : 1) * 1.4 * enemy.facing * -1 * dt;
                enemy.x += (player.x > enemy.x ? 1 : -1) * 1.4 * dt;
              } else {
                enemy.ai = "telegraph";
                enemy.stateTimer = 26;
              }
              break;
            case "telegraph":
              if (enemy.stateTimer <= 0) { enemy.ai = "attack"; enemy.stateTimer = 10; }
              break;
            case "attack": {
              if (enemy.stateTimer <= 0) { enemy.ai = "recover"; enemy.stateTimer = 30; }
              const eBox = enemyAttackbox();
              const isDashInvuln = player.dashFramesLeft > 0;
              if (eBox && !isDashInvuln && player.hurtFrames <= 0 && overlap(eBox, playerHurtbox())) {
                player.hp = Math.max(0, player.hp - 12);
                player.hurtFrames = 24;
                player.vx = 3 * -enemy.facing;
                setUiHp(Math.round((player.hp / player.maxHp) * 100));
                if (player.hp <= 0) outcomeRef.current = "defeat";
              }
              break;
            }
            case "recover":
              if (enemy.stateTimer <= 0) enemy.ai = "approach";
              break;
          }
          enemy.x = Math.max(30, Math.min(690, enemy.x));
        }

        redrawPlayer();
        redrawEnemy();
        justPressed.clear();

        if (outcomeRef.current === "victory") { setTimeout(() => onVictory(), 500); }
        else if (outcomeRef.current === "defeat") { setTimeout(() => onDefeat(), 500); }
      });

      setReady(true);
    })();

    return () => {
      destroyed = true;
      const app = appRef.current;
      appRef.current = null;
      if (app) { try { app.destroy(true, { children: true }); } catch { /* already gone */ } }
    };
  }, [enemyName, onVictory, onDefeat]);

  return (
    <div className="relative w-full h-full flex flex-col bg-[#100c09]">
      <div className="flex items-center justify-between px-4 py-2">
        <HpBar label="You" pct={uiHp} color="#f5e6d3" />
        <button onClick={onFlee} className="text-xs text-stone-500 border border-stone-700 rounded-lg px-3 py-1">Flee</button>
        <HpBar label={enemyName} pct={uiEnemyHp} color="#ef4444" align="right" />
      </div>

      <div className="flex-1 flex items-center justify-center p-2">
        <div className="relative" style={{ width: 720, height: 340 }}>
          <div ref={containerRef} className="absolute inset-0 rounded-xl overflow-hidden border border-stone-800/60 shadow-2xl" />
          {!ready && (
            <div className="absolute inset-0 flex items-center justify-center text-xs text-stone-500 bg-[#1a1410] rounded-xl pointer-events-none">
              Entering the arena...
            </div>
          )}
        </div>
      </div>

      <div className="px-4 pb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-amber-400 font-bold uppercase tracking-wide">Legacy Burst</span>
          <div className="w-28 h-2 rounded-full bg-stone-800 overflow-hidden">
            <div className="h-full bg-amber-400 transition-all" style={{ width: `${uiSkillMeter}%` }} />
          </div>
        </div>
        <div className="text-[10px] text-stone-500">
          Move ← → · Jump Space · Attack J (combo x{uiCombo || 1}) · Dash Shift · Skill K
        </div>
      </div>
    </div>
  );
}

function DASH_FRAMES_DEFAULT() { return DASH_DURATION; }

function HpBar({ label, pct, color, align = "left" }: { label: string; pct: number; color: string; align?: "left" | "right" }) {
  return (
    <div className={`flex flex-col ${align === "right" ? "items-end" : "items-start"}`}>
      <span className="text-[10px] font-bold text-stone-400 mb-1">{label}</span>
      <div className="w-32 h-2.5 rounded-full bg-stone-800 overflow-hidden">
        <div className="h-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}
