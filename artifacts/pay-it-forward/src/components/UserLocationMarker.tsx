import { ErrorBoundary } from "@/components/ErrorBoundary";
import { useIsAnimationSuppressed } from "@/hooks/useAnimationPreference";
import { LocationPuck } from "@/components/LocationPuck";
import { SpiritAnimalAvatar } from "@/components/SpiritAnimal/SpiritAnimalAvatar";
import type { SpiritAnimalId, SpiritCompanionProps } from "@/components/SpiritAnimal/types";
import type { LocationMarkerState } from "@/lib/location-marker";
import { resolveLocationMarkerStyle } from "@/lib/location-marker";

export interface UserLocationMarkerProps extends SpiritCompanionProps {
  /** Saved preference. Unknown or missing values intentionally resolve to puck. */
  markerStyle?: unknown;
  species?: SpiritAnimalId;
  locationState?: LocationMarkerState;
}

/**
 * Shared renderer for the user's own map position.
 *
 * The puck is the canonical default and the failure boundary also renders a
 * puck, so an unavailable companion can never take down a map or navigation
 * screen. Privacy-fuzzed coordinates are passed through unchanged; this
 * visual marker does not imply GPS precision.
 */
export function UserLocationMarker({
  markerStyle,
  species,
  batterySaver,
  size = 34,
  locationState,
  ...spiritProps
}: UserLocationMarkerProps) {
  const animationSuppressed = useIsAnimationSuppressed();
  const resolvedStyle = resolveLocationMarkerStyle(markerStyle, {
    animationSuppressed,
    batterySaver,
  });

  if (resolvedStyle === "puck") {
    return (
      <LocationPuck
        heading={spiritProps.heading}
        mapBearing={spiritProps.mapBearing ?? 0}
        size={size}
        locationState={locationState}
      />
    );
  }

  return (
    <ErrorBoundary
      fallback={
        <LocationPuck
          heading={spiritProps.heading}
          mapBearing={spiritProps.mapBearing ?? 0}
          size={size}
          locationState={locationState}
        />
      }
    >
      <SpiritAnimalAvatar
        species={species}
        batterySaver={batterySaver}
        size={size}
        {...spiritProps}
      />
    </ErrorBoundary>
  );
}