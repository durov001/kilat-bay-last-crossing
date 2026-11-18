# KILAT BAY — The Last Crossing

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/durov001/kilat-bay-last-crossing/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/durov001/kilat-bay-last-crossing/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

Built for the make.fun gta6-01 bounty: https://make.fun/bounty/gta6-01 (referral: https://make.fun/r/zsk0hsg3)

A fresh modular three.js open-world crime game set in a sun-soaked coastal city. Kirana has the payroll, the department has the roads, and Harbor Cut has one lift left.

Run `node serve.ts` and open the printed local URL. Continue loads the finale save (Day 3, 18:40; $8,420; REP 6; jobs 1–7 complete). New Game starts the eight scripted jobs across three acts. Job 7 unlocks the drawbridge; reaching the bridge approach in the finale raises its leaves and blocks pursuing units. Cross to the far shore to finish.

WASD drive/walk; Shift run; Space handbrake; F enter/exit/steal nearby cars; click fire; 1 pistol; 2 SMG; R reload; C camera; M city atlas; P pause; Shift+M or the music button mute. The brief assigns M to both map and mute; the map uses the unmodified key. Audio starts after a user gesture. Progress, money, REP and garage save locally. Health zero or a sustained police box-in sends you to hospital and costs $500.

Modules: config (tuning/state), city (geometry/lighting/bridge), player (movement/weapons), traffic (cars/pedestrians), police (pursuit states/helicopter), missions (eight-job progression), HUD, map, audio, and main (orchestration). Vendor files are unchanged. All other code and SVG portraits are original to this build. No external services or assets are required.

The four deterministic `?shot=1` through `?shot=4` scenes share the canonical finale state. They render the bridge escape, title/crew, on-foot mission and city atlas. Capture at 1280×720 using headless Chromium. `shots.json` lists them.

Package with `mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts`. The output contains game/, screenshots/ and dossier.json. Respray, races and collectibles are map-only activity markers. Boat driving and multiplayer are outside scope.

Validation in the recording environment: JavaScript syntax, relative imports, geometry construction, driving, enter/exit, shooting/reloading, drawbridge/police blocking, payout and all eight mission transitions pass direct module checks. Follow-up recorded sessions passed browser validation via headless Chromium capture of all four screenshots and verified packaging (dossier.json 633 KB, all checks passed).
