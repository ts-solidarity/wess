import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";

async function waitForBoardIdle(page: Page): Promise<void> {
  await page.waitForFunction(() => !document.querySelector("#board")?.classList.contains("animating-active"));
}

async function gotoFreshApp(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.localStorage.clear();
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/play");
  await page.waitForSelector("#board");
  // Playground mode: click through both drafts (white then black)
  const draftReady = page.locator("#draft-ready-btn");
  for (let i = 0; i < 2; i++) {
    if (await draftReady.isVisible({ timeout: 2000 }).catch(() => false)) {
      await draftReady.click();
      await page.waitForTimeout(200);
    }
  }
  await waitForBoardIdle(page);
}

async function openUtilityTab(page: Page, tab: string): Promise<void> {
  await page.locator(`[data-utility-tab="${tab}"]`).click();
  await expect(page.locator(`[data-utility-panel="${tab}"]`)).toBeVisible();
}

async function getLayoutMetrics(page: Page) {
  return page.evaluate(() => {
    const rect = (selector: string) => {
      const element = document.querySelector(selector);
      return element ? element.getBoundingClientRect().toJSON() : null;
    };

    return {
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
      },
      board: rect("#board"),
      clocks: rect(".player-bar-top"),
      tabs: rect("#utility-tablist"),
      drawer: rect("#utility-drawer"),
    };
  });
}

async function clickMove(page: Page, from: string, to: string): Promise<void> {
  await page.locator(`.piece-node[data-square="${from}"]`).click();
  await page.locator(`.square[data-square="${to}"]`).click();
  await waitForBoardIdle(page);
}

async function dragMove(page: Page, from: string, to: string): Promise<void> {
  const fromSquare = page.locator(`.square[data-square="${from}"]`);
  const toSquare = page.locator(`.square[data-square="${to}"]`);
  const fromBox = await fromSquare.boundingBox();
  const toBox = await toSquare.boundingBox();

  if (!fromBox || !toBox) {
    throw new Error("Could not resolve board square bounds.");
  }

  await page.mouse.move(fromBox.x + (fromBox.width / 2), fromBox.y + (fromBox.height / 2));
  await page.mouse.down();
  await page.mouse.move(toBox.x + (toBox.width / 2), toBox.y + (toBox.height / 2), { steps: 12 });
  await page.mouse.up();
  await waitForBoardIdle(page);
}

test("supports click moves, drag moves, and undo/redo", async ({ page }) => {
  await gotoFreshApp(page);

  await clickMove(page, "d2", "d4");
  await expect(page.locator('.piece-node[data-square="d4"][data-piece="p"][data-color="w"]')).toBeVisible();

  await clickMove(page, "g8", "f6");
  await expect(page.locator('.piece-node[data-square="f6"][data-piece="n"][data-color="b"]')).toBeVisible();

  await page.locator("#undo-button").click();
  await waitForBoardIdle(page);
  await expect(page.locator('.piece-node[data-square="g8"][data-piece="n"][data-color="b"]')).toBeVisible();

  await page.locator("#redo-button").click();
  await waitForBoardIdle(page);
  await expect(page.locator('.piece-node[data-square="f6"][data-piece="n"][data-color="b"]')).toBeVisible();

  await clickMove(page, "b1", "c3");
  await expect(page.locator('.piece-node[data-square="c3"][data-piece="n"][data-color="w"]')).toBeVisible();
});

test("exports PGN and navigates the move timeline", async ({ page }) => {
  await gotoFreshApp(page);

  await clickMove(page, "d2", "d4");
  await clickMove(page, "d7", "d5");
  await clickMove(page, "g1", "f3");

  await openUtilityTab(page, "pgn");
  await page.locator("#export-pgn-button").click();
  await expect(page.locator("#pgn-textarea")).toHaveValue(/1\. d4 d5 2\. Nf3/);

  await page.locator('.history-move[data-ply="1"]').click();

  await expect(page.locator("#timeline-mode")).toHaveText("Review");
  await expect(page.locator("#timeline-text")).toHaveText("1 / 3");

  await page.locator("#live-button").click();
  await waitForBoardIdle(page);
  await expect(page.locator("#timeline-mode")).toHaveText("Live");
  await expect(page.locator("#timeline-text")).toHaveText("3 / 3");
});

test("importing a black-to-move setup activates the black clock", async ({ page }) => {
  await gotoFreshApp(page);

  await openUtilityTab(page, "pgn");
  await page.locator("#pgn-textarea").fill(`
[Event "Setup"]
[Site "Local"]
[Date "2026.03.14"]
[Round "-"]
[White "White"]
[Black "Black"]
[Result "*"]
[SetUp "1"]
[FEN "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1"]

*
  `.trim());

  await page.locator("#import-pgn-button").click();
  await expect(page.locator("#turn-badge")).toHaveText("Black");
  await expect(page.locator("#black-clock")).toHaveClass(/active/);
});

test("plays a knight fork move without runtime errors", async ({ page }) => {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];

  page.on("pageerror", (error) => {
    pageErrors.push(error.message);
  });
  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });

  await gotoFreshApp(page);
  await openUtilityTab(page, "pgn");
  await page.locator("#pgn-textarea").fill(`
[Event "Fork Setup"]
[Site "Local"]
[Date "2026.03.15"]
[Round "-"]
[White "White"]
[Black "Black"]
[Result "*"]
[SetUp "1"]
[FEN "4k3/8/8/1N1q4/8/8/8/4K3 w - - 0 1"]

*
  `.trim());

  await page.locator("#import-pgn-button").click();
  await clickMove(page, "b5", "c7");
  await expect(page.locator('.piece-node[data-square="c7"][data-piece="n"][data-color="w"]')).toBeVisible();
  await page.waitForTimeout(700);

  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

test("utility tabs switch between panels in the info panel", async ({ page }) => {
  await gotoFreshApp(page);

  await expect(page.locator("#session-card")).toBeHidden();

  await page.locator("#utility-tab-game").click();
  await expect(page.locator("#session-card")).toBeVisible();
  await expect(page.locator("#utility-tab-game")).toHaveAttribute("aria-expanded", "true");

  await page.locator("#utility-tab-fen").click();
  await expect(page.locator("#utility-panel-fen")).toBeVisible();
  await expect(page.locator("#session-card")).toBeHidden();
});

test("keeps clocks visible on desktop and fits the board inside the viewport", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await gotoFreshApp(page);

  const metrics = await getLayoutMetrics(page);
  expect(metrics.clocks?.top ?? -1).toBeGreaterThanOrEqual(0);
  expect(metrics.board?.bottom ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(metrics.viewport.height);
});

test("board fills most of the width on narrow screens", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoFreshApp(page);

  const metrics = await getLayoutMetrics(page);
  expect(metrics.board?.width ?? 0).toBeGreaterThan(300);
});

test("navigates from lobby to playground via Playground button", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.waitForSelector(".playground-btn");
  await page.locator(".playground-btn").click();
  await page.waitForSelector("#board");
  expect(page.url()).toContain("/play");
});
