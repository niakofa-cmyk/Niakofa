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
  /** Opt in to a directional puck cone, used by active navigation only. */
  showHeading?: boolean;
  species?: SpiritAnimalId;
  locationState?: LocationMarkerState;
  latitude?: number | null;
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
  showHeading = false,
  species,
  batterySaver,
  size = 34,
  locationState,
  latitude,
  mapZoom,
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
        showHeading={showHeading}
        size={size}
        locationState={locationState}
        latitude={latitude}
        mapZoom={mapZoom}
      />
    );
  }

  return (
    <ErrorBoundary
      fallback={
        <LocationPuck
          heading={spiritProps.heading}
          mapBearing={spiritProps.mapBearing ?? 0}
          showHeading={showHeading}
          size={size}
          locationState={locationState}
          latitude={latitude}
          mapZoom={mapZoom}
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