import {
  resolveWalkingAppearance,
  type LegacyAgeGroup,
  type LegacyGender,
  type LegacyHairStyle,
  type LegacyLibraryId,
  type LegacyLayer,
  type LegacyLifeStage,
} from "@/lib/legacy-character-engine";
import type { CSSProperties } from "react";

export type LegacySpriteFacing = "down" | "left" | "right" | "up";
export type LegacySpriteMotion = "idle" | "walk";

interface LegacyCharacterSpriteProps {
  ageGroup: LegacyAgeGroup;
  gender: LegacyGender;
  characterId?: string;
  lifeStage?: LegacyLifeStage;
  era?: string;
  appearanceSeed?: string | number;
  libraryId?: LegacyLibraryId;
  hairStyle?: LegacyHairStyle;
  layers?: Partial<Record<LegacyLayer, string>>;
  size?: number;
  className?: string;
  facing?: LegacySpriteFacing;
  motion?: LegacySpriteMotion;
}

/**
 * Displays one 48×48 frame from a 144×192 TV spritesheet.
 * The source is a stylized gameplay rendering and is never presented as a
 * real family photograph or an AI-generated likeness.
 */
export function LegacyCharacterSprite({
  ageGroup,
  gender,
  characterId,
  lifeStage,
  era,
  appearanceSeed,
  libraryId,
  hairStyle,
  layers,
  size = 56,
  className = "",
  facing = "right",
  motion = "idle",
}: LegacyCharacterSpriteProps) {
  const appearance = resolveWalkingAppearance({
    ageGroup,
    gender,
    characterId,
    lifeStage,
    era,
    appearanceSeed,
    libraryId,
    hairStyle,
    layers,
  });
  if (!appearance) return null;

  const scale = size / 48;
  const rowByFacing: Record<LegacySpriteFacing, number> = {
    down: 0,
    left: 1,
    right: 2,
    up: 3,
  };
  const frameY = -48 * scale * rowByFacing[facing];
  const spriteStyle = {
    "--legacy-sprite-frame-start": "0px",
    "--legacy-sprite-frame-end": `${-144 * scale}px`,
    backgroundPosition: `${-48 * scale}px ${frameY}px`,
    backgroundSize: `${appearance.layers[0]?.width * scale}px ${appearance.layers[0]?.height * scale}px`,
  } as CSSProperties;
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
          className={`absolute inset-0 ${motion === "walk" ? "legacy-sprite-walk" : ""}`}
          style={{
            backgroundImage: `url(${layer.file})`,
            ...spriteStyle,
            backgroundSize: `${layer.width * scale}px ${layer.height * scale}px`,
            imageRendering: "pixelated",
          }}
        />
      ))}
    </span>
  );
}