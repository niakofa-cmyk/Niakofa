/**
 * BlackPanther/Core/Types.ts
 *
 * MVP prop surface for the Black Panther companion. Extends the shared
 * SpiritCompanionProps contract (see components/SpiritAnimal/types.ts) —
 * anything species-agnostic lives there so map.tsx etc. never need to
 * know which animal they're driving.
 *
 * Panther-only props go here, same way wairMode/soaring/matingDisplay live
 * on SankofaBirdProps instead of the shared contract. None are needed for
 * the MVP tier (walk/idle/celebrate/notify) — this is where `stalking`,
 * `sprinting`, `pouncing` etc. get added as the Panther's own phases land.
 */

import type { SpiritCompanionProps } from "@/components/SpiritAnimal/types";

export interface BlackPantherProps extends SpiritCompanionProps {}
