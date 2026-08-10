import { resolveWalkingAsset, type LegacyAgeGroup, type LegacyGender } from "@/lib/legacy-character-engine";

interface LegacyCharacterSpriteProps {
  ageGroup: LegacyAgeGroup;
  gender: LegacyGender;
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
  size = 56,
  className = "",
}: LegacyCharacterSpriteProps) {
  const asset = resolveWalkingAsset({ ageGroup, gender });
  if (!asset) return null;

  const scale = size / 48;
  return (
    <span
      aria-hidden="true"
      className={`block shrink-0 overflow-hidden rounded-2xl border border-amber-700/30 bg-amber-950/40 ${className}`}
      style={{
        width: size,
        height: size,
        backgroundImage: `url(${asset.file})`,
        backgroundPosition: `${-48 * scale}px ${-96 * scale}px`,
        backgroundSize: `${asset.width * scale}px ${asset.height * scale}px`,
        imageRendering: "pixelated",
      }}
    />
  );
}