import { setRoute, type Route } from "../shared/router";
import { bindChrome, renderChrome } from "../shared/chrome";
import { unlockAudio, sfx } from "../shared/audio";
import { getSettings, setFlappyDiff } from "../shared/settings";
import {
  getDailyChallenge,
  isDailyDone,
  startDailyRun,
} from "../shared/daily";
import { formatWhen, getHistory } from "../shared/history";
import { routeFromHistoryTitle } from "../shared/historyRoutes";
import { parseFlappyDiff } from "../games/flappy/logic";
import { ACHIEVEMENTS, unlockedIds } from "../shared/achievements";
import {
  dismissInstallTip,
  shouldShowInstallTip,
} from "../shared/installTip";
import { getHubBests } from "../shared/bests";

const games: Array<{
  route: Exclude<Route, "hub">;
  title: string;
  blurb: string;
  tone: string;
}> = [
  { route: "snake", title: "Snake", blurb: "Press Start, then steer and eat.", tone: "tone-lime" },
  { route: "flappy", title: "Flappy Lite", blurb: "Press Flap to stay up. Fly through gaps.", tone: "tone-teal" },
  { route: "breakout", title: "Breakout", blurb: "Press Start, then bounce the ball.", tone: "tone-coral" },
  { route: "balloons", title: "Balloon Pop", blurb: "Press Start, then tap balloons to pop.", tone: "tone-teal" },
  { route: "mole", title: "Whack-a-Mole", blurb: "Press Start — then tap moles for 30s.", tone: "tone-gold" },
  { route: "reaction", title: "Reaction Duel", blurb: "Wait for GO. Beat the rival.", tone: "tone-coral" },
  { route: "tictactoe", title: "Tic-Tac-Toe", blurb: "You are X. Beat the AI.", tone: "tone-foam" },
  { route: "memory", title: "Memory", blurb: "Flip cards. Match the pairs.", tone: "tone-lime" },
];

const labels: Record<Exclude<Route, "hub">, string> = {
  snake: "Snake",
  flappy: "Flappy Lite",
  breakout: "Breakout",
  balloons: "Balloon Pop",
  mole: "Whack-a-Mole",
  reaction: "Reaction Duel",
  tictactoe: "Tic-Tac-Toe",
  memory: "Memory",
};

function badgesStripHtml(): string {
  const unlocked = new Set(unlockedIds());
  const count = unlocked.size;
  const total = ACHIEVEMENTS.length;
  const ordered = [
    ...ACHIEVEMENTS.filter((a) => unlocked.has(a.id)),
    ...ACHIEVEMENTS.filter((a) => !unlocked.has(a.id)),
  ];

  return `
    <section class="panel badge-strip" aria-label="Badges">
      <div class="badge-strip-head">
        <h2>Badges</h2>
        <span class="count">${count}/${total}</span>
      </div>
      ${
        count === 0
          ? `<p class="badge-empty">Play to unlock badges — they show up here.</p>`
          : ""
      }
      <div class="badge-rail">
        ${ordered
          .map(
            (a) => `
          <div class="badge-chip ${unlocked.has(a.id) ? "on" : ""}" title="${a.detail}">
            <strong>${a.title}</strong>
            <span>${a.detail}</span>
          </div>`,
          )
          .join("")}
      </div>
    </section>
  `;
}

function bestsRowHtml(): string {
  const bests = getHubBests();
  if (!bests.length) return "";
  return `
    <section class="panel bests-row" aria-label="Best scores">
      <div class="badge-strip-head">
        <h2>Best scores</h2>
        <span class="count">Tap to replay</span>
      </div>
      <div class="bests-rail">
        ${bests
          .map(
            (b) => `
          <button class="best-chip" type="button" data-best-route="${b.route}">
            <span>${b.label}</span>
            <strong>${b.value}</strong>
          </button>`,
          )
          .join("")}
      </div>
    </section>
  `;
}

export function renderHub(root: HTMLElement): void {
  const lastGame = getSettings().lastGame;
  const daily = getDailyChallenge();
  const dailyDone = isDailyDone();
  const recent = getHistory().slice(0, 5);
  const showInstall = shouldShowInstallTip();

  root.innerHTML = `
    <div class="shell route-fade">
      ${renderChrome({ showBack: false, showBrand: false })}
      <header class="hero">
        <h1>Arcade Hub</h1>
        <p>Eight focused games. Pick one and play.</p>
        ${
          lastGame
            ? `<div class="row hero-actions">
                <button class="btn btn-ghost" type="button" data-continue>Continue</button>
              </div>`
            : ""
        }
      </header>

      <section class="panel daily-card" aria-label="Daily challenge">
        <span class="daily-status">${dailyDone ? "Done for today" : "Today's quest"}</span>
        <h2>${labels[daily.game]}</h2>
        <p class="hint">${daily.detail}</p>
        <div class="row">
          <button class="btn ${dailyDone ? "btn-ghost" : "btn-primary"}" type="button" data-daily ${dailyDone ? "disabled" : ""}>
            ${dailyDone ? "Tomorrow" : "Play today's"}
          </button>
        </div>
      </section>

      ${bestsRowHtml()}
      ${badgesStripHtml()}

      <section class="game-grid" aria-label="Games">
        ${games
          .map(
            (game) => `
          <button class="game-card ${game.tone}" type="button" data-route="${game.route}">
            <h2>${game.title}</h2>
            <p>${game.blurb}</p>
          </button>
        `,
          )
          .join("")}
      </section>

      ${
        recent.length
          ? `<section class="panel recent-plays" aria-label="Recent plays">
              <h2>Recent plays</h2>
              <p class="hint">Tap a row to play again.</p>
              <ul class="history-list">
                ${recent
                  .map((entry) => {
                    const route = routeFromHistoryTitle(entry.game);
                    if (!route) {
                      return `
                  <li class="history-static">
                    <span><strong>${entry.game}</strong> · ${entry.summary}</span>
                    <span class="when">${formatWhen(entry.at)}</span>
                  </li>`;
                    }
                    return `
                  <li>
                    <button class="history-replay" type="button" data-replay="${route}" data-summary="${entry.summary.replace(/"/g, "&quot;")}">
                      <span><strong>${entry.game}</strong> · ${entry.summary}</span>
                      <span class="when">${formatWhen(entry.at)}</span>
                    </button>
                  </li>`;
                  })
                  .join("")}
              </ul>
            </section>`
          : ""
      }

      ${
        showInstall
          ? `<p class="install-tip" role="note">
              <span>Tip: Add to Home Screen from your browser menu for a full-screen arcade.</span>
              <button class="btn btn-ghost" type="button" data-dismiss-tip>Got it</button>
            </p>`
          : ""
      }
    </div>
  `;

  bindChrome(root, () => renderHub(root));

  root.querySelector("[data-continue]")?.addEventListener("click", () => {
    if (!lastGame) return;
    unlockAudio();
    sfx.tap();
    setRoute(lastGame);
  });

  root.querySelector("[data-daily]")?.addEventListener("click", () => {
    if (dailyDone) return;
    unlockAudio();
    sfx.tap();
    startDailyRun();
    setRoute(daily.game);
  });

  root.querySelector("[data-dismiss-tip]")?.addEventListener("click", () => {
    dismissInstallTip();
    sfx.tap();
    renderHub(root);
  });

  root.querySelectorAll<HTMLButtonElement>("[data-route]").forEach((btn) => {
    btn.addEventListener("click", () => {
      unlockAudio();
      sfx.tap();
      const route = btn.dataset.route as Exclude<Route, "hub">;
      setRoute(route);
    });
  });

  root.querySelectorAll<HTMLButtonElement>("[data-best-route]").forEach((btn) => {
    btn.addEventListener("click", () => {
      unlockAudio();
      sfx.tap();
      const route = btn.dataset.bestRoute as Exclude<Route, "hub">;
      setRoute(route);
    });
  });

  root.querySelectorAll<HTMLButtonElement>("[data-replay]").forEach((btn) => {
    btn.addEventListener("click", () => {
      unlockAudio();
      sfx.tap();
      const route = btn.dataset.replay as Exclude<Route, "hub">;
      if (route === "flappy") {
        const diff = parseFlappyDiff(btn.dataset.summary ?? "");
        if (diff) setFlappyDiff(diff);
      }
      setRoute(route);
    });
  });
}
