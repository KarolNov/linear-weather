/**
 * Records the README's demo GIF: the demo board in a storm, every Rebalance move made, and the
 * forecast clearing. Needs `pnpm dev:web` running and Playwright's Chromium
 * (`pnpm --filter web exec playwright install chromium`), plus ffmpeg on the PATH.
 *
 *   pnpm --filter web demo-gif [out.gif]
 *
 * The demo's numbers come from its `lw_demo` cookie, so this starts from a fresh browser context.
 * It records with reduced motion, which stills the sky.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium, type Page } from "playwright";

const base = process.env.BOARD_URL ?? "http://localhost:5173";
const out = resolve(process.argv[2] ?? "../docs/demo.gif");
const size = { width: 1200, height: 800 };

const videoDir = mkdtempSync(join(tmpdir(), "demo-gif-"));
const browser = await chromium.launch();
try {
  const context = await browser.newContext({
    viewport: size,
    colorScheme: "light",
    // Still rain and lightning: every frame they move adds to the GIF, and the board reads better.
    reducedMotion: "reduce",
    recordVideo: { dir: videoDir, size },
  });
  const page = await context.newPage();
  const recording = Date.now();
  await page.goto(`${base}/?demo=true`);
  await page.getByRole("button", { name: /^Rebalance/ }).waitFor();
  // The clip starts once the board is up, not on the blank page before it.
  const start = String((Date.now() - recording) / 1000 + 0.5);
  await pause(page, 2500);

  await page.getByRole("button", { name: /^Rebalance/ }).click();
  await pause(page, 2500);

  // Today's moves, all at once.
  await page.getByRole("button", { name: "Make all of today's moves" }).click();
  await pause(page, 1500);
  await page.getByRole("button", { name: "Make them" }).click();
  await page
    .getByRole("button", { name: "Make all of today's moves" })
    .waitFor({ state: "detached" });
  await pause(page, 2000);

  // Then the ones ahead of the storm, one at a time, as the board plans again after each.
  const handOver = page
    .getByRole("region", { name: "Before the storm" })
    .getByRole("button", { name: /^Hand / });
  for (let made = 0; made < 10 && (await handOver.count()) > 0; made++) {
    const button = handOver.first();
    const label = await button.getAttribute("aria-label");
    await button.scrollIntoViewIfNeeded();
    await pause(page, 700);
    await button.click();
    await page.getByRole("button", { name: label ?? "" }).waitFor({ state: "detached" });
    await pause(page, 900);
  }
  await pause(page, 1500);

  await page.getByRole("button", { name: "Close", exact: true }).click();
  // Back to everyone's forecast strips, now that the work is spread out.
  await page.mouse.wheel(0, -10_000);
  await pause(page, 4000);

  await context.close();
  const video = await page.video()?.path();
  if (!video) throw new Error("Playwright recorded no video");
  // Two passes: build a palette from the whole clip, then use it, so the sky's gradient stays smooth.
  const filters = "fps=6,scale=900:-1:flags=lanczos";
  const palette = join(videoDir, "palette.png");
  execFileSync(
    "ffmpeg",
    [
      "-y",
      "-ss",
      start,
      "-i",
      video,
      "-vf",
      `${filters},palettegen=stats_mode=diff`,
      "-update",
      "1",
      palette,
    ],
    {
      stdio: "inherit",
    },
  );
  execFileSync(
    "ffmpeg",
    [
      "-y",
      "-ss",
      start,
      "-i",
      video,
      "-i",
      palette,
      "-lavfi",
      `${filters}[x];[x][1:v]paletteuse=dither=none:diff_mode=rectangle`,
      out,
    ],
    { stdio: "inherit" },
  );
  console.log(`Wrote ${out}`);
} finally {
  await browser.close();
  rmSync(videoDir, { recursive: true, force: true });
}

/** Holds the frame long enough to read, and lets animations finish. */
function pause(page: Page, ms: number) {
  return page.waitForTimeout(ms);
}
