# Arcade Hub

A tiny arcade in the browser. Eight short games, no accounts — scores stay on your device.

Play it here: https://selengr.github.io/arcade-hub/

## What’s inside

- **Snake** — eat the dots, don’t crash
- **Flappy Lite** — flap through the gaps
- **Breakout** — bounce the ball, clear the bricks
- **Balloon Pop** — tap balloons before they float off
- **Whack-a-Mole** — 30 seconds, hit the moles
- **Reaction Duel** — wait for GO, beat the rival
- **Tic-Tac-Toe** — you are X, beat the AI
- **Memory** — flip cards, match the pairs

Mute, a daily quest, badges, best scores, and recent plays all sit on the home screen. You can add it to your phone’s home screen too.

## Pictures

Home:

<p align="center">
  <img src="docs/screenshots/hub.png" width="320" alt="Arcade Hub home" />
</p>

| Snake | Flappy Lite |
| :---: | :---: |
| <img src="docs/screenshots/snake.png" width="240" alt="Snake — steer and eat" /><br/>Steer and eat | <img src="docs/screenshots/flappy.png" width="240" alt="Flappy Lite — flap through pipes" /><br/>Flap through pipes |

| Breakout | Balloon Pop |
| :---: | :---: |
| <img src="docs/screenshots/breakout.png" width="240" alt="Breakout — clear the bricks" /><br/>Clear the bricks | <img src="docs/screenshots/balloons.png" width="240" alt="Balloon Pop — tap balloons" /><br/>Tap the balloons |

| Whack-a-Mole | Reaction Duel |
| :---: | :---: |
| <img src="docs/screenshots/mole.png" width="240" alt="Whack-a-Mole — hit moles" /><br/>Hit moles for 30s | <img src="docs/screenshots/reaction.png" width="240" alt="Reaction Duel — tap on GO" /><br/>Tap on GO |

| Tic-Tac-Toe | Memory |
| :---: | :---: |
| <img src="docs/screenshots/tictactoe.png" width="240" alt="Tic-Tac-Toe — beat the AI" /><br/>Beat the AI | <img src="docs/screenshots/memory.png" width="240" alt="Memory — match pairs" /><br/>Match the pairs |

## Run it locally

```bash
npm install
npm run dev
```

## Tests

```bash
npm test
```

## Build

```bash
npm run build
npm run preview
```

## Fresh screenshots

```bash
npm run build
npx vite preview --host 127.0.0.1 --port 4173
# other terminal:
node scripts/capture-screenshots.mjs
```

```bash
node scripts/make-icons.mjs
```

## Deploy

Push to `main`. GitHub Actions builds and publishes GitHub Pages.

Repo settings → Pages → Source → **GitHub Actions**.
