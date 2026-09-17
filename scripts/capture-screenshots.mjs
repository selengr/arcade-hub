import { mkdir } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "..", "docs", "screenshots");
const publicDir = join(__dirname, "..", "public");
const base = process.env.SHOT_BASE ?? "http://127.0.0.1:4173/arcade-hub/";
const chrome =
  process.env.CHROME_PATH ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const port = Number(process.env.SHOT_CDP_PORT ?? 9333);

/** Phone-wide frame so the game fills the shot (no empty side gutters). */
const VIEW_W = 420;
const VIEW_H = 900;

const shots = [
  {
    name: "hub",
    hash: "",
    clip: ".shell",
    hideHow: false,
    maxHeight: 640,
    prepare: async () => {},
  },
  {
    name: "snake",
    hash: "#/snake",
    clip: ".shell",
    prepare: async (page) => {
      await page.click("[data-start]");
      await sleep(200);
      await page.key("ArrowUp", "ArrowUp");
      await sleep(280);
      await page.key("ArrowLeft", "ArrowLeft");
      await sleep(500);
      await page.key("ArrowDown", "ArrowDown");
      await sleep(400);
    },
  },
  {
    name: "flappy",
    hash: "#/flappy",
    clip: ".shell",
    prepare: async (page) => {
      await page.click("[data-flap]");
      await sleep(200);
      await page.click("[data-flap]");
      await sleep(350);
      await page.click("[data-flap]");
      await sleep(250);
    },
  },
  {
    name: "breakout",
    hash: "#/breakout",
    clip: ".shell",
    prepare: async (page) => {
      await page.click("[data-again]");
      await sleep(700);
    },
  },
  {
    name: "balloons",
    hash: "#/balloons",
    clip: ".shell",
    prepare: async (page) => {
      await page.click("[data-again]");
      await sleep(4200);
    },
  },
  {
    name: "mole",
    hash: "#/mole",
    clip: ".shell",
    prepare: async (page) => {
      await page.click("[data-again]");
      await sleep(1100);
    },
  },
  {
    name: "reaction",
    hash: "#/reaction",
    clip: ".shell",
    prepare: async (page) => {
      for (let i = 0; i < 60; i++) {
        const label = await page.eval(
          `document.querySelector(".reaction-signal")?.textContent ?? ""`,
        );
        if (String(label).includes("GO")) {
          await sleep(40);
          return;
        }
        await sleep(80);
      }
      await page.eval(`(() => {
        const arena = document.querySelector(".reaction-arena");
        const signal = document.querySelector(".reaction-signal");
        const sub = document.querySelector(".reaction-sub");
        if (arena) arena.className = "reaction-arena go";
        if (signal) signal.textContent = "GO!";
        if (sub) sub.textContent = "Tap now!";
      })()`);
    },
  },
  {
    name: "tictactoe",
    hash: "#/tictactoe",
    clip: ".shell",
    prepare: async (page) => {
      await page.click('[data-cell="0"]');
      await sleep(450);
      await page.click('[data-cell="4"]');
      await sleep(450);
      await page.click('[data-cell="1"]');
      await sleep(450);
    },
  },
  {
    name: "memory",
    hash: "#/memory",
    clip: ".shell",
    prepare: async (page) => {
      await page.click('[data-index="0"]');
      await sleep(280);
      await page.click('[data-index="3"]');
      await sleep(180);
    },
  },
];

function attachCdp(ws) {
  let nextId = 1;
  const pending = new Map();
  const eventWaiters = new Map();

  ws.addEventListener("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(String(raw.data ?? raw));
    } catch {
      return;
    }
    if (msg.id != null && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(JSON.stringify(msg.error)));
      else resolve(msg.result);
      return;
    }
    if (msg.method && eventWaiters.has(msg.method)) {
      const list = eventWaiters.get(msg.method);
      for (const resolve of list) resolve(msg.params);
      eventWaiters.delete(msg.method);
    }
  });

  const send = (method, params = {}) => {
    const id = nextId++;
    ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
    });
  };

  const once = (method) =>
    new Promise((resolve) => {
      const list = eventWaiters.get(method) ?? [];
      list.push(resolve);
      eventWaiters.set(method, list);
    });

  return { send, once };
}

async function waitForChrome(maxMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (res.ok) return res.json();
    } catch {
      // keep waiting
    }
    await sleep(200);
  }
  throw new Error("Chrome CDP did not come up");
}

async function main() {
  await mkdir(outDir, { recursive: true });
  pkillPort();
  await sleep(500);

  const chromeProc = spawn(
    chrome,
    [
      "--headless=new",
      "--disable-gpu",
      "--hide-scrollbars",
      `--remote-debugging-port=${port}`,
      "--remote-allow-origins=*",
      `--user-data-dir=/tmp/arcade-hub-shots-${port}`,
      `--window-size=${VIEW_W},${VIEW_H}`,
      "about:blank",
    ],
    { stdio: "ignore" },
  );

  try {
    await waitForChrome();
    const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then(
      (r) => r.json(),
    );
    const pageTarget =
      targets.find((t) => t.type === "page" && t.webSocketDebuggerUrl) ??
      targets.find((t) => t.webSocketDebuggerUrl);
    if (!pageTarget?.webSocketDebuggerUrl) {
      throw new Error("No debuggable page target from Chrome");
    }

    const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.addEventListener("open", resolve);
      ws.addEventListener("error", reject);
    });
    const { send, once } = attachCdp(ws);

    await send("Page.enable");
    await send("Runtime.enable");
    await send("Emulation.setDeviceMetricsOverride", {
      width: VIEW_W,
      height: VIEW_H,
      deviceScaleFactor: 1,
      mobile: false,
    });

    const tidyUi = async (hideHow = true) => {
      await send("Runtime.evaluate", {
        expression: `(() => {
          document.querySelector("[data-dismiss-install]")?.click();
          document.querySelectorAll(".toast, [data-toast], .install-tip").forEach((el) => el.remove());
          ${hideHow ? `document.querySelectorAll(".game-how").forEach((el) => { el.style.display = "none"; });` : ""}
        })()`,
        returnByValue: true,
      });
    };

    const page = {
      async goto(url) {
        const loaded = once("Page.loadEventFired");
        await send("Page.navigate", { url });
        await Promise.race([loaded, sleep(4000)]);
        await sleep(700);
        await tidyUi();
      },
      async click(selector) {
        const result = await send("Runtime.evaluate", {
          expression: `(() => {
            const el = document.querySelector(${JSON.stringify(selector)});
            if (!el) throw new Error("missing " + ${JSON.stringify(selector)});
            el.click();
            return true;
          })()`,
          awaitPromise: true,
          returnByValue: true,
        });
        if (result?.exceptionDetails) {
          throw new Error(JSON.stringify(result.exceptionDetails));
        }
      },
      async key(key, code) {
        await send("Input.dispatchKeyEvent", {
          type: "keyDown",
          key,
          code,
          windowsVirtualKeyCode: 0,
        });
        await send("Input.dispatchKeyEvent", {
          type: "keyUp",
          key,
          code,
          windowsVirtualKeyCode: 0,
        });
      },
      async eval(expression) {
        const result = await send("Runtime.evaluate", {
          expression,
          returnByValue: true,
        });
        return result?.result?.value;
      },
      async screenshot(path, clipSelector, opts = {}) {
        await tidyUi(opts.hideHow !== false);
        let clip;
        if (clipSelector) {
          const maxH = opts.maxHeight ?? 0;
          const box = await page.eval(`(() => {
            const el = document.querySelector(${JSON.stringify(clipSelector)});
            if (!el) return null;
            const r = el.getBoundingClientRect();
            const pad = 8;
            let height = r.height + pad * 2;
            if (${maxH} > 0) height = Math.min(height, ${maxH});
            return {
              x: Math.max(0, r.x - pad),
              y: Math.max(0, r.y - pad),
              width: Math.min(window.innerWidth, r.width + pad * 2),
              height: Math.min(window.innerHeight - Math.max(0, r.y - pad), height),
            };
          })()`);
          if (box && box.width > 40 && box.height > 40) {
            clip = {
              x: Math.floor(box.x),
              y: Math.floor(box.y),
              width: Math.ceil(box.width),
              height: Math.ceil(box.height),
              scale: 1,
            };
          }
        }
        const params = { format: "png", fromSurface: true };
        if (clip) params.clip = clip;
        const { data } = await send("Page.captureScreenshot", params);
        await new Promise((resolve, reject) => {
          const stream = createWriteStream(path);
          stream.on("finish", resolve);
          stream.on("error", reject);
          stream.end(Buffer.from(data, "base64"));
        });
      },
    };

    for (const shot of shots) {
      const url = `${base}${shot.hash}`;
      console.log("open", url);
      await page.goto(url);
      try {
        await shot.prepare(page);
      } catch (err) {
        console.warn("prepare failed for", shot.name, err.message ?? err);
      }
      const path = join(outDir, `${shot.name}.png`);
      await page.screenshot(path, shot.clip, {
        hideHow: shot.hideHow,
        maxHeight: shot.maxHeight,
      });
      console.log("wrote", path);

      if (shot.name === "hub") {
        const ogPath = join(publicDir, "og.png");
        await send("Emulation.setDeviceMetricsOverride", {
          width: 1200,
          height: 630,
          deviceScaleFactor: 1,
          mobile: false,
        });
        await page.goto(base);
        await sleep(500);
        // Full-frame social card (no tall empty crop).
        const { data } = await send("Page.captureScreenshot", {
          format: "png",
          fromSurface: true,
        });
        await new Promise((resolve, reject) => {
          const stream = createWriteStream(ogPath);
          stream.on("finish", resolve);
          stream.on("error", reject);
          stream.end(Buffer.from(data, "base64"));
        });
        console.log("wrote", ogPath);
        await send("Emulation.setDeviceMetricsOverride", {
          width: VIEW_W,
          height: VIEW_H,
          deviceScaleFactor: 1,
          mobile: false,
        });
      }
    }

    ws.close();
  } finally {
    chromeProc.kill("SIGTERM");
  }
}

function pkillPort() {
  spawnSync("pkill", ["-f", `remote-debugging-port=${port}`], {
    stdio: "ignore",
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
