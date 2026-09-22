import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const frontendRoot = fileURLToPath(new URL("../../", import.meta.url));

function read(relativePath) {
  return readFileSync(path.join(frontendRoot, relativePath), "utf8");
}

function collectFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    return entry.isDirectory() ? collectFiles(entryPath) : [entryPath];
  });
}

test("page title, navbar and startup loader use DataCatalogue branding", () => {
  assert.match(read("index.html"), /<title>DataCatalogue<\/title>/);
  assert.match(read("public/components/navbar.html"), />DataCatalogue<\/a>/);
  assert.match(read("src/shared/ui/startupLoader.js"), /textContent = "DataCatalogue"/);
});

test("package and lockfile root identities agree after the rename", () => {
  const manifest = JSON.parse(read("package.json"));
  const lockfile = JSON.parse(read("package-lock.json"));

  assert.equal(manifest.name, "data-catalogue");
  assert.equal(lockfile.name, manifest.name);
  assert.equal(lockfile.packages[""].name, manifest.name);
});

test("navbar Jobs control and overlay retain matching accessible identifiers", () => {
  const navbar = read("public/components/navbar.html");
  const overlay = read("src/app/ui/createJobsOverlay.js");
  const panelId = /aria-controls="([^"]+)"/.exec(navbar)?.[1];

  assert.equal(panelId, "data-catalogue-jobs-panel");
  assert.ok(overlay.includes(`panelElement.id = "${panelId}"`));
  assert.ok(overlay.includes('"aria-labelledby", "data-catalogue-jobs-title"'));
  assert.ok(overlay.includes('titleElement.id = "data-catalogue-jobs-title"'));
  assert.match(navbar, /<span>Jobs<\/span>/);
});

test("Jobs events keep matching producers and consumers after namespacing", () => {
  const eventNames = (source) => [...new Set(source.match(/data-catalogue:[a-z-]+/g))].sort();
  const produced = eventNames(read("src/features/jobs/ui/jobList.js"));
  const consumed = eventNames(
    read("src/app/createApp.js") + read("src/app/ui/createJobsOverlay.js")
  );

  assert.deepEqual(produced, consumed);
  assert.deepEqual(produced, [
    "data-catalogue:aoi-filter-cleared",
    "data-catalogue:job-details-mode-changed",
    "data-catalogue:job-map-focus-cleared",
    "data-catalogue:job-map-focus-requested",
    "data-catalogue:job-selection-cleared",
    "data-catalogue:jobs-refreshed",
  ]);
});

test("renamed CSS tokens all have a stylesheet or measured-layout definition", () => {
  const styles = collectFiles(path.join(frontendRoot, "src/styles"))
    .filter((file) => file.endsWith(".css"))
    .map((file) => readFileSync(file, "utf8"))
    .join("\n");
  const declarations = new Set([...styles.matchAll(/(--dc-[\w-]+)\s*:/g)].map((m) => m[1]));
  const overlay = read("src/app/ui/createJobsOverlay.js");

  for (const match of overlay.matchAll(/setProperty\("(--dc-[\w-]+)"/g)) {
    declarations.add(match[1]);
  }

  const references = new Set([...styles.matchAll(/var\((--dc-[\w-]+)/g)].map((m) => m[1]));
  assert.ok(references.size > 0);
  assert.deepEqual([...references].filter((name) => !declarations.has(name)), []);
});

test("runtime keeps no old app branding except the documented theme migration key", () => {
  const files = [
    path.join(frontendRoot, "index.html"),
    ...collectFiles(path.join(frontendRoot, "src")),
    ...collectFiles(path.join(frontendRoot, "public")),
  ].filter((file) => /\.(js|css|html)$/.test(file) && !file.endsWith(".test.js"));

  for (const file of files) {
    let source = readFileSync(file, "utf8");

    if (file.endsWith(`${path.sep}themeStorage.js`)) {
      source = source.replace('"job-manager:theme-mode"', '"legacy-preference-key"');
    }

    assert.doesNotMatch(source, /Job Manager|JobManager|job-manager|--jm-/i, file);
  }
});
