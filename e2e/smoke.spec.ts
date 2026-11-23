// Smoke tests: the page loads on the real Worker, its main controls work,
// and one prepared report goes through all four steps. Endpoints that need
// the broker or Pointsman are stubbed here (playwright.config.ts says why);
// GET /api/config and the page's files come from the Worker itself. Other
// hosts (map tiles, MapLibre, fonts) are blocked, so the tests do not depend
// on them: the page works without the map.

import { expect, test, type Page } from '@playwright/test';

const REPORT_ID = 'urn:ngsi-ld:RoadRestriction:demo-00000000-0000-4000-8000-000000000001';

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
    final: { action: 'publish', decidedAt: at(5), ngsi: { decision: null } },
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
      ? route.fulfill({ json: { id: REPORT_ID, key: 'k'.repeat(32) } })
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

test.beforeEach(async ({ page }) => {
  await stubServices(page);
});

test('the page loads with the prepared reports from the Worker', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/');
  await expect(page).toHaveTitle('Pointsman FIWARE demo');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Heavy rain. Closed roads are reported.');
  // One featured example for each outcome; the rest under "More examples".
  await expect(page.locator('#featured button.card')).toHaveCount(4);
  await expect(page.locator('#more-summary')).toHaveText(/More examples \(\d+\)/);
  await expect(page.locator('#send-error')).toBeHidden();
  expect(errors).toEqual([]);
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

test('a prepared report goes through all four steps to its final result', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/');
  const sent = page.waitForRequest((r) => r.url().endsWith('/api/reports') && r.method() === 'POST');
  await page.locator('#featured button.card').first().click();
  const body = (await sent).postDataJSON() as { prepared: string; lang: string };
  expect(body).toEqual({ prepared: expect.any(String), lang: 'en' });

  // Step 2: the first check, its parts one after the other, then the rule.
  await expect(page.locator('#step-decide')).toBeVisible();
  const rule = page.locator('#rule');
  await expect(rule.locator('.badge')).toHaveText('publish');
  await rule.getByRole('button').click();

  // Step 3: no additional check for a published report.
  await expect(page.locator('#step-check')).toBeVisible();
  await expect(page.locator('#outcome')).toContainText('Publish at once');
  await page.locator('#chain').getByRole('button').click();

  // Step 4: the final result, and the way back to step 1.
  await expect(page.locator('#step-result')).toBeVisible();
  await expect(page.locator('#final')).not.toBeEmpty();
  await page.getByRole('button', { name: 'Try another report' }).click();
  await expect(page.locator('#step-pick')).toBeVisible();
  expect(errors).toEqual([]);
});
