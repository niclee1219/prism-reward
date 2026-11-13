import Phaser from 'phaser';
import { registerSW } from 'virtual:pwa-register';
import './ui/styles.css';
import { NICKNAME_MAX, VIEW } from './config';
import { suggestNickname } from './content/nicknames';
import { attachInput } from './game/input';
import { RunScene, type RunResult } from './game/RunScene';
import { local, uuid } from './net/device';
import { enqueue, flush } from './net/submitQueue';
import { Hud } from './ui/hud';
import { showResults } from './ui/results';

registerSW({ immediate: true });

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const stage = $('stage');

// The canvas keeps the phone's aspect ratio (within limits) so nothing is letterboxed on phones.
const clampAspect = () => {
  const a = window.innerHeight / window.innerWidth;
  return Math.min(Math.max(a, VIEW.MIN_HEIGHT / VIEW.WIDTH), VIEW.MAX_HEIGHT / VIEW.WIDTH);
};
const aspect = clampAspect();
const fitStage = () => {
  const w = Math.min(window.innerWidth, window.innerHeight / aspect);
  stage.style.width = `${Math.floor(w)}px`;
  stage.style.height = `${Math.floor(w * aspect)}px`;
};
fitStage();
window.addEventListener('resize', fitStage);

const scene = new RunScene();
new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: VIEW.WIDTH,
  height: Math.round(VIEW.WIDTH * aspect),
  backgroundColor: '#1b1b2f',
  banner: false,
  audio: { noAudio: true },
  input: { keyboard: false, mouse: false, touch: false, gamepad: false },
  render: { pixelArt: true, antialias: false, roundPixels: true, powerPreference: 'high-performance' },
  scale: { mode: Phaser.Scale.NONE },
  scene,
});

const hud = new Hud();
const startScreen = $('screen-start');
const resultsScreen = $('screen-results');
const nickInput = $<HTMLInputElement>('nickname');

nickInput.value = local.nickname ?? suggestNickname();
$('reroll').addEventListener('click', () => (nickInput.value = suggestNickname()));

attachInput(stage, (dir) => scene.move(dir));

// Stop the browser's own gestures (pull-to-refresh, pinch, double-tap zoom) on the game page.
document.addEventListener('touchmove', (e) => { if (!(e.target as HTMLElement).closest('.strip')) e.preventDefault(); }, { passive: false });
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault());

function cleanNickname(): string {
  const name = nickInput.value.replace(/\s+/g, ' ').trim().slice(0, NICKNAME_MAX);
  return name || suggestNickname();
}

function play(): void {
  const nickname = cleanNickname();
  local.nickname = nickname;
  nickInput.blur();
  startScreen.hidden = true;
  resultsScreen.hidden = true;
  hud.show(true);
  scene.startRun({
    onHud: (h) => hud.update(h),
    onQuestion: (gq, tutorial) => hud.question(gq, tutorial),
    onGateResult: (chosen, correctLane, correct) => hud.gateResult(chosen, correctLane, correct),
    onEnd: (result) => finish(result, nickname),
  });
}

function finish(result: RunResult, nickname: string): void {
  hud.show(false);
  const runId = uuid();
  // Queue first, so the run is safe even if the tab dies during the results screens.
  enqueue({
    run_id: runId,
    nickname,
    score: result.score,
    correct: result.correct,
    wrong: result.wrong,
    gates: result.gates,
    duration_ms: result.duration_ms,
  });
  showResults(resultsScreen, result, runId, nickname, play);
}

$('play').addEventListener('click', play);
void flush(); // send anything left over from an earlier visit
