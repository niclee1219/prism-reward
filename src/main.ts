import { registerSW } from 'virtual:pwa-register';
import './ui/styles.css';
import { NICKNAME_MAX, VIEW } from './config';
import { DISHES, dishById, isDishId, type DishId } from './content/dishes';
import { suggestNickname } from './content/nicknames';
import { attachInput } from './game/input';
import { RunSim, type RunResult } from './game/sim/RunSim';
import { World } from './game/three/World';
import { openLearn, type LearnHandle } from './learn/learn';
import { ApiError, claimName } from './net/api';
import { deviceId, local, uuid } from './net/device';
import { fetchOpen } from './net/status';
import { enqueue, flush } from './net/submitQueue';
import { hideClosed, showClosed } from './ui/closed';
import { Hud } from './ui/hud';
import { showHowto } from './ui/howto';
import { showLeaderboard } from './ui/leaderboard';
import { showResults } from './ui/results';

registerSW({ immediate: true });

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const stage = $('stage');

// The stage keeps the phone's aspect ratio (within limits) so nothing is letterboxed on phones.
const fitStage = () => {
  const aspect = Math.min(Math.max(window.innerHeight / window.innerWidth, VIEW.MIN_ASPECT), VIEW.MAX_ASPECT);
  const w = Math.min(window.innerWidth, window.innerHeight / aspect);
  stage.style.width = `${Math.floor(w)}px`;
  stage.style.height = `${Math.floor(w * aspect)}px`;
};
fitStage();
window.addEventListener('resize', fitStage);

const hud = new Hud(stage);
const sim = new RunSim();
const world = new World(stage, $('game'), sim, {
  onIngredient: (x, y, step) => hud.ingredient(x, y, step),
  onCoin: (_points, doubled) => hud.coin(doubled),
  onPower: () => {},
  onPlating: (x, y) => hud.plating(x, y),
});
(window as unknown as { __prism?: RunSim }).__prism = sim;

const startScreen = $('screen-start');
const resultsScreen = $('screen-results');
const nickInput = $<HTMLInputElement>('nickname');

const nickRow = $('nick-row');
const nickLocked = $('nick-locked');
const nickError = $('nick-error');

// The name box starts empty so people can type their own; the dice fills in a random one.
// Once a device has claimed a name it is locked and replays are one tap.
function renderName(): void {
  const locked = local.locked;
  nickRow.hidden = !!locked;
  nickLocked.hidden = !locked;
  if (locked) $('nick-locked-name').textContent = locked;
}
function nameError(msg: string | null): void {
  nickError.hidden = !msg;
  nickError.textContent = msg ?? '';
  nickRow.classList.remove('shake');
  if (msg) {
    void nickRow.offsetWidth; // restart the animation
    nickRow.classList.add('shake');
  }
}
renderName();
nickInput.addEventListener('input', () => nameError(null));
$('reroll').addEventListener('click', () => {
  nickInput.value = suggestNickname();
  nameError(null);
});

// Dish picker: three cards, the last choice is remembered.
let dish: DishId = isDishId(local.dish) ? local.dish : DISHES[0].id;
const picker = $('dishes');
for (const d of DISHES) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'dish';
  b.dataset.dish = d.id;
  b.style.setProperty('--dish', d.colour);
  b.innerHTML = `<span class="dish-done" hidden aria-label="Done">✓</span><span class="dish-emoji">${d.emoji}</span><span class="dish-name">${d.name}</span>`;
  b.setAttribute('aria-pressed', String(d.id === dish));
  b.addEventListener('click', () => {
    dish = d.id;
    local.dish = dish;
    picker.querySelectorAll<HTMLElement>('.dish').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.dish === dish)));
    $('dish-blurb').textContent = d.blurb;
  });
  picker.append(b);
}
$('dish-blurb').textContent = dishById(dish).blurb;

/** Ticks every dish this device has finished a run on. */
function renderDone(): void {
  const done = local.doneDishes;
  picker.querySelectorAll<HTMLElement>('.dish').forEach((x) => {
    const isDone = done.includes(x.dataset.dish ?? '');
    x.querySelector<HTMLElement>('.dish-done')!.hidden = !isDone;
    x.setAttribute('aria-label', `${dishById(x.dataset.dish as DishId).name}${isDone ? ', done' : ''}`);
  });
}
renderDone();

/** Back to the home screen after a run. Nothing starts until the player taps PLAY. */
function showHome(): void {
  resultsScreen.hidden = true;
  resultsScreen.innerHTML = '';
  hud.show(false);
  world.reset();
  sim.idle();
  renderName();
  renderDone();
  startScreen.classList.remove('leaving');
  startScreen.hidden = false;
  syncClosed();
}

attachInput(stage, (dir) => sim.move(dir));

// Stop the browser's own gestures (pull-to-refresh, pinch, double-tap zoom) on the game page.
document.addEventListener('touchmove', (e) => { if (!(e.target as HTMLElement).closest('.strip, #screen-results .beat, .recipe-list, .lb-body, .learn-band')) e.preventDefault(); }, { passive: false });
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault());

function typedName(): string {
  return nickInput.value.replace(/\s+/g, ' ').trim().slice(0, NICKNAME_MAX);
}

// Staff can close the site from /admin. Players already running or on the results cards are never cut off:
// the closed screen only covers the home screen, so it appears as soon as they go back to it.
let siteOpen = true;
const closedScreen = $('screen-closed');
function syncClosed(): void {
  if (siteOpen) hideClosed(closedScreen);
  // Someone part-way through Learn finishes it first, like a run: the closed screen waits for the home screen.
  else if (!startScreen.hidden && !learn) showClosed(closedScreen);
}
async function refreshStatus(): Promise<void> {
  siteOpen = await fetchOpen();
  syncClosed();
}

// Learn: how PRISM works. A phone's first visit opens it over the home screen; finishing or skipping it sets the
// per-phone flag, so later visits land on home (which links back to it). It never opens while the site is closed,
// and the flag is only set while the site is open.
let learn: LearnHandle | null = null;
function showLearn(): void {
  if (learn || !siteOpen) return;
  world.paused = true; // Learn covers the street completely: no need to keep drawing it
  learn = openLearn($('screen-learn'), {
    onSeen: () => {
      if (siteOpen) local.seenLearn = true;
    },
    onClose: () => {
      learn = null;
      world.paused = false;
      syncClosed();
    },
  });
}
const firstVisit = !local.seenLearn;
if (firstVisit) showLearn();
// The first status check decides: if staff have closed the site, a first visit gets only the closed screen, so the
// Learn that opened while the check was in flight goes away untouched (the flag stays unset). Later closings let
// someone already in Learn finish it.
void refreshStatus().then(() => {
  if (!siteOpen && learn && firstVisit && !learn.touched) {
    learn.close();
  }
});
setInterval(() => void refreshStatus(), 15_000);
document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && void refreshStatus());

let starting = false;

async function play(): Promise<void> {
  if (starting) return; // a double tap on PLAY must not start two countdowns
  if (!siteOpen) return syncClosed();
  starting = true;
  let nickname = local.locked;
  if (!nickname) {
    const typed = typedName();
    if (!typed) {
      nameError('Type a name, or tap the dice 🎲');
      nickInput.focus();
      starting = false;
      return;
    }
    nickname = typed;
    try {
      const claimed = await claimName(deviceId(), typed);
      nickname = claimed.nickname;
      local.locked = nickname;
      renderName();
    } catch (e) {
      const code = e instanceof ApiError ? e.code : 'network';
      if (code === 'name_taken' || code === 'bad_name') {
        nameError(code === 'name_taken' ? 'That name is taken. Try another or tap 🎲' : 'Please pick a different name');
        starting = false;
        return;
      }
      // Offline or the server is busy: play anyway. The name is claimed when the score is saved.
    }
  }
  local.nickname = nickname;
  nickInput.blur();
  // The controls slides show once, on the first PLAY tap; closing them carries straight on into the run.
  if (!local.seenHowto) await new Promise<void>((done) => showHowto($('screen-howto'), { onClose: done, playing: true }));
  // The start screen whooshes away instead of blinking out.
  if (!startScreen.hidden) {
    startScreen.classList.add('leaving');
    setTimeout(() => {
      startScreen.hidden = true;
      startScreen.classList.remove('leaving');
    }, 320);
  }
  resultsScreen.hidden = true;
  hud.show(true, dishById(dish));
  world.reset();
  sim.idle();
  // Camera swoop + READY / SET; the run itself starts on GO!
  world.intro(() => {
    starting = false;
    sim.startRun(
      {
        onHud: (h) => hud.update(h),
        onQuestion: (gq, tutorial) => hud.question(gq, tutorial),
        onGateResult: (chosen, correctLane, correct) => hud.gateResult(chosen, correctLane, correct),
        onEnd: (result) => finish(result, nickname),
      },
      dish,
    );
  });
}

function finish(result: RunResult, nickname: string): void {
  hud.show(false);
  local.markDishDone(result.dish);
  renderDone();
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
    dish: result.dish,
  });
  showResults(resultsScreen, result, runId, nickname, showHome);
}

$('play').addEventListener('click', () => void play());
$('open-board').addEventListener('click', () => showLeaderboard($('screen-board')));
$('open-howto').addEventListener('click', () => showHowto($('screen-howto')));
$('open-learn').addEventListener('click', () => showLearn());
void flush(); // send anything left over from an earlier visit
