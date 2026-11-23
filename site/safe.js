// The two parts of the page that keep outside data from running: el() puts
// text only as text, and cleanSvg() keeps only the SVG that Pointsman's
// diagram uses. A file of their own, loaded before app.js, so
// test/site/safe.test.ts can test them (#124).
(function (root) {
  'use strict';

  /**
   * A new element. `text` and string children become text nodes, never HTML;
   * `class` sets the class; an `on…` prop adds a listener; everything else is
   * an attribute.
   */
  function el(tag, props, children) {
    var e = document.createElement(tag);
    if (props) Object.keys(props).forEach(function (k) {
      if (k === 'text') e.textContent = props[k];
      else if (k === 'class') e.className = props[k];
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), props[k]);
      else e.setAttribute(k, props[k]);
    });
    (children || []).forEach(function (c) { if (c) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }

  // Only what Pointsman's diagram uses (src/graph.ts toSvg): SVG elements and
  // attributes on these lists; everything else is dropped, so nothing in it
  // can run or load anything.
  var SVG_NS = 'http://www.w3.org/2000/svg';
  var SVG_ELEMENTS = ['svg', 'style', 'defs', 'marker', 'path', 'line', 'rect', 'text', 'tspan', 'title', 'g'];
  var SVG_ATTRS = ['class', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'width', 'height', 'rx', 'd', 'viewBox', 'refX', 'refY', 'markerWidth',
    'markerHeight', 'orient', 'marker-end', 'textLength', 'lengthAdjust', 'id', 'role', 'aria-label'];

  /** The SVG text as a cleaned <svg> node for this document, or null when it is not one SVG. */
  function cleanSvg(text) {
    if (!text) return null;
    var doc = new DOMParser().parseFromString(text, 'image/svg+xml');
    var svg = doc.documentElement;
    if (!svg || svg.namespaceURI !== SVG_NS || svg.localName !== 'svg' || doc.getElementsByTagName('parsererror').length) return null;
    var keep = function (n) { return n.namespaceURI === SVG_NS && SVG_ELEMENTS.indexOf(n.localName) >= 0; };
    Array.prototype.slice.call(svg.getElementsByTagName('*')).forEach(function (n) { if (!keep(n) && n.parentNode) n.parentNode.removeChild(n); });
    [svg].concat(Array.prototype.slice.call(svg.getElementsByTagName('*'))).forEach(function (n) {
      Array.prototype.slice.call(n.attributes).forEach(function (a) {
        var ok = SVG_ATTRS.indexOf(a.localName) >= 0 && !a.namespaceURI
          // A marker is referenced only within the diagram.
          && !(a.localName === 'marker-end' && !/^url\(#[A-Za-z0-9_.-]+\)$/.test(a.value));
        if (!ok && !(n === svg && a.name === 'xmlns')) n.removeAttribute(a.name);
      });
    });
    // The style element: Pointsman's own rules, but no outside resources.
    Array.prototype.slice.call(svg.getElementsByTagName('style')).forEach(function (st) {
      if (/@import|url\(/i.test(st.textContent)) st.parentNode.removeChild(st);
    });
    return document.importNode(svg, true);
  }

  root.PointsmanSafe = { el: el, cleanSvg: cleanSvg };
})(typeof window !== 'undefined' ? window : globalThis);
