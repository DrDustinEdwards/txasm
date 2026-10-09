#!/usr/bin/env node
// Measures what a first visit to each route downloads in JS and CSS, gzipped, from the client build's own route manifest:
//
//   npm run build && node scripts/measure-route-weight.mjs [--json]
//
// The weight of a route is the entry module and its imports, the root route, the route's own module and everything those
// import, and every stylesheet the manifest lists for them. Fonts, images and audio are not counted. Read-only.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const clientDir = join(process.cwd(), "build", "client");
const assetsDir = join(clientDir, "assets");
const manifestFile = readdirSync(assetsDir).find((name) => /^manifest-.*\.js$/.test(name));
if (!manifestFile) throw new Error("no manifest-*.js in build/client/assets: run npm run build first");

const source = readFileSync(join(assetsDir, manifestFile), "utf8");
const manifest = JSON.parse(source.slice(source.indexOf("{"), source.lastIndexOf("}") + 1));

const gzipBytes = (/** @type {string} */ url) => gzipSync(readFileSync(join(clientDir, url.replace(/^\//, "")))).length;
const cache = new Map();
const sized = (/** @type {string} */ url) => {
  if (!cache.has(url)) cache.set(url, gzipBytes(url));
  return cache.get(url);
};

/** @param {string[]} ids route ids from the root down to the leaf */
function weigh(ids) {
  const js = new Set([manifest.entry.module, ...manifest.entry.imports]);
  const css = new Set(manifest.entry.css ?? []);
  for (const id of ids) {
    const route = manifest.routes[id];
    js.add(route.module);
    for (const url of route.imports ?? []) js.add(url);
    for (const url of route.css ?? []) css.add(url);
  }
  const sum = (/** @type {Set<string>} */ set) => [...set].reduce((total, url) => total + sized(url), 0);
  return { js: sum(js), css: sum(css) };
}

const rows = Object.values(manifest.routes)
  .filter((route) => route.hasDefaultExport && route.id !== "root")
  .map((route) => {
    const chain = [];
    for (let at = route; at; at = at.parentId ? manifest.routes[at.parentId] : undefined) chain.unshift(at.id);
    const { js, css } = weigh(chain);
    return { route: route.path ?? route.id, id: route.id, js, css, total: js + css };
  })
  .sort((a, b) => b.total - a.total);

const allJs = readdirSync(assetsDir).filter((name) => name.endsWith(".js"));
const allCss = readdirSync(assetsDir).filter((name) => name.endsWith(".css"));
const sumAll = (/** @type {string[]} */ names) => names.reduce((total, name) => total + sized(`/assets/${name}`), 0);

if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ routes: rows, allJs: sumAll(allJs), allCss: sumAll(allCss) }, null, 2));
} else {
  console.log(`client build: ${allJs.length} js files ${sumAll(allJs)} B gzip, ${allCss.length} css files ${sumAll(allCss)} B gzip`);
  for (const row of rows) console.log(`${String(row.total).padStart(8)} B  js ${String(row.js).padStart(7)}  css ${String(row.css).padStart(6)}  ${row.id}`);
}
