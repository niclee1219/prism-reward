// The results flow: a handful of short beats in a fixed order, one per screen.
import { SCORING } from '../config';
import { dishById } from '../content/dishes';
import { PAIN_POINTS } from '../content/painpoints';
import { QUESTIONS } from '../game/gateDirector';
import { buzz } from '../game/haptics';
import { reducedMotion } from '../game/perf';
import type { RunResult } from '../game/sim/RunSim';
import { ApiError, api, type RankInfo, type SpinResult, type SubmitResult } from '../net/api';
import { deviceId, local } from '../net/device';
import { onOutcome, type Outcome } from '../net/submitQueue';
import { confetti } from './confetti';
import { mountLeaderboard } from './leaderboard';
import { renderPrize } from './prize';
import { Wheel } from './wheel';

const FALLBACK_SEGMENT = 'Better luck next time + sticker';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

const REJECT_TEXT: Record<string, string> = {
  closed: 'Score submissions are closed right now.',
  implausible: "That score didn't pass our checks, so it isn't on the board.",
};

export function showResults(
  root: HTMLElement,
  run: RunResult,
  runId: string,
  nickname: string,
  onPlayAgain: () => void,
): void {
  const dish = dishById(run.dish);
  let outcome: Outcome | null = null;
  let server: SubmitResult | null = null;
  const outcomeWaiters: ((o: Outcome) => void)[] = [];
  onOutcome(runId, (o) => {
    outcome = o;
    if (o.ok) {
      server = o.result;
      local.voted = o.result.voted;
    }
    outcomeWaiters.splice(0).forEach((w) => w(o));
  });
  const whenOutcome = (cb: (o: Outcome) => void) => (outcome ? cb(outcome) : outcomeWaiters.push(cb));

  root.innerHTML = '';
  root.hidden = false;
  const holder = el('div', 'beat');
  const progress = el('div', 'progress');
  const dots = el('div', 'dots');
  const counter = el('span', 'step-count');
  progress.append(dots, counter);
  const nav = el('div', 'nav-row');
  const back = el('button', 'btn btn-back', '◂');
  back.type = 'button';
  back.id = 'back';
  back.setAttribute('aria-label', 'Back');
  const next = el('button', 'btn', 'NEXT ▸');
  next.type = 'button';
  next.id = 'next';
  nav.append(back, next);
  root.append(holder, progress, nav);

  // Cards remember what already happened, so going back never replays or repeats anything.
  const seen = new Set<string>();
  let spun: SpinResult | null = null;
  let emailDone = local.emailGiven;

  // --- beat 1: score, rank, confetti -----------------------------------------
  const beatScore = (b: HTMLElement) => {
    const first = !seen.has('score');
    const served = run.reason === 'served';
    const kind = served ? 'served' : run.reason === 'timeup' ? 'timeup' : 'crash';
    const head = el('h2', `headline ${kind}`, served ? 'DISH SERVED!' : run.reason === 'timeup' ? "TIME'S UP!" : 'RUN OVER');
    const plate = el('div', `plate${served ? ' served' : ''}`);
    plate.append(el('span', 'plate-emoji', dish.emoji), el('span', 'plate-name', served ? `Ah Ma's ${dish.name}` : dish.name));

    const ticket = el('div', 'ticket');
    const big = el('div', 'big-score', first ? '0' : run.score.toLocaleString('en'));
    big.id = 'final-score';
    // Recipe progress as eight pips, so "how close was I" reads at a glance.
    const pips = el('div', 'pips');
    for (let i = 0; i < SCORING.RECIPE_STEPS; i++) pips.append(el('i', i < run.recovered ? 'on' : ''));
    const stats = el('div', 'stats');
    stats.append(el('span', 'stat-chip', `✔ ${run.correct}/${run.gates}`), el('span', 'stat-chip', `🔥 ${run.bestStreak}`));
    if (run.coins) {
      const coins = el('span', 'stat-chip', ` ${run.coins}`);
      coins.prepend(el('i', 'coin')); // drawn coin: the coin emoji is missing on older phones
      stats.append(coins);
    }
    if (run.bonus) stats.append(el('span', 'stat-chip gold', `🍽 +${run.bonus}`));
    ticket.append(el('div', 'ticket-label', 'SCORE'), big, pips, stats);

    const line = el(
      'div',
      'sub',
      served
        ? `All ${SCORING.RECIPE_STEPS} steps decoded. Ah Ma would be proud.`
        : `Recovered ${run.recovered}/${SCORING.RECIPE_STEPS} steps. Ah Ma says: try again lah.`,
    );
    const status = el('div', 'saving', 'Saving your score...');
    status.id = 'rank-status';
    b.append(head, plate, ticket, line, status);
    if (served && first) confetti(root, 120);

    if (first) {
      // Count up with a light tick every few frames, then a thump when it lands.
      const t0 = performance.now();
      let lastTick = 0;
      const ms = reducedMotion ? 300 : 1300;
      const tick = (now: number) => {
        const k = Math.min((now - t0) / ms, 1);
        big.textContent = Math.floor(run.score * (1 - Math.pow(1 - k, 3))).toLocaleString('en');
        if (now - lastTick > 90 && k < 1) {
          lastTick = now;
          buzz('tick');
        }
        if (k < 1 && big.isConnected) requestAnimationFrame(tick);
        else {
          big.classList.add('pop');
          buzz('thump');
        }
      };
      requestAnimationFrame(tick);
    }

    whenOutcome((o) => {
      if (!status.isConnected) return;
      if (!o.ok) {
        status.className = 'sub';
        status.textContent = REJECT_TEXT[o.code] ?? REJECT_TEXT.implausible;
        return;
      }
      const r = o.result;
      const box = el('div', 'rank-box');
      box.id = 'rank-box';
      const top10 = r.rank !== null && r.rank <= 10;
      const medal = el('div', `medal${r.rank === 1 ? ' gold' : r.rank === 2 ? ' silver' : r.rank === 3 ? ' bronze' : ''}`);
      medal.append(el('small', '', 'RANK'), el('b', '', `#${r.rank}`));
      const words = el('div', 'rank-words');
      const badges = el('div', 'badges');
      if (r.is_best && r.is_new) {
        big.classList.add('best');
        badges.append(el('span', 'badge-best', '✨ NEW BEST'));
      }
      if (r.rank === 1) badges.append(el('span', 'king', '👑 KING OF THE HILL'));
      else if (r.is_best && top10) badges.append(el('span', 'king', '⭐ NEW TOP 10!'));
      words.append(el('div', 'rank', `You're #${r.rank}`));
      if (r.beat_count > 0) words.append(el('div', 'beatline', `You beat ${r.beat_count} player${r.beat_count === 1 ? '' : 's'}`));
      if (!r.is_best && r.score !== null) words.append(el('div', 'sub', `Your best is still ${r.score.toLocaleString('en')}`));
      if (badges.childElementCount) words.prepend(badges);
      box.append(medal, words);
      status.replaceWith(box);
      if (first) {
        confetti(root, r.rank === 1 ? 220 : top10 && r.is_best ? 150 : 60);
        buzz(top10 ? 'win' : 'thump');
      }
    });
  };

  // --- beat 1a: the leaderboard, with the player's row highlighted --------------
  const beatBoard = (b: HTMLElement) => {
    b.append(el('h2', '', '🏆 LEADERBOARD'));
    const body = el('div', 'lb-body');
    b.append(body);
    // Wait for this run to be saved so the new score shows up in the list.
    body.append(el('div', 'saving', 'Updating the board...'));
    whenOutcome(() => {
      if (body.isConnected) mountLeaderboard(body);
    });
  };

  // --- beat 1b: the recipe, decoded ---------------------------------------------
  const beatRecipe = (b: HTMLElement) => {
    b.append(el('h2', '', run.recovered ? 'WHAT PRISM DECODED' : "AH MA'S NOTES"));
    const bar = el('div', 'decode-bar');
    const fill = el('i');
    fill.style.setProperty('--k', String(run.recovered / SCORING.RECIPE_STEPS));
    bar.append(fill, el('span', '', `${run.recovered}/${SCORING.RECIPE_STEPS} decoded`));
    b.append(bar);
    const list = el('ol', 'recipe-list');
    dish.steps.forEach((s, i) => {
      const got = i < run.recovered;
      const li = el('li', got ? 'got' : 'locked');
      li.style.setProperty('--i', String(i));
      li.append(el('span', 'r-emoji', got ? s.emoji : '🔒'));
      const text = el('div', 'r-text');
      text.append(el('div', 'r-note', `“${s.note}”`));
      text.append(el('div', 'r-decoded', got ? `→ ${s.decoded}` : '→ ??? (answer more gates to decode)'));
      li.append(text);
      list.append(li);
    });
    b.append(list, el('p', 'sub', 'Vague notes are like code nobody documented. PRISM turns them into exact steps, with sources.'));
  };

  // --- beat 2: vote toggle ---------------------------------------------------
  const beatVote = (b: HTMLElement) => {
    b.append(el('h2', '', 'ONE MORE BOOST'));
    const mult = server?.vote_bonus_multiplier ?? 1.1;
    const pct = Math.round((mult - 1) * 100);
    const base = server?.score ?? run.score;
    const label = el('label', 'vote-card');
    const box = el('input');
    box.type = 'checkbox';
    box.id = 'vote';
    box.className = 'switch';
    box.checked = local.voted;
    const text = el('span', 'vote-text');
    text.append(el('b', '', 'I voted for the PRISM team'), el('small', '', `+${pct}% on your best score. We trust you.`));
    label.append(el('span', 'vote-icon', '🗳️'), text, box);
    const preview = el('div', 'boost-preview');
    const from = el('span', 'from', base.toLocaleString('en'));
    const to = el('span', 'to', Math.floor(base * mult).toLocaleString('en'));
    preview.append(from, el('span', 'arrow', '→'), to);
    const msg = el('div', 'msg');
    const sync = () => b.classList.toggle('boosted', box.checked);
    sync();
    b.append(label, preview, msg);
    box.addEventListener('change', async () => {
      box.disabled = true;
      sync();
      buzz(box.checked ? 'correct' : 'tick');
      msg.className = 'msg';
      msg.textContent = 'Saving...';
      try {
        const r = await api<RankInfo>('/vote', { body: { device_id: deviceId(), voted: box.checked } });
        local.voted = box.checked;
        msg.textContent = box.checked ? `Bonus applied! Score ${r.score}. You're #${r.rank}.` : `Bonus removed. You're #${r.rank}.`;
        if (box.checked) confetti(root, 40);
      } catch {
        box.checked = !box.checked;
        sync();
        msg.className = 'msg err';
        msg.textContent = "Couldn't save that. Try again.";
      }
      box.disabled = false;
    });
  };

  // --- beat 3: a PRISM-style cited answer --------------------------------------
  const beatCite = (b: HTMLElement) => {
    const missed = QUESTIONS.filter((q) => run.missed.includes(q.id));
    const pool = missed.length ? missed : QUESTIONS;
    const q = pool[Math.floor(Math.random() * pool.length)];
    b.append(el('h2', '', missed.length ? 'ONE YOU MISSED' : 'DID YOU KNOW?'));
    const card = el('div', 'cite-card');
    const ans = el('div', 'ans');
    const src = el('div', 'src', `Source: ${q.citation}`);
    card.append(el('div', 'who', '◆ PRISM'), el('div', 'you', `You asked: ${q.q}`), ans, src);
    b.append(card, el('p', 'sub', 'Every PRISM answer shows where it came from.'));
    // PRISM "types" its answer, then the source stamps on.
    if (reducedMotion) ans.textContent = q.explain;
    else {
      ans.classList.add('typing');
      src.classList.add('later');
      let n = 0;
      const t0 = performance.now() + 450;
      const type = (now: number) => {
        if (!ans.isConnected) return;
        n = Math.max(0, Math.min(q.explain.length, Math.floor((now - t0) / 16)));
        ans.textContent = q.explain.slice(0, n);
        if (n < q.explain.length) requestAnimationFrame(type);
        else {
          ans.classList.remove('typing');
          src.classList.add('in');
          buzz('tick');
        }
      };
      requestAnimationFrame(type);
    }
  };

  // --- beat 4: pain-point cards ------------------------------------------------
  const beatPain = (b: HTMLElement) => {
    b.append(el('h2', '', 'PRISM ALSO HELPS WHEN...'));
    const strip = el('div', 'strip');
    for (const p of PAIN_POINTS) {
      const c = el('div', 'pain');
      c.append(el('div', 'icon', p.icon), el('h3', '', p.title), el('div', 'k', p.kitchen), el('div', 'p', p.pain), el('div', 'f', `→ ${p.fix}`));
      strip.append(c);
    }
    const pager = el('div', 'pager');
    PAIN_POINTS.forEach((_, i) => pager.append(el('i', i === 0 ? 'on' : '')));
    strip.addEventListener('scroll', () => {
      const i = Math.round(strip.scrollLeft / Math.max(1, (strip.firstElementChild as HTMLElement).offsetWidth + 12));
      pager.querySelectorAll('i').forEach((d, n) => d.classList.toggle('on', n === i));
    });
    b.append(strip, pager);
  };

  // --- beat 5: optional email --------------------------------------------------
  const beatEmail = (b: HTMLElement) => {
    b.append(el('h2', '', 'WANT IN ON THE PRIZE DRAW?'));
    const input = el('input', 'field');
    input.type = 'email';
    input.id = 'email';
    input.placeholder = 'you@example.com';
    input.autocomplete = 'email';
    const consentLabel = el('label', 'check small');
    const consent = el('input');
    consent.type = 'checkbox';
    consent.id = 'email-consent';
    consentLabel.append(consent, el('span', '', 'Keep me posted with PRISM updates'));
    const notice = el(
      'p',
      'notice',
      'Optional: used only for the prize draw and PRISM updates. Deleted after the event unless you opt in to updates.',
    );
    const send = el('button', 'btn btn-ghost', 'ENTER THE DRAW');
    send.type = 'button';
    send.id = 'email-send';
    const msg = el('div', 'msg');
    b.append(el('div', 'draw-ticket', '🎟️'), input, consentLabel, notice, send, msg);
    next.textContent = 'SKIP ▸';
    if (emailDone) {
      input.disabled = consent.disabled = send.disabled = true;
      input.placeholder = 'Entered';
      msg.textContent = "You're in the draw!";
      next.textContent = 'NEXT ▸';
    }
    send.addEventListener('click', async () => {
      const email = input.value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
        msg.className = 'msg err';
        msg.textContent = 'That email looks off. Check it?';
        return;
      }
      send.disabled = true;
      try {
        await api('/email', { body: { device_id: deviceId(), email, consent: consent.checked } });
        local.emailGiven = true;
        emailDone = true;
        buzz('correct');
        msg.className = 'msg';
        msg.textContent = "You're in the draw!";
        next.textContent = 'NEXT ▸';
      } catch (e) {
        send.disabled = false;
        msg.className = 'msg err';
        msg.textContent =
          e instanceof ApiError && e.code === 'no_player' ? 'Your score is still saving. Try again in a moment.' : "Couldn't save that. Try again.";
      }
    });
  };

  // --- beat 6: spin wheel finale -----------------------------------------------
  const showPrize = (b: HTMLElement, r: SpinResult) => {
    b.innerHTML = '';
    b.classList.add('prize-reveal');
    renderPrize(b, { code: r.code, name: r.prize_name, won_at: Date.now(), won: !!r.prize_id, nickname });
    // Other prizes from earlier runs that the team has not handed over yet.
    const earlier = local.unredeemed.filter((p) => p.code !== r.code);
    if (earlier.length) {
      b.append(el('div', 'old-prizes', `Not collected yet: ${earlier.map((p) => `${p.code} (${p.name})`).join(', ')}`));
    }
  };

  const beatSpin = (b: HTMLElement) => {
    next.textContent = 'PLAY AGAIN';
    if (spun) return showPrize(b, spun); // already spun this run: show the prize, never a second wheel
    b.append(el('h2', 'spin-title', 'SPIN TO WIN'));
    const wheel = new Wheel(server?.wheel?.length ? server.wheel : [FALLBACK_SEGMENT]);
    const spin = el('button', 'btn btn-spin', 'SPIN!');
    spin.type = 'button';
    spin.id = 'spin';
    spin.disabled = true;
    const msg = el('div', 'msg', 'Waiting for your score to save...');
    b.append(wheel.el, spin, msg);

    whenOutcome((o) => {
      if (!o.ok) {
        msg.textContent = 'No spin for this run. Play again!';
        return;
      }
      wheel.setSegments(o.result.wheel.length ? o.result.wheel : [FALLBACK_SEGMENT]);
      msg.textContent = 'Tap SPIN or the wheel';
      spin.disabled = false;
      wheel.el.classList.add('ready');
    });

    const doSpin = async () => {
      if (spin.disabled) return;
      spin.disabled = true;
      back.disabled = next.disabled = true;
      wheel.el.classList.remove('ready');
      buzz('boost');
      msg.className = 'msg';
      msg.textContent = '';
      let r: SpinResult;
      try {
        r = await api<SpinResult>('/spin', { body: { run_id: runId, device_id: deviceId() } });
      } catch {
        spin.disabled = false;
        back.disabled = next.disabled = false;
        msg.className = 'msg err';
        msg.textContent = 'No connection. Tap SPIN to try again.';
        return;
      }
      wheel.setSegments(r.segments);
      await wheel.spinTo(r.index);
      spun = r;
      local.addPrize({ code: r.code, name: r.prize_name, won_at: Date.now(), won: !!r.prize_id, nickname });
      back.disabled = next.disabled = false;
      if (!b.isConnected) return;
      // Straight to the prize screen as soon as the wheel stops.
      if (r.prize_id) {
        confetti(root, 180);
        buzz('win');
      } else buzz('thump');
      showPrize(b, r);
    };
    spin.addEventListener('click', doSpin);
    wheel.el.addEventListener('click', doSpin);
  };

  // --- navigation ---------------------------------------------------------------
  type Beat = { id: string; build: (b: HTMLElement) => void; skip?: () => boolean };
  const beats: Beat[] = [
    { id: 'score', build: beatScore },
    { id: 'board', build: beatBoard },
    { id: 'recipe', build: beatRecipe },
    { id: 'vote', build: beatVote, skip: () => !server || !server.vote_bonus_enabled || server.voted || local.voted },
    { id: 'cite', build: beatCite },
    { id: 'pain', build: beatPain },
    { id: 'email', build: beatEmail, skip: () => local.emailGiven },
    { id: 'spin', build: beatSpin },
  ];
  // History of the cards actually shown, so BACK returns to exactly what the player saw.
  const history: number[] = [];
  const show = (i: number, dir: 'fwd' | 'back') => {
    next.textContent = 'NEXT ▸';
    const fresh = el('div', `beat in-${dir}`);
    fresh.dataset.beat = beats[i].id;
    root.replaceChild(fresh, root.firstElementChild!);
    beats[i].build(fresh);
    seen.add(beats[i].id);
    back.hidden = history.length < 2;
    // Count every card already seen plus the ones still ahead, so the total does not jump around.
    const shown = beats.filter((b, n) => n === i || history.includes(n) || !b.skip?.());
    const pos = shown.indexOf(beats[i]);
    dots.innerHTML = '';
    shown.forEach((_, n) => dots.append(el('i', n < pos ? 'on' : n === pos ? 'on now' : '')));
    counter.textContent = `${pos + 1}/${shown.length}`;
  };
  const go = () => {
    let i = history.length ? history[history.length - 1] : -1;
    do i++;
    while (i < beats.length && beats[i].skip?.());
    if (i >= beats.length) {
      root.hidden = true;
      root.innerHTML = '';
      onPlayAgain();
      return;
    }
    history.push(i);
    buzz('tick');
    show(i, 'fwd');
  };
  const goBack = () => {
    if (history.length < 2) return;
    history.pop();
    buzz('tick');
    show(history[history.length - 1], 'back');
  };
  next.addEventListener('click', go);
  back.addEventListener('click', goBack);

  // Swipe between cards (not on the pain-point carousel, the wheel or form fields).
  let sx = 0;
  let sy = 0;
  let swipeOk = false;
  root.addEventListener('pointerdown', (e) => {
    const t = e.target as HTMLElement;
    swipeOk = !t.closest('.strip, .wheel-wrap, input, button, label, a');
    sx = e.clientX;
    sy = e.clientY;
  });
  root.addEventListener('pointerup', (e) => {
    if (!swipeOk || next.disabled) return;
    const dx = e.clientX - sx;
    const dy = e.clientY - sy;
    if (Math.abs(dx) < 60 || Math.abs(dy) > Math.abs(dx) * 0.7) return;
    // The last card's NEXT is PLAY AGAIN: a swipe must not start a run by accident.
    if (dx < 0 && history[history.length - 1] !== beats.length - 1) go();
    else if (dx > 0) goBack();
  });
  go();
}
