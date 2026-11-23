// The page's safety parts (site/safe.js, #124): el() never turns data into
// HTML, cleanSvg() keeps only the diagram's own SVG, and app.js writes HTML
// in one place only, from its own texts.

import { beforeAll, describe, expect, it } from 'vitest';
import app from '../../site/app.js?raw';
import html from '../../site/index.html?raw';

type Safe = {
  el: (tag: string, props?: Record<string, unknown> | null, children?: (Node | string | null)[]) => HTMLElement;
  cleanSvg: (text: string) => SVGSVGElement | null;
};
let safe: Safe;

beforeAll(async () => {
  // A plain browser script: it sets window.PointsmanSafe.
  // @ts-expect-error plain JavaScript without types
  await import('../../site/safe.js');
  safe = (window as unknown as { PointsmanSafe: Safe }).PointsmanSafe;
});

const MARKUP = '<img src=x onerror="alert(1)"><script>alert(2)</script>';

describe('el()', () => {
  it('sets `text` as text, never as HTML', () => {
    const e = safe.el('span', { text: MARKUP });
    expect(e.textContent).toBe(MARKUP);
    expect(e.children).toHaveLength(0);
  });

  it('adds string children as text nodes', () => {
    const e = safe.el('p', null, [MARKUP, safe.el('strong', { text: MARKUP }), null]);
    expect(e.childNodes[0]!.nodeType).toBe(Node.TEXT_NODE);
    expect(e.querySelectorAll('img, script')).toHaveLength(0);
    expect(e.textContent).toBe(MARKUP + MARKUP);
  });

  it('adds `on…` props as listeners, not as attributes, and the rest as attributes', () => {
    let clicked = 0;
    const e = safe.el('button', { class: 'btn', type: 'button', 'aria-label': MARKUP, onclick: () => { clicked += 1; } });
    expect(e.hasAttribute('onclick')).toBe(false);
    e.click();
    expect(clicked).toBe(1);
    expect(e.className).toBe('btn');
    // An attribute value stays a value.
    expect(e.getAttribute('aria-label')).toBe(MARKUP);
    expect(e.children).toHaveLength(0);
  });
});

const SVG = 'http://www.w3.org/2000/svg';
const svg = (inner: string, attrs = '') => `<svg xmlns="${SVG}" viewBox="0 0 10 10" role="img" aria-label="d"${attrs}>${inner}</svg>`;

describe('cleanSvg()', () => {
  it("keeps the diagram's own elements and attributes", () => {
    const out = safe.cleanSvg(svg('<defs><marker id="m" refX="1" refY="1" markerWidth="4" markerHeight="4" orient="auto"><path d="M0 0L2 2"/></marker></defs>'
      + '<style>.a{stroke:#333}</style><g><rect class="b" x="1" y="1" width="5" height="5" rx="1"/>'
      + '<path class="a" d="M1 1L5 5" marker-end="url(#m)"/><text class="l" x="2" y="2" textLength="8" lengthAdjust="spacingAndGlyphs">check<tspan>x</tspan></text><title>t</title></g>'));
    expect(out).not.toBeNull();
    expect(out!.namespaceURI).toBe(SVG);
    expect(out!.getAttribute('aria-label')).toBe('d');
    expect(out!.querySelector('path.a')!.getAttribute('marker-end')).toBe('url(#m)');
    expect(out!.querySelector('text.l')!.textContent).toBe('checkx');
    expect(out!.querySelector('style')!.textContent).toBe('.a{stroke:#333}');
    expect(out!.querySelectorAll('marker, rect, title')).toHaveLength(3);
  });

  it('drops scripts, links, images, foreign content and animations', () => {
    const out = safe.cleanSvg(svg('<script>alert(1)</script><a href="https://example.invalid"><text>x</text></a>'
      + '<image href="https://example.invalid/i.png"/><foreignObject><div xmlns="http://www.w3.org/1999/xhtml">x</div></foreignObject>'
      + '<use href="#m"/><animate attributeName="x" to="1"/><set attributeName="x" to="1"/><iframe xmlns="http://www.w3.org/1999/xhtml"/>'
      + '<rect width="1" height="1"/>'));
    expect(out!.querySelectorAll('*')).toHaveLength(1);
    expect(out!.firstElementChild!.localName).toBe('rect');
  });

  it('drops event handlers, links, inline styles and attributes in other namespaces', () => {
    const out = safe.cleanSvg(svg('<rect onclick="alert(1)" onload="alert(2)" style="fill:url(https://example.invalid/x)" href="javascript:alert(3)" '
      + 'xmlns:xlink="http://www.w3.org/1999/xlink" xlink:href="javascript:alert(4)" xmlns:f="urn:x" f:width="9" width="1" height="1"/>', ' onload="alert(5)"'));
    const rect = out!.querySelector('rect')!;
    expect([...rect.attributes].map((a) => a.name).sort()).toEqual(['height', 'width']);
    expect(out!.hasAttribute('onload')).toBe(false);
  });

  it('keeps only markers inside the diagram', () => {
    const out = safe.cleanSvg(svg('<path d="M0 0" marker-end="url(https://example.invalid/m.svg#m)"/><path d="M0 0" marker-end="url(#ok)"/>'));
    const ends = [...out!.querySelectorAll('path')].map((p) => p.getAttribute('marker-end'));
    expect(ends).toEqual([null, 'url(#ok)']);
  });

  it('drops a style element that loads something', () => {
    for (const css of ['@import "https://example.invalid/x.css";', '.a{background:url(https://example.invalid/x)}', '.a{background:URL(x)}']) {
      expect(safe.cleanSvg(svg(`<style>${css}</style><rect/>`))!.querySelector('style'), css).toBeNull();
    }
  });

  it('refuses what is not one SVG document', () => {
    expect(safe.cleanSvg('')).toBeNull();
    expect(safe.cleanSvg('<html><body><svg></svg></body></html>')).toBeNull();
    expect(safe.cleanSvg('<svg>no namespace</svg>')).toBeNull();
    expect(safe.cleanSvg(`<svg xmlns="${SVG}"><rect></svg>`)).toBeNull();
    expect(safe.cleanSvg('not xml at all')).toBeNull();
  });

  it('returns a node of this document', () => {
    const out = safe.cleanSvg(svg('<rect/>'))!;
    expect(out.ownerDocument).toBe(document);
  });
});

describe('app.js', () => {
  it('writes HTML only in applyLang, from its own texts', () => {
    // The one innerHTML: data-i18n texts from T (they may contain links).
    expect(app.match(/\.innerHTML\s*=/g)).toHaveLength(1);
    expect(app).toMatch(/var v = t\(n\.dataset\.i18n\); if \(typeof v === 'string'\) n\.innerHTML = v;/);
    expect(app).not.toMatch(/outerHTML\s*=|insertAdjacentHTML|document\.write|\beval\(|new Function\(/);
  });

  it('uses el() and cleanSvg() from safe.js, not copies of its own', () => {
    expect(app).toContain('var el = window.PointsmanSafe.el;');
    expect(app).toContain('var cleanSvg = window.PointsmanSafe.cleanSvg;');
    expect(app).not.toMatch(/function (el|cleanSvg)\(/);
  });

  it('is loaded after safe.js', () => {
    expect(html.indexOf('<script src="safe.js"></script>')).toBeGreaterThan(0);
    expect(html.indexOf('<script src="safe.js"></script>')).toBeLessThan(html.indexOf('<script src="app.js"></script>'));
  });
});
