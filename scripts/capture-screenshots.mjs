import { mkdir } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "..", "docs", "screenshots");
const publicDir = join(__dirname, "..", "public");
const base = process.env.SHOT_BASE ?? "http://127.0.0.1:4173/arcade-hub/";
const chrome =
  process.env.CHROME_PATH ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const port = Number(process.env.SHOT_CDP_PORT ?? 9333);

const shots = [
  { name: "hub", hash: "", prepare: async () => {} },
  {
    name: "snake",
    hash: "#/snake",
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
    prepare: async (page) => {
      await page.click("[data-again]");
      await sleep(700);
    },
  },
  {
    name: "balloons",
    hash: "#/balloons",
    prepare: async (page) => {
      await page.click("[data-again]");
      await sleep(4200);
    },
  },
  {
    name: "mole",
    hash: "#/mole",
    prepare: async (page) => {
      await page.click("[data-again]");
      await sleep(1100);
    },
  },
  {
    name: "reaction",
    hash: "#/reaction",
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

  const chromeProc = spawn(
    chrome,
    [
      "--headless=new",
      "--disable-gpu",
      "--hide-scrollbars",
      `--remote-debugging-port=${port}`,
      "--remote-allow-origins=*",
      `--user-data-dir=/tmp/arcade-hub-shots-${port}`,
      "--window-size=900,1400",
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
      width: 900,
      height: 1400,
      deviceScaleFactor: 1,
      mobile: false,
    });

    const page = {
      async goto(url) {
        const loaded = once("Page.loadEventFired");
        await send("Page.navigate", { url });
        await Promise.race([loaded, sleep(4000)]);
        await sleep(800);
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
      async screenshot(path) {
        const { data } = await send("Page.captureScreenshot", {
          format: "png",
          fromSurface: true,
        });
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
      await page.screenshot(path);
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
        await sleep(600);
        await page.screenshot(ogPath);
        console.log("wrote", ogPath);
        await send("Emulation.setDeviceMetricsOverride", {
          width: 900,
          height: 1400,
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

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
