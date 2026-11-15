// The results flow: a handful of short beats in a fixed order, one per screen.
import { SCORING } from '../config';
import { dishById } from '../content/dishes';
import { PAIN_POINTS } from '../content/painpoints';
import { QUESTIONS } from '../game/gateDirector';
import { buzz } from '../game/haptics';
import { reducedMotion } from '../game/perf';
import type { RunResult } from '../game/sim/RunSim';
import { ApiError, api, type RankInfo, type SubmitResult } from '../net/api';
import { deviceId, local } from '../net/device';
import { onOutcome, type Outcome } from '../net/submitQueue';
import { confetti } from './confetti';
import { mountLeaderboard } from './leaderboard';
import { renderThanks } from './thanks';

/** Lucky-draw entries are for IRAS staff only. The server checks this again. */
const IRAS_EMAIL = /^[^\s@]+@iras\.gov\.sg$/i;

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
  const back = el('button', 'pix-btn pix-btn--cream btn btn-back', '◂');
  back.type = 'button';
  back.id = 'back';
  back.setAttribute('aria-label', 'Back');
  const next = el('button', 'pix-btn btn', 'NEXT ▸');
  next.type = 'button';
  next.id = 'next';
  nav.append(back, next);
  root.append(holder, progress, nav);

  // Cards remember what already happened, so going back never replays or repeats anything.
  const seen = new Set<string>();

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

  // --- beat 5: lucky draw (IRAS email + optional feedback) ---------------------
  const beatEmail = (b: HTMLElement) => {
    b.append(el('div', 'draw-ticket', '☕'));
    const lead = el('h2', 'draw-lead', 'Stand a chance to win a $10 Starbucks gift card!');
    lead.append(el('small', '', 'Fill in your IRAS email to enter the lucky draw.'));
    const input = el('input', 'field');
    input.type = 'email';
    input.id = 'email';
    input.placeholder = 'you@iras.gov.sg';
    input.autocomplete = 'email';
    input.autocapitalize = 'none';
    input.spellcheck = false;
    const label = el('label', 'field-label', 'Optional: how can PRISM benefit you?');
    label.htmlFor = 'feedback';
    const feedback = el('textarea', 'field');
    feedback.id = 'feedback';
    feedback.maxLength = 500;
    feedback.placeholder = "We'd love to explore deploying PRISM and sharing it with more users. Tell us how it could help you.";
    const notice = el('p', 'notice', 'Only @iras.gov.sg emails. Used only for the lucky draw and to follow up on your feedback.');
    const send = el('button', 'pix-btn btn', 'ENTER THE DRAW');
    send.type = 'button';
    send.id = 'email-send';
    const msg = el('div', 'msg');
    b.append(lead, input, label, feedback, send, msg, notice);
    next.textContent = 'SKIP ▸';
    const finish = () => {
      local.emailGiven = true;
      buzz('correct');
      go();
    };
    send.addEventListener('click', async () => {
      const email = input.value.trim();
      if (!IRAS_EMAIL.test(email)) {
        msg.className = 'msg err';
        msg.textContent = 'Please use your @iras.gov.sg email.';
        return;
      }
      send.disabled = true;
      msg.className = 'msg';
      msg.textContent = '';
      try {
        await api('/email', { body: { device_id: deviceId(), email, message: feedback.value.trim() } });
        finish();
      } catch (e) {
        send.disabled = false;
        msg.className = 'msg err';
        const code = e instanceof ApiError ? e.code : '';
        if (code === 'already_entered') finish(); // this device is already in the draw: just carry on
        else if (code === 'email_taken') msg.textContent = 'That email is already in the draw.';
        else if (code === 'bad_email') msg.textContent = 'Please use your @iras.gov.sg email.';
        else if (code === 'no_player' || code === 'unknown_device') msg.textContent = 'Your score is still saving. Try again in a moment.';
        else msg.textContent = "Couldn't save that. Try again.";
      }
    });
  };

  // Set by cards that own a backdrop or loop; called whenever the card is replaced or the screen closes.
  let leaveCard: (() => void) | null = null;

  // --- beat 6: thank you -------------------------------------------------------
  const beatThanks = (b: HTMLElement) => {
    next.textContent = 'PLAY AGAIN';
    leaveCard = renderThanks(b, root, { entered: local.emailGiven || !!server?.entered, first: !seen.has('thanks') });
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
    { id: 'email', build: beatEmail, skip: () => local.emailGiven || !!server?.entered },
    { id: 'thanks', build: beatThanks },
  ];
  // History of the cards actually shown, so BACK returns to exactly what the player saw.
  const history: number[] = [];
  const show = (i: number, dir: 'fwd' | 'back') => {
    next.textContent = 'NEXT ▸';
    leaveCard?.();
    leaveCard = null;
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
      leaveCard?.();
      leaveCard = null;
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

  // Swipe between cards (not on the pain-point carousel or form fields).
  let sx = 0;
  let sy = 0;
  let swipeOk = false;
  root.addEventListener('pointerdown', (e) => {
    const t = e.target as HTMLElement;
    swipeOk = !t.closest('.strip, input, textarea, button, label, a');
    sx = e.clientX;
    sy = e.clientY;
  });
  root.addEventListener('pointerup', (e) => {
    if (!swipeOk || next.disabled) return;
    const dx = e.clientX - sx;
    const dy = e.clientY - sy;
    if (Math.abs(dx) < 60 || Math.abs(dy) > Math.abs(dx) * 0.7) return;
    // The last card's NEXT is PLAY AGAIN (back to the home screen): a swipe must not start a run by accident.
    if (dx < 0 && history[history.length - 1] !== beats.length - 1) go();
    else if (dx > 0) goBack();
  });
  go();
}
