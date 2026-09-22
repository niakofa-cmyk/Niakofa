/**
 * SpiritAnimal/SpiritController.ts
 *
 * The SpiritAnimalController maps real-time app inputs (speed, navigating,
 * celebrating, etc.) to species-specific behavioral states via the
 * ISpiritController interface defined in types.ts.
 *
 * The app code never changes — only behavior changes.
 *   speed → Bird: flap faster    | Panther: longer stride → crouch → sprint
 *   navigating → Bird: soar      | Elephant: purposeful walk | Lion: patrol
 *
 * Each animal's controller is a pure function: SpiritCompanionProps → SpiritBehaviorState.
 * The renderer (SVG component) reads the returned state and applies CSS data-attrs.
 */

import type {
  SpiritCompanionProps,
  SpiritBehaviorState,
  ISpiritController,
  SpiritAnimalId,
} from "./types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function base(overrides: Partial<SpiritBehaviorState> = {}): SpiritBehaviorState {
  return {
    gait:        "idle",
    intensity:   0,
    celebrating: false,
    alerting:    false,
    interacting: false,
    resting:     false,
    dataAttrs:   {},
    ...overrides,
  };
}

function speedIntensity(speed: number | null | undefined): number {
  const s = speed ?? 0;
  return Math.min(1, s / 12); // normalise: 0 m/s → 0, 12+ m/s → 1
}

// ─── Bird Controller ──────────────────────────────────────────────────────────

class BirdController implements ISpiritController {
  observe(p: SpiritCompanionProps): SpiritBehaviorState {
    return base({
      gait:      "glide",
      intensity: speedIntensity(p.speed) * 0.3,
      dataAttrs: { "data-bird-phase": "observe" },
    });
  }
  idle(p: SpiritCompanionProps): SpiritBehaviorState {
    return base({
      gait:      "idle",
      intensity: 0,
      resting:   p.batterySaver ?? false,
      dataAttrs: { "data-bird-phase": "idle" },
    });
  }
  travel(p: SpiritCompanionProps): SpiritBehaviorState {
    const spd = speedIntensity(p.speed);
    return base({
      gait:      spd > 0.7 ? "soar" : spd > 0.3 ? "fly" : "glide",
      intensity: spd,
      dataAttrs: {
        "data-bird-phase": "travel",
        "data-speed-tier": spd > 0.7 ? "fast" : spd > 0.3 ? "mid" : "slow",
      },
    });
  }
  navigate(p: SpiritCompanionProps): SpiritBehaviorState {
    return base({
      gait:      "soar",
      intensity: Math.max(0.4, speedIntensity(p.speed)),
      dataAttrs: {
        "data-bird-phase": "navigate",
        "data-turn":       p.upcomingTurnDirection ?? "none",
      },
    });
  }
  celebrate(_p: SpiritCompanionProps): SpiritBehaviorState {
    return base({
      gait:        "fly",
      intensity:   0.9,
      celebrating: true,
      dataAttrs:   { "data-bird-phase": "celebrate" },
    });
  }
  alert(_p: SpiritCompanionProps): SpiritBehaviorState {
    return base({
      gait:      "fly",
      intensity: 0.7,
      alerting:  true,
      dataAttrs: { "data-bird-phase": "alert" },
    });
  }
  interact(_p: SpiritCompanionProps): SpiritBehaviorState {
    return base({
      gait:        "glide",
      intensity:   0.5,
      interacting: true,
      dataAttrs:   { "data-bird-phase": "interact" },
    });
  }
  rest(_p: SpiritCompanionProps): SpiritBehaviorState {
    return base({ gait: "idle", intensity: 0, resting: true, dataAttrs: { "data-bird-phase": "rest" } });
  }
  guide(p: SpiritCompanionProps): SpiritBehaviorState {
    return base({
      gait:      "soar",
      intensity: 0.85,
      dataAttrs: { "data-bird-phase": "guide", "data-turn": p.upcomingTurnDirection ?? "none" },
    });
  }
}

// ─── Panther Controller ────────────────────────────────────────────────────────

class PantherController implements ISpiritController {
  observe(_p: SpiritCompanionProps): SpiritBehaviorState {
    return base({ gait: "idle", intensity: 0.2, dataAttrs: { "data-panther-phase": "observe", "data-panther-crouch": "true" } });
  }
  idle(p: SpiritCompanionProps): SpiritBehaviorState {
    return base({ gait: "idle", intensity: 0, resting: p.batterySaver ?? false, dataAttrs: { "data-panther-phase": "idle" } });
  }
  travel(p: SpiritCompanionProps): SpiritBehaviorState {
    const spd = speedIntensity(p.speed);
    const gait = spd > 0.75 ? "sprint" : spd > 0.35 ? "trot" : "walk";
    return base({
      gait:      gait as SpiritBehaviorState["gait"],
      intensity: spd,
      dataAttrs: {
        "data-panther-phase": "travel",
        "data-panther-gait":  gait,
        "data-panther-crouch": spd < 0.25 ? "true" : "false",
      },
    });
  }
  navigate(p: SpiritCompanionProps): SpiritBehaviorState {
    const spd = speedIntensity(p.speed);
    return base({
      gait:      spd > 0.5 ? "sprint" : "walk",
      intensity: Math.max(0.4, spd),
      dataAttrs: {
        "data-panther-phase": "navigate",
        "data-panther-gait":  spd > 0.5 ? "sprint" : "stalk",
        "data-turn":          p.upcomingTurnDirection ?? "none",
      },
    });
  }
  celebrate(_p: SpiritCompanionProps): SpiritBehaviorState {
    return base({ gait: "trot", intensity: 1, celebrating: true, dataAttrs: { "data-panther-phase": "celebrate", "data-panther-pounce": "true" } });
  }
  alert(_p: SpiritCompanionProps): SpiritBehaviorState {
    return base({ gait: "idle", intensity: 0.8, alerting: true, dataAttrs: { "data-panther-phase": "alert", "data-panther-ears": "rotate" } });
  }
  interact(_p: SpiritCompanionProps): SpiritBehaviorState {
    return base({ gait: "idle", intensity: 0.4, interacting: true, dataAttrs: { "data-panther-phase": "interact", "data-panther-tail": "flick" } });
  }
  rest(_p: SpiritCompanionProps): SpiritBehaviorState {
    return base({ gait: "idle", intensity: 0, resting: true, dataAttrs: { "data-panther-phase": "rest", "data-panther-crouch": "true" } });
  }
  guide(p: SpiritCompanionProps): SpiritBehaviorState {
    const spd = speedIntensity(p.speed);
    return base({ gait: spd > 0.4 ? "sprint" : "walk", intensity: 0.8, dataAttrs: { "data-panther-phase": "guide" } });
  }
}

// ─── Elephant Controller ───────────────────────────────────────────────────────

class ElephantController implements ISpiritController {
  observe(_p: SpiritCompanionProps): SpiritBehaviorState {
    return base({ gait: "idle", intensity: 0.1, dataAttrs: { "data-elephant-phase": "observe" } });
  }
  idle(_p: SpiritCompanionProps): SpiritBehaviorState {
    return base({ gait: "idle", intensity: 0, dataAttrs: { "data-elephant-phase": "idle" } });
  }
  travel(p: SpiritCompanionProps): SpiritBehaviorState {
    const spd = speedIntensity(p.speed);
    return base({
      gait:      spd > 0.55 ? "trot" : "walk",
      intensity: spd * 0.7,
      dataAttrs: {
        "data-elephant-phase": "travel",
        "data-elephant-stride": spd > 0.5 ? "long" : "normal",
      },
    });
  }
  navigate(p: SpiritCompanionProps): SpiritBehaviorState {
    return base({ gait: "walk", intensity: 0.5, dataAttrs: { "data-elephant-phase": "navigate", "data-turn": p.upcomingTurnDirection ?? "none" } });
  }
  celebrate(_p: SpiritCompanionProps): SpiritBehaviorState {
    return base({ gait: "idle", intensity: 1, celebrating: true, dataAttrs: { "data-elephant-phase": "celebrate", "data-elephant-trumpet": "true" } });
  }
  alert(_p: SpiritCompanionProps): SpiritBehaviorState {
    return base({ gait: "idle", intensity: 0.7, alerting: true, dataAttrs: { "data-elephant-phase": "alert", "data-elephant-ears": "flare" } });
  }
  interact(_p: SpiritCompanionProps): SpiritBehaviorState {
    return base({ gait: "idle", intensity: 0.3, interacting: true, dataAttrs: { "data-elephant-phase": "interact" } });
  }
  rest(_p: SpiritCompanionProps): SpiritBehaviorState {
    return base({ gait: "idle", intensity: 0, resting: true, dataAttrs: { "data-elephant-phase": "rest" } });
  }
  guide(p: SpiritCompanionProps): SpiritBehaviorState {
    return base({ gait: "walk", intensity: 0.6, dataAttrs: { "data-elephant-phase": "guide", "data-turn": p.upcomingTurnDirection ?? "none" } });
  }
}

// ─── Lion Controller ──────────────────────────────────────────────────────────

class LionController implements ISpiritController {
  observe(_p: SpiritCompanionProps): SpiritBehaviorState {
    return base({ gait: "idle", intensity: 0.2, dataAttrs: { "data-lion-phase": "observe", "data-lion-survey": "true" } });
  }
  idle(_p: SpiritCompanionProps): SpiritBehaviorState {
    return base({ gait: "idle", intensity: 0, dataAttrs: { "data-lion-phase": "idle" } });
  }
  travel(p: SpiritCompanionProps): SpiritBehaviorState {
    const spd = speedIntensity(p.speed);
    return base({
      gait:      spd > 0.65 ? "sprint" : spd > 0.3 ? "patrol" as SpiritBehaviorState["gait"] : "walk",
      intensity: spd,
      dataAttrs: { "data-lion-phase": "travel", "data-lion-gait": spd > 0.65 ? "sprint" : "patrol" },
    });
  }
  navigate(p: SpiritCompanionProps): SpiritBehaviorState {
    return base({ gait: "patrol" as SpiritBehaviorState["gait"], intensity: 0.6, dataAttrs: { "data-lion-phase": "navigate", "data-turn": p.upcomingTurnDirection ?? "none" } });
  }
  celebrate(_p: SpiritCompanionProps): SpiritBehaviorState {
    return base({ gait: "idle", intensity: 1, celebrating: true, dataAttrs: { "data-lion-phase": "celebrate", "data-lion-roar": "true" } });
  }
  alert(_p: SpiritCompanionProps): SpiritBehaviorState {
    return base({ gait: "idle", intensity: 0.9, alerting: true, dataAttrs: { "data-lion-phase": "alert", "data-lion-mane": "flare" } });
  }
  interact(_p: SpiritCompanionProps): SpiritBehaviorState {
    return base({ gait: "idle", intensity: 0.4, interacting: true, dataAttrs: { "data-lion-phase": "interact" } });
  }
  rest(_p: SpiritCompanionProps): SpiritBehaviorState {
    return base({ gait: "idle", intensity: 0, resting: true, dataAttrs: { "data-lion-phase": "rest" } });
  }
  guide(p: SpiritCompanionProps): SpiritBehaviorState {
    return base({ gait: "patrol" as SpiritBehaviorState["gait"], intensity: 0.7, dataAttrs: { "data-lion-phase": "guide", "data-turn": p.upcomingTurnDirection ?? "none" } });
  }
}

// ─── Fish Eagle Controller ─────────────────────────────────────────────────────

class FishEagleController implements ISpiritController {
  observe(_p: SpiritCompanionProps): SpiritBehaviorState {
    return base({ gait: "glide", intensity: 0.3, dataAttrs: { "data-eagle-phase": "observe", "data-eagle-circle": "true" } });
  }
  idle(_p: SpiritCompanionProps): SpiritBehaviorState {
    return base({ gait: "glide", intensity: 0.1, dataAttrs: { "data-eagle-phase": "idle" } });
  }
  travel(p: SpiritCompanionProps): SpiritBehaviorState {
    const spd = speedIntensity(p.speed);
    return base({
      gait:      spd > 0.6 ? "soar" : "glide",
      intensity: spd,
      dataAttrs: { "data-eagle-phase": "travel", "data-eagle-circle": spd > 0.5 ? "tight" : "wide" },
    });
  }
  navigate(p: SpiritCompanionProps): SpiritBehaviorState {
    return base({ gait: "soar", intensity: 0.7, dataAttrs: { "data-eagle-phase": "navigate", "data-turn": p.upcomingTurnDirection ?? "none" } });
  }
  celebrate(_p: SpiritCompanionProps): SpiritBehaviorState {
    return base({ gait: "fly", intensity: 1, celebrating: true, dataAttrs: { "data-eagle-phase": "celebrate", "data-eagle-dive": "true" } });
  }
  alert(_p: SpiritCompanionProps): SpiritBehaviorState {
    return base({ gait: "fly", intensity: 0.8, alerting: true, dataAttrs: { "data-eagle-phase": "alert", "data-eagle-hover": "true" } });
  }
  interact(_p: SpiritCompanionProps): SpiritBehaviorState {
    return base({ gait: "glide", intensity: 0.4, interacting: true, dataAttrs: { "data-eagle-phase": "interact" } });
  }
  rest(_p: SpiritCompanionProps): SpiritBehaviorState {
    return base({ gait: "idle", intensity: 0, resting: true, dataAttrs: { "data-eagle-phase": "rest" } });
  }
  guide(p: SpiritCompanionProps): SpiritBehaviorState {
    return base({ gait: "soar", intensity: 0.8, dataAttrs: { "data-eagle-phase": "guide", "data-turn": p.upcomingTurnDirection ?? "none" } });
  }
}

// ─── Registry ─────────────────────────────────────────────────────────────────

const CONTROLLERS: Record<SpiritAnimalId, ISpiritController> = {
  sankofa_bird:  new BirdController(),
  black_panther: new PantherController(),
  elephant:      new ElephantController(),
  lion:          new LionController(),
  fish_eagle:    new FishEagleController(),
};

export function getSpiritController(species: SpiritAnimalId): ISpiritController {
  return CONTROLLERS[species] ?? CONTROLLERS.sankofa_bird;
}

/** Compute the current behavioral state for any spirit animal.
 *  This is the entry point used by SpiritAnimalAvatar (and any component
 *  that needs to know what the animal is "doing" right now).
 */
export function computeSpiritBehavior(
  species: SpiritAnimalId,
  props: SpiritCompanionProps
): SpiritBehaviorState {
  const controller = getSpiritController(species);
  const {
    celebrating, newNotification, accepted, donated,
    navigating, isHelping, batterySaver, nearbyUser,
  } = props;

  // Priority order: rest > celebrate > alert > interact > guide > navigate > travel > observe > idle
  if (batterySaver)                       return controller.rest(props);
  if (celebrating || donated || accepted) return controller.celebrate(props);
  if (newNotification)                    return controller.alert(props);
  if (nearbyUser)                         return controller.interact(props);
  if (isHelping && navigating)            return controller.guide(props);
  if (navigating)                         return controller.navigate(props);
  if ((props.speed ?? 0) > 0.3)          return controller.travel(props);
  if (props.activityLevel && props.activityLevel > 0.1) return controller.observe(props);
  return controller.idle(props);
}
