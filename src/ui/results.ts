// The results flow: six short beats in a fixed order, one per screen.
import { SCORING } from '../config';
import { dishById } from '../content/dishes';
import { PAIN_POINTS } from '../content/painpoints';
import { QUESTIONS } from '../game/gateDirector';
import type { RunResult } from '../game/sim/RunSim';
import { ApiError, api, type RankInfo, type SpinResult, type SubmitResult } from '../net/api';
import { deviceId, local } from '../net/device';
import { onOutcome, type Outcome } from '../net/submitQueue';
import QRCode from 'qrcode';
import { confetti } from './confetti';
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
  const dots = el('div', 'dots');
  const next = el('button', 'btn', 'NEXT ▸');
  next.type = 'button';
  next.id = 'next';
  root.append(holder, dots, next);

  // --- beat 1: score, rank, confetti -----------------------------------------
  const beatScore = (b: HTMLElement) => {
    const served = run.reason === 'served';
    b.append(el('h2', '', served ? 'DISH SERVED!' : run.reason === 'timeup' ? "TIME'S UP!" : 'RUN OVER'));
    const plate = el('div', `plate${served ? ' served' : ''}`);
    plate.append(el('span', 'plate-emoji', dish.emoji), el('span', 'plate-name', served ? `Ah Ma's ${dish.name}` : dish.name));
    const line = el(
      'div',
      'sub',
      served
        ? `All ${SCORING.RECIPE_STEPS} steps decoded. Ah Ma would be proud.`
        : `Recovered ${run.recovered}/${SCORING.RECIPE_STEPS} steps. Ah Ma says: try again lah.`,
    );
    const big = el('div', 'big-score', '0');
    big.id = 'final-score';
    const stats = el('div', 'stats');
    stats.append(el('span', '', `✔ ${run.correct}/${run.gates}`), el('span', '', `🔥 streak ${run.bestStreak}`));
    if (run.coins) {
      const coins = el('span', '', ` ${run.coins}`);
      coins.prepend(el('i', 'coin')); // drawn coin: the coin emoji is missing on older phones
      stats.append(coins);
    }
    if (run.bonus) stats.append(el('span', '', `🍽 +${run.bonus}`));
    const status = el('div', 'saving', 'Saving your score...');
    status.id = 'rank-status';
    b.append(plate, line, big, stats, status);
    if (served) confetti(root, 120);

    const t0 = performance.now();
    const tick = (now: number) => {
      const k = Math.min((now - t0) / 1100, 1);
      big.textContent = String(Math.floor(run.score * (1 - Math.pow(1 - k, 3))));
      if (k < 1 && big.isConnected) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);

    whenOutcome((o) => {
      if (!status.isConnected) return;
      if (!o.ok) {
        status.className = 'sub';
        status.textContent = REJECT_TEXT[o.code] ?? REJECT_TEXT.implausible;
        return;
      }
      const r = o.result;
      const box = el('div', 'beat');
      box.style.flex = 'none';
      box.id = 'rank-box';
      if (r.rank === 1) box.append(el('div', 'king', '👑 KING OF THE HILL'));
      else if (r.is_best && r.rank !== null && r.rank <= 10) box.append(el('div', 'king', '⭐ NEW TOP 10!'));
      box.append(el('div', 'rank', `You're #${r.rank}`));
      if (r.beat_count > 0) {
        box.append(el('div', 'beatline', `You beat ${r.beat_count} player${r.beat_count === 1 ? '' : 's'}`));
      }
      if (!r.is_best && r.score !== null) box.append(el('div', 'sub', `Your best is still ${r.score}`));
      status.replaceWith(box);
      const top10 = r.rank !== null && r.rank <= 10;
      confetti(root, r.rank === 1 ? 220 : top10 && r.is_best ? 150 : 60);
    });
  };

  // --- beat 1b: the recipe, decoded ---------------------------------------------
  const beatRecipe = (b: HTMLElement) => {
    b.append(el('h2', '', run.recovered ? 'WHAT PRISM DECODED' : "AH MA'S NOTES"));
    const list = el('ol', 'recipe-list');
    dish.steps.forEach((s, i) => {
      const got = i < run.recovered;
      const li = el('li', got ? 'got' : 'locked');
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
    const label = el('label', 'check');
    const box = el('input');
    box.type = 'checkbox';
    box.id = 'vote';
    label.append(box, el('span', '', 'I voted for the PRISM team'));
    const pct = Math.round(((server?.vote_bonus_multiplier ?? 1.1) - 1) * 100);
    const note = el('p', 'sub', `Tick it for a ${pct}% score bonus. We trust you.`);
    const msg = el('div', 'msg');
    b.append(label, note, msg);
    box.addEventListener('change', async () => {
      box.disabled = true;
      msg.className = 'msg';
      msg.textContent = 'Saving...';
      try {
        const r = await api<RankInfo>('/vote', { body: { device_id: deviceId(), voted: box.checked } });
        local.voted = box.checked;
        msg.textContent = box.checked ? `Bonus applied! Score ${r.score}. You're #${r.rank}.` : `Bonus removed. You're #${r.rank}.`;
        if (box.checked) confetti(root, 40);
      } catch {
        box.checked = !box.checked;
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
    card.append(
      el('div', 'who', '◆ PRISM'),
      el('div', 'you', `You asked: ${q.q}`),
      el('div', 'ans', q.explain),
      el('div', 'src', `Source: ${q.citation}`),
    );
    b.append(card, el('p', 'sub', 'Every PRISM answer shows where it came from.'));
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
    b.append(strip, el('div', 'hint-swipe', '◂ swipe for more ▸'));
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
    b.append(input, consentLabel, notice, send, msg);
    next.textContent = 'SKIP ▸';
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
  const beatSpin = (b: HTMLElement) => {
    b.append(el('h2', '', 'SPIN TO WIN'));
    const wheel = new Wheel(server?.wheel?.length ? server.wheel : [FALLBACK_SEGMENT]);
    const spin = el('button', 'btn', 'SPIN!');
    spin.type = 'button';
    spin.id = 'spin';
    spin.disabled = true;
    const msg = el('div', 'msg', 'Waiting for your score to save...');
    b.append(wheel.el, spin, msg);
    next.textContent = 'PLAY AGAIN';

    whenOutcome((o) => {
      if (!o.ok) {
        msg.textContent = 'No spin for this run. Play again!';
        return;
      }
      wheel.setSegments(o.result.wheel.length ? o.result.wheel : [FALLBACK_SEGMENT]);
      msg.textContent = '';
      spin.disabled = false;
    });

    spin.addEventListener('click', async () => {
      spin.disabled = true;
      msg.className = 'msg';
      msg.textContent = '';
      let r: SpinResult;
      try {
        r = await api<SpinResult>('/spin', { body: { run_id: runId, device_id: deviceId() } });
      } catch {
        spin.disabled = false;
        msg.className = 'msg err';
        msg.textContent = 'No connection. Tap SPIN to try again.';
        return;
      }
      wheel.setSegments(r.segments);
      await wheel.spinTo(r.index);
      if (!b.isConnected) return;
      const earlier = local.prizes.filter((p) => p.code !== r.code);
      local.addPrize({ code: r.code, name: r.prize_name, won_at: Date.now() });
      if (r.prize_id) confetti(root, 160);
      b.innerHTML = '';
      b.append(el('h2', '', r.prize_id ? 'YOU WON!' : 'SO CLOSE!'), redeemCard(r, nickname));
      if (earlier.length) {
        b.append(el('div', 'old-prizes', `Earlier codes: ${earlier.map((p) => `${p.code} (${p.name})`).join(', ')}`));
      }
    });
  };

  // --- navigation ---------------------------------------------------------------
  type Beat = { id: string; build: (b: HTMLElement) => void; skip?: () => boolean };
  const beats: Beat[] = [
    { id: 'score', build: beatScore },
    { id: 'recipe', build: beatRecipe },
    { id: 'vote', build: beatVote, skip: () => !server || !server.vote_bonus_enabled || server.voted || local.voted },
    { id: 'cite', build: beatCite },
    { id: 'pain', build: beatPain },
    { id: 'email', build: beatEmail, skip: () => local.emailGiven },
    { id: 'spin', build: beatSpin },
  ];
  let index = -1;
  const go = () => {
    do index++;
    while (index < beats.length && beats[index].skip?.());
    if (index >= beats.length) {
      root.hidden = true;
      root.innerHTML = '';
      onPlayAgain();
      return;
    }
    next.textContent = 'NEXT ▸';
    const fresh = el('div', 'beat');
    fresh.dataset.beat = beats[index].id;
    root.replaceChild(fresh, root.firstElementChild!);
    beats[index].build(fresh);
    dots.innerHTML = '';
    beats.forEach((_, i) => dots.append(el('i', i <= index ? 'on' : '')));
  };
  next.addEventListener('click', go);
  go();
}

function redeemCard(r: SpinResult, nickname: string): HTMLElement {
  const card = el('div', 'redeem');
  card.id = 'redeem';
  const live = el('div', 'live');
  const clock = el('span');
  live.append(el('i'), clock);
  const tick = () => {
    clock.textContent = `LIVE ${new Date().toLocaleTimeString('en-GB')}`;
    if (card.isConnected || !clock.textContent) setTimeout(tick, 1000);
  };
  setTimeout(tick, 0);
  clock.textContent = `LIVE ${new Date().toLocaleTimeString('en-GB')}`;
  const small = el('small', '', `${nickname} · show this screen to booth staff`);
  // QR of the code, so staff can scan it instead of typing (where their phone supports it).
  const qr = el('canvas', 'qr');
  void QRCode.toCanvas(qr, r.code, { width: 96, margin: 0, color: { dark: '#1b1b2f', light: '#fff6e0' } }).catch(() => qr.remove());
  card.append(el('div', 'prize', r.prize_name), el('div', 'code', r.code), qr, live, small);
  return card;
}
