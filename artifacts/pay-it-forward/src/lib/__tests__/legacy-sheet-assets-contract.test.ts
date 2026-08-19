import { describe, it } from "node:test";
import { expect } from "expect";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "../../..");
const runtimeSheetRoot = resolve(
  projectRoot,
  "public/legacy-character-assets/kwame-mensah/runtime-sheets",
);
const manifestPath = resolve(projectRoot, "src/legacy-runtime/kwame-sheet-manifest.ts");

const runtimeSheets = [
  "Kwame_Mensah_32-Frame_Hand-Drawn_Animation_Atlas.png",
  "Kwame_Mensah_RIGHT_Direction_32-Frame_Animation_Atlas.png",
  "Kwame_Mensah_UP_Direction_32-Frame_Animation_Atlas.png",
  "Kwame_Mensah_RUN_DOWN_LEFT_32-Frame_Animation_Atlas.png",
  "Kwame_Mensah_RUN_UP_RIGHT_32-Frame_Animation_Atlas.png",
  "Kwame_Mensah_INTERACT_32-Frame_Animation_Atlas.png",
  "Kwame_Mensah_PICK_UP_32-Frame_Animation_Atlas.png",
  "Kwame_Mensah_INSPECT_32-Frame_Animation_Atlas.png",
  "Kwame_Mensah_HURT_32-Frame_Animation_Atlas.png",
  "Kwame_Mensah_TALK_32-Frame_Animation_Atlas.png",
  "Kwame_Mensah_TALK_DOWN_LEFT_32-Frame_Animation_Atlas.png",
  "Kwame_Mensah_TALK_UP_RIGHT_32-Frame_Animation_Atlas.png",
];

function pngDimensionsAndColorType(filePath: string) {
  const png = readFileSync(filePath);
  expect(png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))).toBe(true);
  return {
    width: png.readUInt32BE(16),
    height: png.readUInt32BE(20),
    colorType: png[25],
  };
}

describe("Legacy Kwame atlas runtime boundary", () => {
  it("ships every manifest atlas as one transparent 8×4 sheet", () => {
    for (const fileName of runtimeSheets) {
      const filePath = resolve(runtimeSheetRoot, fileName);
      expect(existsSync(filePath)).toBe(true);
      expect(pngDimensionsAndColorType(filePath)).toEqual({
        width: 2048,
        height: 1024,
        colorType: 6,
      });
    }
  });

  it("points the live manifest at runtime sheets, not exploded frame files", () => {
    const manifest = readFileSync(manifestPath, "utf8");
    expect(manifest).toContain('baseUrl: "/legacy-character-assets/kwame-mensah/runtime-sheets/"');
    expect(manifest).not.toContain("frameFiles:");
    expect(manifest).not.toContain("pick-up-left-2.png");
  });
});