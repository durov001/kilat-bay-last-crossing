import { cp, mkdir, writeFile, readdir, rm, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { buildDossier } from './vendor/makefun-game.ts';

// The kit reads this output directory; the source and vendor files stay intact.
const output = resolve(process.env.MAKEFUN_OUTPUT_DIR || '/output');
if(output === resolve('.')) throw new Error('Output must be separate from the source repository.');
const caps = {
  text_max_bytes: 163840,
  screenshots_max: 4,
  screenshot_max_bytes: 262144,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};
const expected = ['1-chase.jpg', '2-title.jpg', '3-mission.jpg', '4-map.jpg'];
await mkdir(output, { recursive: true });
for(const name of ['game', 'screenshots']) {
  await rm(resolve(output, name), { recursive: true, force: true });
  await cp(name, resolve(output, name), { recursive: true });
}
for(const name of expected) {
  const info = await stat(resolve(output, 'screenshots', name)).catch(() => null);
  if(!info) throw new Error(`Missing real Chromium capture: screenshots/${name}. Run /tmp/capture-kilat.cjs first.`);
  if(info.size > caps.screenshot_max_bytes) throw new Error(`${name} exceeds the screenshot byte cap.`);
}
const images = await readdir(resolve(output, 'screenshots'));
if(images.length !== 4) throw new Error('Expected exactly the four canonical screenshots.');
const dossier = await buildDossier(output, caps);
await writeFile(resolve(output, 'dossier.json'), dossier);
console.log(`KILAT BAY packaged: ${output}/game + screenshots + dossier.json`);
