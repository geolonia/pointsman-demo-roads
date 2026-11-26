// Smoke tests: the page loads on the real Worker, its main controls work,
// and prepared reports go through all four steps: one published at once, one
// a person publishes, and one urgent that a person rejects; all three also in
// Japanese.
// A visitor without the report's key sees who decides; an answer given first
// in another tab, or by someone else (409), shows the report as it is. Endpoints that need
// the broker or Pointsman are stubbed here (playwright.config.ts says why);
// GET /api/config and the page's files come from the Worker itself. Other
// hosts (map tiles, MapLibre, fonts) are blocked, so most tests run the page
// without the map, as it works when MapLibre does not load. The map tests run
// it with MapLibre from the pinned devDependency and empty tiles (serveMap).

import { readFileSync } from 'node:fs';
import { test as base, expect, type Page } from '@playwright/test';

const REPORT_ID = 'urn:ngsi-ld:RoadRestriction:demo-00000000-0000-4000-8000-000000000001';
/** The key the stubbed Worker gives with a report, which the page sends with the visitor's answer. */
const KEY = 'k'.repeat(32);

/** A report in the shape of GET /api/reports/{id}: published at once, nothing for a person. */
function publishedReport(sentAt: number) {
  const at = (s: number) => new Date(sentAt + s * 1000).toISOString();
  return {
    id: REPORT_ID,
    roadName: '',
    status: 'closed',
    description: 'Water pipe works, one lane closed until 17:00.',
    location: { type: 'Point', coordinates: [139.7528, 35.6852] },
    createdAt: at(1),
    check: {
      action: 'publish',
      decidedAt: at(3),
      decision: 'urn:ngsi-ld:Decision:00000000-0000-4000-8000-000000000002',
      answers: {
        category: { value: 'closedConstruction', p: 0.92 },
        status_matches: { value: true, p: 0.95 },
        danger: { value: 0.05 },
        clarity: { value: 3 },
      },
    },
    final: { action: 'publish', decidedAt: at(5), policyRule: '3', ngsi: { decision: null } },
    published: true,
    prepared: true,
    visitorDecision: null,
    issue: null,
    issueLimited: false,
    facts: [],
    evacuation: null,
    ngsi: { entity: { id: REPORT_ID, type: 'RoadRestriction' }, decision: { id: 'urn:ngsi-ld:Decision:00000000-0000-4000-8000-000000000002' }, task: null },
  };
}

type Answer = 'publish' | 'reject';

/**
 * A report that waits for a person (the first check said review or urgent),
 * after the additional check and the final result, in the shape of
 * GET /api/reports/{id}. With an answer: as the bridge writes it back, with
 * the person's answer on the check and the final result made again after it.
 */
function waitingReport(sentAt: number, first: { action: 'review' | 'urgent'; policyRule?: string; danger: number },
  evacuation: { action: 'alert' | 'none'; policyRule?: string }, finalBefore: { action: string; policyRule?: string },
  answer: { action: Answer; final: { action: string; policyRule: string } } | null) {
  const at = (s: number) => new Date(sentAt + s * 1000).toISOString();
  const r = publishedReport(sentAt);
  return {
    ...r,
    check: {
      ...r.check,
      action: first.action,
      ...(first.policyRule !== undefined && { policyRule: first.policyRule }),
      answers: { ...r.check.answers, danger: { value: first.danger }, clarity: { value: first.action === 'review' ? 1 : 3 } },
      ...(answer && { finalAction: answer.action, reviewedAt: at(10) }),
    },
    evacuation: {
      action: evacuation.action,
      decidedAt: at(6),
      ...(evacuation.policyRule !== undefined && { policyRule: evacuation.policyRule }),
      answers: {},
      facts: [],
      ngsi: { decision: null, alert: evacuation.action === 'alert' ? { id: 'urn:ngsi-ld:Alert:00000000-0000-4000-8000-000000000003', type: 'Alert' } : null },
    },
    final: answer
      ? { action: answer.final.action, decidedAt: at(12), policyRule: answer.final.policyRule, ngsi: { decision: null } }
      : { action: finalBefore.action, decidedAt: at(8), ...(finalBefore.policyRule !== undefined && { policyRule: finalBefore.policyRule }), ngsi: { decision: null } },
    published: answer?.final.action === 'publish',
    visitorDecision: answer?.action ?? null,
  };
}

/**
 * Serves a waiting report until the visitor answers (POST .../resolve, as
 * the Worker answers it), then the report as it is after that answer.
 * `conflict`: the Worker answers 409 instead, as when the answer was given
 * first (with `finalAction`: by this visitor in another tab; without: by
 * someone else, whose answer `after` then gets). Returns what the page sent
 * with its answer.
 */
async function stubPersonFlow(page: Page, before: () => unknown, after: (answer: Answer) => unknown,
  conflict?: { finalAction?: Answer; answer: Answer }) {
  const sent: { action?: Answer; key?: string }[] = [];
  await page.route(/\/api\/reports\/[^/]+\/resolve$/, (route) => {
    // Only the report this test sent (the id is percent-encoded in the path).
    expect(decodeURIComponent(new URL(route.request().url()).pathname)).toBe(`/api/reports/${REPORT_ID}/resolve`);
    const body = route.request().postDataJSON() as { action: Answer; key: string };
    sent.push(body);
    if (conflict) return route.fulfill({ status: 409, json: conflict.finalAction ? { finalAction: conflict.finalAction } : { error: 'already decided' } });
    return route.fulfill({ json: { finalAction: body.action } });
  });
  // Added after stubServices, so it comes first for GET /api/reports/{id}.
  await page.route(/\/api\/reports\/[^/]+$/, (route) => route.fulfill({
    json: sent[0]?.action ? after(conflict ? conflict.answer : sent[0].action) : before(),
  }));
  return sent;
}

/** Clicks a featured card by its prepared report's id, and checks that this id is what the page sends. */
async function sendPrepared(page: Page, id: string, lang: 'en' | 'ja' = 'en') {
  const sent = page.waitForRequest((r) => r.url().endsWith('/api/reports') && r.method() === 'POST');
  await page.locator(`#featured button.card[aria-labelledby="card-${id}-title"]`).click();
  expect((await sent).postDataJSON()).toEqual({ prepared: id, lang });
}

const listed = {
  id: REPORT_ID,
  roadName: '靖国通り',
  status: 'closed',
  description: 'Water pipe works, one lane closed until 17:00.',
  location: { type: 'Point', coordinates: [139.7528, 35.6852] },
  createdAt: new Date().toISOString(),
  check: { action: 'publish', answers: {} },
  published: true,
};

/** Stubs the endpoints behind which the broker or Pointsman sit, and blocks other hosts. */
async function stubServices(page: Page) {
  const origin = new URL(test.info().project.use.baseURL!).origin;
  await page.route((url) => url.origin !== origin, (route) => route.abort());
  await page.route('**/api/reports', (route) =>
    route.request().method() === 'POST'
      ? route.fulfill({ json: { id: REPORT_ID, key: KEY } })
      : route.fulfill({ json: { reports: [listed] } }));
  await page.route(/\/api\/reports\/[^/]+$/, (route) => route.fulfill({ json: publishedReport(Date.now() - 5000) }));
  await page.route('**/api/decisions', (route) => route.fulfill({
    json: {
      request: { method: 'GET', url: 'https://broker.example/ngsi-ld/v1/entities?type=Decision', tenant: 'demo', link: 'https://broker.example/context.jsonld', pages: 1 },
      total: 0,
      decisions: [],
    },
  }));
  await page.route('**/api/stats', (route) => route.fulfill({
    json: { days: 7, reports: 12, published: 7, toPerson: 5, urgent: 3, unclear: 5, decided: { published: 2, rejected: 1, waiting: 2 }, corrected: 0 },
  }));
  await page.route('**/api/graph*', (route) => route.fulfill({
    contentType: 'image/svg+xml',
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><title>chain</title></svg>',
  }));
}

/**
 * Uncaught errors, console errors, and failed loads from the page's own
 * origin. Failed loads from the blocked hosts do not count: the console
 * reports every failed load the same way, so those lines are left out there
 * and the own origin's are caught from the responses instead.
 */
function collectErrors(page: Page): string[] {
  const origin = new URL(test.info().project.use.baseURL!).origin;
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    if (/Failed to load resource|net::ERR_/.test(m.text())) return;
    errors.push(`console: ${m.text()}`);
  });
  page.on('response', (r) => {
    if (new URL(r.url()).origin === origin && r.status() >= 400) errors.push(`${r.status()} ${r.request().method()} ${r.url()}`);
  });
  page.on('requestfailed', (r) => {
    if (new URL(r.url()).origin === origin) errors.push(`failed: ${r.method()} ${r.url()} ${r.failure()?.errorText ?? ''}`);
  });
  return errors;
}

/** Every test fails on the errors above, whatever it does on the page. */
const test = base.extend<{ pageErrors: string[] }>({
  pageErrors: [async ({ page }, use) => {
    const errors = collectErrors(page);
    await use(errors);
    expect(errors, 'errors on the page').toEqual([]);
  }, { auto: true }],
});

test.beforeEach(async ({ page }) => {
  await stubServices(page);
});

// A transparent 1×1 PNG: every raster tile (the flood map).
const BLANK_PNG = readFileSync(new URL('./fixtures/blank-tile.png', import.meta.url));

// The MapLibre version the tests serve: the pinned devDependency. The page's
// unpkg links must name the same version (a test below checks it), so update both together.
const MAPLIBRE = (JSON.parse(readFileSync(new URL('../node_modules/maplibre-gl/package.json', import.meta.url), 'utf8')) as { version: string }).version;

/**
 * The map without the network: MapLibre from the pinned devDependency (the
 * same files as the page's unpkg links, so their integrity hashes match), an
 * empty vector tile for every GSI base map tile, a blank PNG for every flood
 * tile, and no shelters. pmtiles stays blocked, so the page uses its plain
 * tile URLs (its fallback without pmtiles). An init script keeps the page's
 * map in window.__map, so a test can find a point's pixel.
 */
async function serveMap(page: Page) {
  const dist = new URL('../node_modules/maplibre-gl/dist/', import.meta.url);
  const files: [string, string][] = [['maplibre-gl.js', 'application/javascript'], ['maplibre-gl.css', 'text/css']];
  for (const [file, type] of files) {
    await page.route(`https://unpkg.com/maplibre-gl@${MAPLIBRE}/dist/${file}`, (route) => route.fulfill({
      body: readFileSync(new URL(file, dist)), contentType: type, headers: { 'access-control-allow-origin': '*' },
    }));
  }
  const cors = { 'access-control-allow-origin': '*' };
  await page.route('https://cyberjapandata.gsi.go.jp/xyz/optimal_bvmap-v1/**', (route) => route.fulfill({ body: '', contentType: 'application/x-protobuf', headers: cors }));
  await page.route('https://cyberjapandata.gsi.go.jp/xyz/skhb01/**', (route) => route.fulfill({ json: { type: 'FeatureCollection', features: [] }, headers: cors }));
  await page.route('https://disaportaldata.gsi.go.jp/raster/**', (route) => route.fulfill({ body: BLANK_PNG, contentType: 'image/png', headers: cors }));
  await page.addInitScript(() => {
    type Lib = { Map: new (o: unknown) => object };
    let lib: Lib | undefined;
    Object.defineProperty(window, 'maplibregl', {
      configurable: true,
      get: () => lib,
      set(v: Lib) {
        const Base = v.Map;
        v.Map = class extends Base { constructor(o: unknown) { super(o); (window as unknown as { __map: unknown }).__map = this; } };
        lib = v;
      },
    });
  });
}

type TestMap = {
  jumpTo(o: unknown): void; easeTo(o: unknown): void; project(l: [number, number]): { x: number; y: number }; getCanvas(): HTMLCanvasElement;
  once(e: string, f: () => void): void; getLayoutProperty(l: string, p: string): unknown; getSource(id: string): unknown;
  demoReady?: boolean; querySourceFeatures(id: string): { properties: Record<string, unknown> }[];
};

/**
 * Shows a point on the page's map at `zoom`, at a spot of the map that
 * nothing covers, waits until the map has drawn it, and returns its pixel.
 */
async function showOnMap(page: Page, at: [number, number], zoom: number) {
  await page.locator('#map').scrollIntoViewIfNeeded();
  return page.evaluate(([lngLat, z]) => new Promise<{ x: number; y: number }>((done, fail) => {
    const m = (window as unknown as { __map: TestMap }).__map;
    const canvas = m.getCanvas();
    const box = canvas.getBoundingClientRect();
    let spot: { x: number; y: number } | null = null;
    for (let gy = 1; gy < 8 && !spot; gy++) {
      for (let gx = 1; gx < 8 && !spot; gx++) {
        const x = box.left + (box.width * gx) / 8;
        const y = box.top + (box.height * gy) / 8;
        if (x >= 0 && y >= 0 && x < innerWidth && y < innerHeight && document.elementFromPoint(x, y) === canvas) spot = { x, y };
      }
    }
    if (!spot) { fail(new Error('no free spot on the map')); return; }
    m.jumpTo({ center: lngLat, zoom: z });
    const middle = m.project(lngLat);
    // jumpTo ignores offset; easeTo with no duration applies it at once.
    m.easeTo({ center: lngLat, zoom: z, offset: [spot.x - box.left - middle.x, spot.y - box.top - middle.y], duration: 0 });
    m.once('idle', () => {
      const p = m.project(lngLat);
      const at = { x: box.left + p.x, y: box.top + p.y };
      // The point must now be on the free spot, not under a panel.
      if (document.elementFromPoint(at.x, at.y) !== canvas) fail(new Error(`the point is covered at ${Math.round(at.x)},${Math.round(at.y)}`));
      else done(at);
    });
  }), [at, zoom] as const);
}

test('the page loads the MapLibre version the tests serve', async ({ request }) => {
  const html = await (await request.get('/')).text();
  for (const file of ['maplibre-gl.js', 'maplibre-gl.css']) {
    expect(html, `site/index.html must load maplibre-gl@${MAPLIBRE} (the devDependency): update both together, with the integrity hash`)
      .toContain(`https://unpkg.com/maplibre-gl@${MAPLIBRE}/dist/${file}`);
  }
});

test('the map: it loads with the flood layer for headquarters, and the recent reports on it', async ({ page }) => {
  await serveMap(page);
  await page.goto('/');
  await expect(page.locator('#map canvas.maplibregl-canvas')).toBeVisible();
  // The page's own layers are there once the style has loaded.
  await expect.poll(() => page.evaluate(() => (window as unknown as { __map: TestMap }).__map.demoReady === true), { timeout: 15_000 }).toBe(true);
  expect(await page.evaluate(() => (window as unknown as { __map: TestMap }).__map.getLayoutProperty('flood', 'visibility'))).toBe('visible');
  // The listed report (published) is a point of the reports source.
  await expect.poll(() => page.evaluate(() => (window as unknown as { __map: TestMap }).__map.querySourceFeatures('reports').map((f) => f.properties.id)), { timeout: 15_000 }).toContain(REPORT_ID);
});

test('the map: a click on a report opens it', async ({ page }) => {
  await serveMap(page);
  await page.goto('/');
  await expect.poll(() => page.evaluate(() => (window as unknown as { __map: TestMap }).__map.demoReady === true), { timeout: 15_000 }).toBe(true);
  await expect.poll(() => page.evaluate(() => (window as unknown as { __map: TestMap }).__map.querySourceFeatures('reports').length), { timeout: 15_000 }).toBeGreaterThan(0);
  const opened = page.waitForRequest((r) => r.method() === 'GET' && decodeURIComponent(new URL(r.url()).pathname) === `/api/reports/${REPORT_ID}`);
  const { x, y } = await showOnMap(page, listed.location.coordinates as [number, number], 16);
  await page.mouse.click(x, y);
  await opened;
  await expect(page.locator('#step-decide')).toBeVisible();
});

test('the page loads with the prepared reports from the Worker', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('Pointsman FIWARE demo');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Heavy rain. Closed roads are reported.');
  // One featured example for each outcome; the rest under "More examples".
  await expect(page.locator('#featured button.card')).toHaveCount(4);
  await expect(page.locator('#more-summary')).toHaveText(/More examples \(\d+\)/);
  await expect(page.locator('#send-error')).toBeHidden();
});

test('the language switch shows the page in Japanese', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#featured button.card')).toHaveCount(4);
  await page.locator('#lang').click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'ja');
  await expect(page.getByRole('heading', { level: 1 })).not.toHaveText('Heavy rain. Closed roads are reported.');
  await expect(page.locator('#more-summary')).not.toContainText('More examples');
});

test('"How it works" opens as a dialog and closes', async ({ page }) => {
  await page.goto('/');
  const dialog = page.getByRole('dialog', { name: 'How it works' });
  await page.locator('#how-toggle').click();
  await expect(dialog).toBeVisible();
  await expect(page.locator('#how-toggle')).toHaveAttribute('aria-expanded', 'true');
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(dialog).toBeHidden();
  await page.locator('#how-toggle').click();
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});

test('the reports panel lists the recent reports', async ({ page }) => {
  await page.goto('/');
  await page.locator('#activity-toggle').click();
  const panel = page.locator('#activity');
  await expect(panel).toBeVisible();
  await panel.getByRole('tab', { name: /Recent reports/ }).click();
  await expect(panel.locator('#reports')).toContainText('靖国通り');
  await page.locator('#activity-close').click();
  await expect(panel).toBeHidden();
});

test('a clear report is published at once, without a person', async ({ page }) => {
  await page.goto('/');
  await sendPrepared(page, 'flooded-underpass');

  // Step 2: the first check, its parts one after the other, then the rule.
  await expect(page.locator('#step-decide')).toBeVisible();
  const rule = page.locator('#rule');
  await expect(rule.locator('.badge')).toHaveText('publish');
  await rule.getByRole('button').click();

  // Step 3: no additional check for a published report.
  await expect(page.locator('#step-check')).toBeVisible();
  await expect(page.locator('#outcome')).toContainText('Publish at once');
  await page.locator('#chain').getByRole('button').click();

  // Step 4: the final result, nothing for a person, and the way back to step 1.
  await expect(page.locator('#step-result')).toBeVisible();
  await expect(page.locator('#final .headline')).toHaveText('Published: residents see it now');
  await expect(page.locator('#final .rule-text')).toHaveText('The first check published it at once: no person was needed.');
  await expect(page.locator('#person')).toBeEmpty();
  await page.getByRole('button', { name: 'Try another report' }).click();
  await expect(page.locator('#step-pick')).toBeVisible();
});

test('an unclear report waits for a person, and the visitor publishes it', async ({ page }) => {
  const sentAt = Date.now() - 5000;
  const answers = await stubPersonFlow(page,
    () => waitingReport(sentAt, { action: 'review', danger: 0.05 }, { action: 'none' }, { action: 'review' }, null),
    (action) => waitingReport(sentAt, { action: 'review', danger: 0.05 }, { action: 'none' }, { action: 'review' }, { action, final: { action: 'publish', policyRule: '3' } }));
  await page.goto('/');
  await sendPrepared(page, 'vague');

  // Step 2: no rule for publishing fits.
  const rule = page.locator('#rule');
  await expect(rule.locator('.badge')).toHaveText('review');
  await expect(rule.locator('.rule-text')).toHaveText('No rule for publishing fits: a person checks it.');
  await rule.getByRole('button').click();

  // Step 3: the additional check ran and found no reason for an alert.
  await expect(page.locator('#outcome')).toContainText('Waiting for a person');
  await expect(page.locator('#chain .chain-result')).toHaveText('The rules found no reason for an alert.');
  await page.locator('#chain').getByRole('button').click();

  // Step 4: waiting for a person, and the visitor is that person.
  await expect(page.locator('#final .headline')).toHaveText('Waiting for a person');
  const duty = page.locator('#person');
  await expect(duty).toContainText('You are the person on duty');
  await duty.getByRole('button', { name: 'Publish it' }).click();
  // The answer carries the key the Worker gave for this report.
  await expect(duty).toContainText('Published. The residents’ map shows it now.');
  // Until the final result is made again after the answer, the page says so instead of the old one.
  await expect(page.locator('#final')).toContainText('The final result is being decided');
  expect(answers).toEqual([{ action: 'publish', key: KEY }]);
  // The next poll (after 4 s) brings the final result made again after the answer.
  await expect(page.locator('#final .headline')).toHaveText('Published: residents see it now', { timeout: 10_000 });
  await expect(page.locator('#final .rule-text')).toHaveText('The person who checked the first result published it.');
});

test('a report of someone in danger is urgent, alerts the site, and the visitor rejects it', async ({ page }) => {
  const flow = urgentFlow(Date.now() - 5000);
  const answers = await stubPersonFlow(page, flow.before, flow.after);
  await page.goto('/');
  await sendPrepared(page, 'car-trapped');

  // Step 2: someone may be in danger.
  const rule = page.locator('#rule');
  await expect(rule.locator('.badge')).toHaveText('urgent');
  await expect(rule.locator('.rule-text')).toHaveText('If someone may be in danger, a person sees it first.');
  await rule.getByRole('button').click();

  // Step 3: urgent, and the staff of the evacuation site get an alert.
  await expect(page.locator('#outcome')).toContainText('Urgent: a person sees it first');
  await expect(page.locator('#chain .chain-result')).toHaveText('Alert sent to the staff of the evacuation site.');
  await page.locator('#chain').getByRole('button').click();

  // Step 4: urgent until a person answers; the visitor rejects it.
  await expect(page.locator('#final .headline')).toHaveText('Urgent: people must be told');
  await expect(page.locator('#final .rule-text')).toHaveText('The first check found it urgent, and no person has answered otherwise.');
  const duty = page.locator('#person');
  await duty.getByRole('button', { name: 'Reject it' }).click();
  await expect(duty).toContainText('Rejected. Residents never see it.');
  await expect(page.locator('#final')).toContainText('The final result is being decided');
  expect(answers).toEqual([{ action: 'reject', key: KEY }]);
  await expect(page.locator('#final .headline')).toHaveText('Rejected: residents never see it', { timeout: 10_000 });
  await expect(page.locator('#final .rule-text')).toHaveText('A person rejected the report: it stays rejected.');
});

/** The waiting report of the "vague" flow, before and after an answer: published in the end. */
function vagueFlow(sentAt: number) {
  return {
    before: () => waitingReport(sentAt, { action: 'review', danger: 0.05 }, { action: 'none' }, { action: 'review' }, null),
    after: (action: Answer) => waitingReport(sentAt, { action: 'review', danger: 0.05 }, { action: 'none' }, { action: 'review' }, { action, final: { action: 'publish', policyRule: '3' } }),
  };
}

/** The waiting report of the "car-trapped" flow, before and after an answer: rejected in the end. */
function urgentFlow(sentAt: number) {
  const first = { action: 'urgent', policyRule: '0', danger: 0.9 } as const;
  const evacuation = { action: 'alert', policyRule: '0' } as const;
  const finalBefore = { action: 'urgent', policyRule: '2' };
  return {
    before: () => waitingReport(sentAt, first, evacuation, finalBefore, null),
    after: (action: Answer) => waitingReport(sentAt, first, evacuation, finalBefore, { action, final: { action: 'reject', policyRule: '0' } }),
  };
}

/** Steps 2 and 3 of a report that waits for a person: on to step 4. */
async function toResult(page: Page) {
  await page.locator('#rule').getByRole('button').click();
  await page.locator('#chain').getByRole('button').click();
  await expect(page.locator('#step-result')).toBeVisible();
}

test('a visitor without the report\'s key sees who decides, and gets no buttons', async ({ page }) => {
  const sentAt = Date.now() - 5000;
  const flow = vagueFlow(sentAt);
  // The Worker gave no key (as for someone else's report): the page has none for this report.
  await page.route('**/api/reports', (route) => route.request().method() === 'POST'
    ? route.fulfill({ json: { id: REPORT_ID } })
    : route.fulfill({ json: { reports: [listed] } }));
  let issue: string | null = null;
  await page.route(/\/api\/reports\/[^/]+$/, (route) => route.fulfill({ json: { ...flow.before(), issue } }));
  await page.goto('/');
  await sendPrepared(page, 'vague');
  await toResult(page);
  const person = page.locator('#person');
  await expect(person.locator('.box-title')).toHaveText('A person decides');
  await expect(person).toContainText('It is being added to the review queue…');
  await expect(person.getByRole('button')).toHaveCount(0);
  // Once the issue is open, the box links to it (the next poll, after 4 s).
  issue = 'https://github.com/geolonia/pointsman-demo-roads/issues/999';
  await expect(person).toContainText('A team member checks this report in the review queue.', { timeout: 10_000 });
  await expect(person.getByRole('link')).toHaveText('Open it in the review queue (#999)');
});

test('an answer given first in another tab: the page shows that answer, not an error', async ({ page, pageErrors }) => {
  const flow = vagueFlow(Date.now() - 5000);
  const answers = await stubPersonFlow(page, flow.before, flow.after, { finalAction: 'publish', answer: 'publish' });
  await page.goto('/');
  await sendPrepared(page, 'vague');
  await toResult(page);
  const duty = page.locator('#person');
  // This tab answers "reject"; the other tab already published it.
  await duty.getByRole('button', { name: 'Reject it' }).click();
  await expect(duty).toContainText('Published. The residents’ map shows it now.');
  await expect(duty.locator('[role="alert"]')).toHaveCount(0);
  expect(answers).toEqual([{ action: 'reject', key: KEY }]);
  await expect(page.locator('#final .headline')).toHaveText('Published: residents see it now', { timeout: 10_000 });
  // The 409 is this test's own answer: not a page error.
  pageErrors.splice(0, pageErrors.length, ...pageErrors.filter((e) => !/^409 POST .*\/resolve$/.test(e)));
});

test('an answer someone else gave first: the page shows the report as it is now, and no buttons', async ({ page, pageErrors }) => {
  const flow = vagueFlow(Date.now() - 5000);
  // Someone else published it; this visitor's answer is refused.
  const answers = await stubPersonFlow(page, flow.before, (action) => ({ ...flow.after(action), visitorDecision: null }), { answer: 'publish' });
  await page.goto('/');
  await sendPrepared(page, 'vague');
  await toResult(page);
  const duty = page.locator('#person');
  await duty.getByRole('button', { name: 'Reject it' }).click();
  await expect(page.locator('#final .headline')).toHaveText('Published: residents see it now');
  await expect(page.locator('#final .rule-text')).toHaveText('The person who checked the first result published it.');
  // Checked once the page shows the result: the click returns before the stub has the answer.
  expect(answers).toEqual([{ action: 'reject', key: KEY }]);
  // Not this visitor's answer: no "you published it", and nothing to answer.
  await expect(duty).toBeEmpty();
  // The 409 is this test's own answer: not a page error.
  pageErrors.splice(0, pageErrors.length, ...pageErrors.filter((e) => !/^409 POST .*\/resolve$/.test(e)));
});

/** Opens the page in Japanese. */
async function inJapanese(page: Page) {
  await page.goto('/');
  await expect(page.locator('#featured button.card')).toHaveCount(4);
  await page.locator('#lang').click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'ja');
}

test('the person flow in Japanese: the report is sent in Japanese, and the visitor publishes it', async ({ page }) => {
  const flow = vagueFlow(Date.now() - 5000);
  const answers = await stubPersonFlow(page, flow.before, flow.after);
  await inJapanese(page);
  await sendPrepared(page, 'vague', 'ja');
  await toResult(page);
  await expect(page.locator('#final .headline')).toHaveText('レビュー待ち');
  const duty = page.locator('#person');
  await expect(duty.locator('.box-title')).toHaveText('あなたが担当者です');
  await duty.getByRole('button', { name: '公開する' }).click();
  await expect(duty).toContainText('公開しました。住民向けの地図に載っています。');
  expect(answers).toEqual([{ action: 'publish', key: KEY }]);
  await expect(page.locator('#final .headline')).toHaveText('公開：住民がすぐに見られます', { timeout: 10_000 });
});

test('in Japanese: a clear report is published at once, without a person', async ({ page }) => {
  await inJapanese(page);
  await sendPrepared(page, 'flooded-underpass', 'ja');
  // Step 2: the action, in Japanese too.
  await expect(page.locator('#rule .badge')).toHaveText('公開');
  await page.locator('#rule').getByRole('button').click();
  // Step 3: no additional check.
  await expect(page.locator('#outcome')).toContainText('すぐに公開');
  await page.locator('#chain').getByRole('button').click();
  // Step 4: published, nothing for a person.
  await expect(page.locator('#final .headline')).toHaveText('公開：住民がすぐに見られます');
  await expect(page.locator('#final .rule-text')).toHaveText('最初の判定ですぐに公開しました。人の確認は不要でした。');
  await expect(page.locator('#person')).toBeEmpty();
  await page.getByRole('button', { name: 'ほかの報告を試す' }).click();
  await expect(page.locator('#step-pick')).toBeVisible();
});

test('in Japanese: a report of someone in danger is urgent, alerts the site, and the visitor rejects it', async ({ page }) => {
  const flow = urgentFlow(Date.now() - 5000);
  const answers = await stubPersonFlow(page, flow.before, flow.after);
  await inJapanese(page);
  await sendPrepared(page, 'car-trapped', 'ja');
  // Step 2: someone may be in danger.
  const rule = page.locator('#rule');
  await expect(rule.locator('.badge')).toHaveText('緊急');
  await expect(rule.locator('.rule-text')).toHaveText('人に危険がありそうなら、真っ先に人が確認します。');
  await rule.getByRole('button').click();
  // Step 3: urgent, and the evacuation site's staff get an alert.
  await expect(page.locator('#outcome')).toContainText('緊急：真っ先に人が確認します');
  await expect(page.locator('#chain .chain-result')).toHaveText('避難場所の担当者に知らせました。');
  await page.locator('#chain').getByRole('button').click();
  // Step 4: urgent until a person answers; the visitor rejects it.
  await expect(page.locator('#final .headline')).toHaveText('緊急：人に知らせる必要があります');
  await expect(page.locator('#final .rule-text')).toHaveText('最初の判定で緊急となり、人はそれと違う回答をしていません。');
  const duty = page.locator('#person');
  await duty.getByRole('button', { name: '公開しない' }).click();
  await expect(duty).toContainText('公開しませんでした。住民には見えません。');
  await expect(page.locator('#final .headline')).toHaveText('非公開：住民には見えません', { timeout: 10_000 });
  await expect(page.locator('#final .rule-text')).toHaveText('人が報告を非公開にしたので、非公開のままです。');
  expect(answers).toEqual([{ action: 'reject', key: KEY }]);
});
