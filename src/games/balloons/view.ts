import { bindChrome, renderChrome, refreshMuteButton } from "../../shared/chrome";
import { sfx, unlockAudio } from "../../shared/audio";
import { loadJson, saveJson } from "../../shared/storage";
import { checkBalloonsScore, markPlayed } from "../../shared/achievements";
import { announceUnlocks } from "../../shared/toast";
import { burstAtElement } from "../../shared/fx";
import { pushHistory } from "../../shared/history";
import { maybeCompleteDaily } from "../../shared/dailyComplete";
import {
  hitBalloon,
  spawnBalloon,
  stepBalloons,
  type Balloon,
} from "./logic";
import "./balloons.css";

const BEST_KEY = "arcade-balloons-best";
const STREAK_MS = 1100;

type Phase = "ready" | "running" | "over";

export function renderBalloons(root: HTMLElement): void {
  markPlayed("balloons");
  let best = loadJson<number>(BEST_KEY, 0);
  let balloons: Balloon[] = [];
  let score = 0;
  let lives = 3;
  let streak = 0;
  let lastPopAt = 0;
  let phase: Phase = "ready";
  let raf = 0;
  let lastTs = 0;
  let spawnAcc = 0;

  root.innerHTML = `
    <div class="shell route-fade">
      ${renderChrome({ showBack: true })}
      <section class="panel">
        <h2>Balloon Pop</h2>
        <ol class="game-how">
          <li>Press <strong>Start</strong>, then tap balloons before they float away.</li>
          <li>Pop quickly to build a <strong>streak</strong> for bonus points.</li>
          <li>You lose a life for each balloon that escapes.</li>
        </ol>
        <div class="scoreboard">
          <span class="score-pill" data-score>Score 0</span>
          <span class="score-pill" data-lives>Lives 3</span>
          <span class="score-pill" data-best>Best ${best}</span>
        </div>
        <p class="status" data-status aria-live="polite">Press Start</p>
        <div class="balloons-wrap">
          <canvas class="balloons-canvas" width="360" height="480" aria-label="Balloon Pop"></canvas>
        </div>
        <div class="row" style="margin-top:1rem">
          <button class="btn btn-primary" type="button" data-again>Start</button>
        </div>
      </section>
    </div>
  `;

  bindChrome(root, () => refreshMuteButton(root));

  const canvas = root.querySelector<HTMLCanvasElement>(".balloons-canvas");
  const scoreEl = root.querySelector<HTMLElement>("[data-score]");
  const livesEl = root.querySelector<HTMLElement>("[data-lives]");
  const bestEl = root.querySelector<HTMLElement>("[data-best]");
  const statusEl = root.querySelector<HTMLElement>("[data-status]");
  const againBtn = root.querySelector<HTMLButtonElement>("[data-again]");

  const runningStatus = (): string => {
    if (streak >= 5) return `On fire · ${streak} streak!`;
    if (streak >= 2) return `${streak} streak!`;
    return "Tap the balloons!";
  };

  const syncHud = (): void => {
    if (scoreEl) scoreEl.textContent = `Score ${score}`;
    if (livesEl) livesEl.textContent = `Lives ${lives}`;
    if (bestEl) bestEl.textContent = `Best ${best}`;
    if (statusEl) {
      statusEl.textContent =
        phase === "ready"
          ? "Press Start or tap the board"
          : phase === "over"
            ? "Game over — tap to retry"
            : runningStatus();
    }
    if (againBtn) {
      againBtn.hidden = phase === "running";
      againBtn.textContent = phase === "ready" ? "Start" : "Retry run";
    }
  };

  const draw = (): void => {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const g = ctx.createLinearGradient(0, 0, 0, canvas.height);
    g.addColorStop(0, "#143038");
    g.addColorStop(1, "#071418");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (const b of balloons) {
      if (!b.alive) continue;
      ctx.fillStyle = b.color;
      ctx.beginPath();
      ctx.ellipse(b.x, b.y, b.r * 0.85, b.r, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(11,31,36,0.35)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(b.x, b.y + b.r * 0.9);
      ctx.lineTo(b.x, b.y + b.r * 1.6);
      ctx.stroke();
    }

    if (phase === "ready") {
      ctx.fillStyle = "rgba(232, 244, 241, 0.92)";
      ctx.font = "700 22px Syne, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Tap to start", canvas.width / 2, canvas.height * 0.48);
      ctx.font = "600 14px Outfit, sans-serif";
      ctx.fillStyle = "rgba(155, 184, 176, 0.95)";
      ctx.fillText("then tap balloons to pop", canvas.width / 2, canvas.height * 0.54);
    }
  };

  const stop = (): void => {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    lastTs = 0;
    spawnAcc = 0;
  };

  const gameOver = (): void => {
    phase = "over";
    stop();
    sfx.die();
    if (score > best) {
      best = score;
      saveJson(BEST_KEY, best);
    }
    pushHistory("Balloon Pop", `score ${score}`);
    maybeCompleteDaily("balloons", score);
    syncHud();
    draw();
  };

  const frame = (ts: number): void => {
    if (phase !== "running" || !canvas) return;
    if (!lastTs) lastTs = ts;
    const delta = ts - lastTs;
    lastTs = ts;
    spawnAcc += delta;

    while (spawnAcc > 900) {
      spawnAcc -= 900;
      balloons.push(spawnBalloon(canvas.width, canvas.height));
    }

    const { escaped } = stepBalloons(balloons);
    if (escaped > 0) {
      lives -= escaped;
      streak = 0;
      sfx.lose();
      if (lives <= 0) {
        lives = 0;
        draw();
        gameOver();
        return;
      }
    }

    balloons = balloons.filter((b) => b.alive);
    draw();
    syncHud();
    raf = requestAnimationFrame(frame);
  };

  const resetReady = (): void => {
    stop();
    balloons = [];
    score = 0;
    lives = 3;
    streak = 0;
    lastPopAt = 0;
    phase = "ready";
    syncHud();
    draw();
  };

  const beginRun = (): void => {
    if (!canvas) return;
    phase = "running";
    syncHud();
    balloons.push(spawnBalloon(canvas.width, canvas.height));
    draw();
    raf = requestAnimationFrame(frame);
  };

  const retry = (): void => {
    resetReady();
    beginRun();
  };

  canvas?.addEventListener(
    "pointerdown",
    (e) => {
      if (!canvas) return;
      e.preventDefault();
      unlockAudio();
      if (phase === "ready") {
        sfx.tap();
        beginRun();
        return;
      }
      if (phase === "over") {
        sfx.tap();
        retry();
        return;
      }
      if (phase !== "running") return;
      const rect = canvas.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * canvas.width;
      const y = ((e.clientY - rect.top) / rect.height) * canvas.height;
      const hit = hitBalloon(balloons, x, y);
      if (!hit) return;
      const now = performance.now();
      streak = now - lastPopAt <= STREAK_MS ? streak + 1 : 1;
      lastPopAt = now;
      score += streak >= 3 ? 2 : 1;
      sfx.eat();
      burstAtElement(canvas);
      announceUnlocks(checkBalloonsScore(score));
      maybeCompleteDaily("balloons", score);
      syncHud();
    },
    { passive: false },
  );

  againBtn?.addEventListener("click", () => {
    sfx.tap();
    unlockAudio();
    if (phase === "ready") beginRun();
    else retry();
  });

  const onKey = (e: KeyboardEvent): void => {
    if (e.code !== "Space" && e.key !== " ") return;
    e.preventDefault();
    unlockAudio();
    if (phase === "ready") beginRun();
    else if (phase === "over") retry();
  };
  window.addEventListener("keydown", onKey);

  const host = root as HTMLElement & { __balloonsCleanup?: () => void };
  host.__balloonsCleanup?.();
  host.__balloonsCleanup = () => {
    stop();
    window.removeEventListener("keydown", onKey);
  };

  resetReady();
}
