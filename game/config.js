export const CFG={acceleration:22,braking:35,maxSpeed:47,drag:.95,steer:1.8,walkSpeed:5,runSpeed:9,cityLimit:255,quality:1,seed:6408};
export const CANON={cash:8420,rep:6,xp:3100,day:3,time:'18:40',mission:7,stage:2,completed:7,garage:['KILAT GT'],health:94,armour:68,wanted:4};
export function random(seed=CFG.seed){return()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296}};
export const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
