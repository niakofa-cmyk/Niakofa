/**
 * direction.ts
 * ------------
 * The extracted Kwame art (see assets/kwame/ and tools/sprite-extractor)
 * covers six directions: down, left, right, up, up_left, up_right. The
 * source pack has no down_left / down_right idle+walk atlases (only the
 * four cardinal + two "up" diagonals were drawn). Rather than silently
 * showing nothing (or crashing on SpriteAtlas.getClip), directionFromVector
 * snaps those two missing diagonals to the nearest direction that *does*
 * have art (left/right respectively) - visually reasonable since walking
 * down-left mostly reads as "facing left" at this character size, and it's
 * a one-line fix once down-left/down-right frames exist.
 */
export type Direction6 = "down" | "left" | "right" | "up" | "up_left" | "up_right";

const RAD_TO_DEG = 180 / Math.PI;

/**
 * @param dx horizontal input, positive = right
 * @param dy vertical input, positive = down (screen space, matches typical 2D input)
 */
export function directionFromVector(dx: number, dy: number): Direction6 {
  if (dx === 0 && dy === 0) return "down";

  // atan2 in screen space (y-down): 0deg = right, 90deg = down, -90deg = up.
  const angle = Math.atan2(dy, dx) * RAD_TO_DEG; // range (-180, 180]

  // 8-way compass sectors, each 45deg wide, then fold the two undrawn
  // down-diagonals onto their nearest cardinal per the fallback above.
  if (angle > -22.5 && angle <= 22.5) return "right";
  if (angle > 22.5 && angle <= 67.5) return "right"; // down-right -> right (no art)
  if (angle > 67.5 && angle <= 112.5) return "down";
  if (angle > 112.5 && angle <= 157.5) return "left"; // down-left -> left (no art)
  if (angle > 157.5 || angle <= -157.5) return "left";
  if (angle > -157.5 && angle <= -112.5) return "up_left";
  if (angle > -112.5 && angle <= -67.5) return "up";
  return "up_right"; // (-67.5, -22.5]
}

export function clipIdFor(state: "idle" | "walk" | "hurt" | "talk", direction: Direction6): string {
  // hurt/talk only have four directions in the source art (no up_left/up_right
  // variants were drawn for those) - fold the two "up" diagonals to "up".
  if (state === "hurt" || state === "talk") {
    const dir = direction === "up_left" || direction === "up_right" ? "up" : direction;
    return `kwame_${state}_${dir}`;
  }
  return `kwame_${state}_${direction}`;
}
