import { writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, "..", "public");
const chrome =
  process.env.CHROME_PATH ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const port = Number(process.env.ICON_PORT ?? 8765);

const html = `<!DOCTYPE html><html><head><style>
html,body{margin:0;width:512px;height:512px;background:#0b1f24;overflow:hidden}
svg{display:block;width:512px;height:512px}
</style></head><body>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none">
  <rect width="64" height="64" rx="14" fill="#0b1f24"/>
  <path d="M14 34h8v8h-8v-8zm10-10h8v18h-8V24zm10 6h8v12h-8V30zm10-14h8v26h-8V16z" fill="#c8f542"/>
  <circle cx="48" cy="18" r="4" fill="#ff6b4a"/>
</svg>
</body></html>`;

await mkdir(publicDir, { recursive: true });
const htmlPath = join(publicDir, "_icon-source.html");
await writeFile(htmlPath, html);

const server = spawn(
  "python3",
  ["-m", "http.server", String(port), "--directory", publicDir],
  { stdio: "ignore" },
);

try {
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/_icon-source.html`);
      if (res.ok) break;
    } catch {
      // waiting
    }
    await sleep(100);
  }

  const out512 = join(publicDir, "icon-512.png");
  const shot = spawnSync(
    chrome,
    [
      "--headless=new",
      "--disable-gpu",
      "--hide-scrollbars",
      "--window-size=512,512",
      `--screenshot=${out512}`,
      `http://127.0.0.1:${port}/_icon-source.html`,
    ],
    { encoding: "utf8" },
  );
  if (shot.status !== 0 || !existsSync(out512)) {
    console.error(shot.stderr || shot.stdout || "screenshot failed");
    process.exit(1);
  }

  const out192 = join(publicDir, "icon-192.png");
  const out180 = join(publicDir, "apple-touch-icon.png");
  spawnSync("sips", ["-z", "192", "192", out512, "--out", out192], {
    encoding: "utf8",
  });
  spawnSync("sips", ["-z", "180", "180", out512, "--out", out180], {
    encoding: "utf8",
  });

  console.log("wrote", out512);
  console.log("wrote", out192);
  console.log("wrote", out180);
} finally {
  server.kill("SIGTERM");
  try {
    await import("node:fs/promises").then((fs) => fs.unlink(htmlPath));
  } catch {
    // ignore
  }
}
