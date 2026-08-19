#!/usr/bin/env node

/**
 * Install the hand-drawn Legacy source sheets from the uploaded ZIPs.
 *
 * Usage:
 *   node scripts/install-hand-drawn-assets.mjs
 *   node scripts/install-hand-drawn-assets.mjs --src /path/to/uploads
 *   node scripts/install-hand-drawn-assets.mjs --dry-run
 *
 * Only explicitly named source sheets are promoted. Concept art remains
 * reference-only and is not copied into the browser bundle.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const srcFlag = args.indexOf("--src");
const sourceDir = path.resolve(
  srcFlag >= 0 && args[srcFlag + 1] ? args[srcFlag + 1] : path.join(repoRoot, "attached_assets"),
);

const outputDirs = {
  character: path.join(
    repoRoot,
    "artifacts/pay-it-forward/public/legacy-character-assets/kwame-mensah/source-sheets",
  ),
  environment: path.join(
    repoRoot,
    "artifacts/pay-it-forward/public/legacy-environment-assets/source-sheets",
  ),
};

const characterMap = {
  "Kwame Mensah 32-Frame Hand-Drawn Animation Atlas.png":
    "Kwame_Mensah_32-Frame_Hand-Drawn_Animation_Atlas.png",
  "Kwame Mensah HURT 32-Frame Animation Atlas.png":
    "Kwame_Mensah_HURT_32-Frame_Animation_Atlas.png",
  "Kwame Mensah INSPECT 32-Frame Animation Atlas.png":
    "Kwame_Mensah_INSPECT_32-Frame_Animation_Atlas.png",
  "Kwame Mensah INTERACT 32-Frame Animation Atlas.png":
    "Kwame_Mensah_INTERACT_32-Frame_Animation_Atlas.png",
  "Kwame Mensah PICK UP 32-Frame Animation Atlas.png":
    "Kwame_Mensah_PICK_UP_32-Frame_Animation_Atlas.png",
  "Kwame Mensah RIGHT Direction 32-Frame Animation Atlas.png":
    "Kwame_Mensah_RIGHT_Direction_32-Frame_Animation_Atlas.png",
  "Kwame Mensah RPG Maker MV Final Sprite Sheet.png":
    "Kwame_Mensah_RPG_Maker_MV_Final_Sprite_Sheet.png",
  "Kwame Mensah RUN DOWN LEFT 32-Frame Animation Atlas.png":
    "Kwame_Mensah_RUN_DOWN_LEFT_32-Frame_Animation_Atlas.png",
  "Kwame Mensah RUN UP RIGHT 32-Frame Animation Atlas.png":
    "Kwame_Mensah_RUN_UP_RIGHT_32-Frame_Animation_Atlas.png",
  "Kwame Mensah TALK 32-Frame Animation Atlas.png":
    "Kwame_Mensah_TALK_32-Frame_Animation_Atlas.png",
  "Kwame Mensah TALK DOWN LEFT 32-Frame Animation Atlas.png":
    "Kwame_Mensah_TALK_DOWN_LEFT_32-Frame_Animation_Atlas.png",
  "Kwame Mensah TALK UP RIGHT 32-Frame Animation Atlas.png":
    "Kwame_Mensah_TALK_UP_RIGHT_32-Frame_Animation_Atlas.png",
  "Kwame Mensah UP Direction 32-Frame Animation Atlas.png":
    "Kwame_Mensah_UP_Direction_32-Frame_Animation_Atlas.png",
  "kwame_mensah_hand_drawn_4direction_atlas_blueprint.png":
    "kwame_mensah_hand_drawn_4direction_atlas_blueprint.png",
  "kwame_mensah_hand_drawn_character_production_spec.png":
    "kwame_mensah_hand_drawn_character_production_spec.png",
};

const environmentMap = {
  "NIAKOFA-GROUND-TILES-ATLAS-v1.png": "NIAKOFA-GROUND-TILES-ATLAS-v1.png",
  "NIAKOFA-BUILDINGS-STRUCTURES-ATLAS-v1.png":
    "NIAKOFA-BUILDINGS-STRUCTURES-ATLAS-v1.png",
};

function ensureDirectory(directory) {
  if (!dryRun) fs.mkdirSync(directory, { recursive: true });
}

function findZip(prefix) {
  const match = fs
    .readdirSync(sourceDir)
    .filter((name) => name.toLowerCase().startsWith(prefix.toLowerCase()) && name.endsWith(".zip"))
    .sort()[0];
  if (!match) throw new Error(`Could not find ${prefix}*.zip in ${sourceDir}`);
  return path.join(sourceDir, match);
}

function listArchiveFiles(zipPath) {
  return execFileSync("unzip", ["-Z1", zipPath], { encoding: "utf8" })
    .split("\n")
    .filter((entry) => entry.endsWith(".png") && !entry.startsWith("__MACOSX/"));
}

function copyMappedFiles(zipPath, mapping, outputDirectory, label) {
  ensureDirectory(outputDirectory);
  const temporaryDirectory = fs.mkdtempSync(path.join("/tmp", `niakofa-${label}-`));
  execFileSync("unzip", ["-q", "-o", zipPath, "-d", temporaryDirectory], { stdio: "inherit" });

  let copied = 0;
  const missing = new Set(Object.keys(mapping));
  for (const archiveEntry of listArchiveFiles(zipPath)) {
    const sourceName = path.basename(archiveEntry);
    const destinationName = mapping[sourceName];
    if (!destinationName) continue;

    const sourcePath = path.join(temporaryDirectory, archiveEntry);
    const destinationPath = path.join(outputDirectory, destinationName);
    if (dryRun) {
      console.log(`[dry-run] ${label}: ${sourceName} -> ${destinationName}`);
    } else {
      fs.copyFileSync(sourcePath, destinationPath);
    }
    missing.delete(sourceName);
    copied += 1;
  }

  if (missing.size > 0) {
    throw new Error(`${label} archive is missing: ${[...missing].join(", ")}`);
  }
  console.log(`${label}: ${copied} source sheets ${dryRun ? "would be installed" : "installed"}`);
}

console.log(`Source directory: ${sourceDir}`);
console.log(`Mode: ${dryRun ? "dry run" : "install"}`);
copyMappedFiles(findZip("Hand_Drawn_Kwame_Mensah"), characterMap, outputDirs.character, "Kwame");
copyMappedFiles(findZip("Hand_Drawn_Envirnonment_Assets"), environmentMap, outputDirs.environment, "Environment");