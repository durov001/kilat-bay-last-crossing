// KILAT BAY: LAST CROSSING — entrypoint for the make.fun gta6-01 bounty.
// Copies the static game + screenshots into the output directory and writes
// the dossier the judges read. Node 22, standard library only.
import { cpSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildDossier } from "./vendor/makefun-game.ts";

// Where the entry lives (this file's directory) and where it must land.
const ENTRY_ROOT = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = process.env.MAKEFUN_OUTPUT_DIR || "/output";

// Dossier caps from the bounty kit.
const DOSSIER_CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

function copyTree(name: string): void {
  const src = join(ENTRY_ROOT, name);
  const dst = join(OUTPUT_DIR, name);
  if (!existsSync(src)) {
    console.warn(`[kilat-bay] warning: ${name}/ not found at ${src}, skipping`);
    return;
  }
  cpSync(src, dst, { recursive: true });
  console.log(`[kilat-bay] copied ${name}/ -> ${dst}`);
}

function main(): void {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  copyTree("game");
  copyTree("screenshots");
  // Build the dossier from the copied output tree, against the caps.
  // buildDossier returns the finished dossier bytes — write them raw.
  const dossier = buildDossier(OUTPUT_DIR, DOSSIER_CAPS);
  const dossierPath = join(OUTPUT_DIR, "dossier.json");
  if (typeof dossier === "string" || dossier instanceof Uint8Array) {
    writeFileSync(dossierPath, dossier);
  } else {
    writeFileSync(dossierPath, JSON.stringify(dossier, null, 2) + "\n", "utf8");
  }
  console.log(`[kilat-bay] wrote ${dossierPath}`);
}

main();
