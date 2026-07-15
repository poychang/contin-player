import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

test("defines the Contin Player application shell", async () => {
  const [page, layout, app] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/ContinPlayerApp.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(page, /<ContinPlayerApp \/>/);
  assert.match(layout, /Contin — 你的連續播放空間/);
  assert.match(layout, /manifest:\s*"\/manifest\.webmanifest"/);
  assert.match(app, /新增清單/);
  assert.match(app, /@videojs\/react/);
  assert.doesNotMatch(`${page}\n${layout}\n${app}`, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
});

test("ships PWA assets and browser-only persistence", async () => {
  const [manifest, serviceWorker, playlistStore, packageJson, hostingConfig, app] = await Promise.all([
    readFile(new URL("../public/manifest.webmanifest", import.meta.url), "utf8"),
    readFile(new URL("../public/sw.js", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/playlist-store.ts", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8"),
    readFile(new URL("../app/components/ContinPlayerApp.tsx", import.meta.url), "utf8"),
    access(new URL("../public/og.png", import.meta.url)),
  ]);

  const parsedManifest = JSON.parse(manifest);
  assert.equal(parsedManifest.name, "Contin Player");
  assert.equal(parsedManifest.display, "standalone");
  assert.match(serviceWorker, /contin-shell-v1/);
  assert.match(playlistStore, /indexedDB\.open\(DATABASE_NAME, DATABASE_VERSION\)/);
  assert.match(playlistStore, /const PLAYLIST_STORE = "playlists"/);
  assert.match(playlistStore, /savePlaybackProgress/);
  assert.deepEqual(JSON.parse(hostingConfig), { d1: null, r2: null });
  assert.match(packageJson, /"@videojs\/react": "10\.0\.0-beta\.25"/);
  assert.doesNotMatch(packageJson, /drizzle|db:migrate/i);
  assert.doesNotMatch(app, /\/api\/|requestJson|fetch\(/);
});
