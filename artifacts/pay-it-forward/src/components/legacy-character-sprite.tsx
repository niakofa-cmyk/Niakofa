import { resolveWalkingAppearance, type LegacyAgeGroup, type LegacyGender, type LegacyLayer } from "@/lib/legacy-character-engine";

interface LegacyCharacterSpriteProps {
  ageGroup: LegacyAgeGroup;
  gender: LegacyGender;
  layers?: Partial<Record<LegacyLayer, string>>;
  size?: number;
  className?: string;
}

/**
 * Displays one 48×48 frame from a 144×192 TV spritesheet.
 * The source is a stylized gameplay rendering and is never presented as a
 * real family photograph or an AI-generated likeness.
 */
export function LegacyCharacterSprite({
  ageGroup,
  gender,
  layers,
  size = 56,
  className = "",
}: LegacyCharacterSpriteProps) {
  const appearance = resolveWalkingAppearance({ ageGroup, gender, layers });
  if (!appearance) return null;

  const scale = size / 48;
  return (
    <span
      aria-hidden="true"
      className={`relative block shrink-0 overflow-hidden rounded-2xl border border-amber-700/30 bg-amber-950/40 ${className}`}
      style={{
        width: size,
        height: size,
        imageRendering: "pixelated",
      }}
    >
      {appearance.layers.map((layer) => (
        <span
          key={layer.assetId}
          aria-hidden="true"
          className="absolute inset-0"
          style={{
            backgroundImage: `url(${layer.file})`,
            backgroundPosition: `${-48 * scale}px ${-96 * scale}px`,
            backgroundSize: `${layer.width * scale}px ${layer.height * scale}px`,
            imageRendering: "pixelated",
          }}
        />
      ))}
    </span>
  );
}