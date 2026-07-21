import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

test("defines the Contin Player application shell", async () => {
  const [page, layout, client, app, viteConfig] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/ContinPlayerClient.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/ContinPlayerApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../vite.config.ts", import.meta.url), "utf8"),
  ]);

  assert.match(page, /<ContinPlayerClient \/>/);
  assert.match(layout, /Contin — 你的連續播放空間/);
  assert.match(layout, /rel="manifest" href="\/manifest\.webmanifest" crossOrigin="use-credentials"/);
  assert.match(client, /ssr:\s*false/);
  assert.match(client, /import\("\.\/ContinPlayerApp"\)/);
  assert.match(app, /新增清單/);
  assert.match(app, /@videojs\/react/);
  assert.match(app, /版本：\{__BUILD_TIME__\}/);
  assert.match(viteConfig, /timeZone: "Asia\/Taipei"/);
  assert.match(viteConfig, /define: \{ __BUILD_TIME__: JSON\.stringify\(buildTime\) \}/);
  assert.doesNotMatch(`${page}\n${layout}\n${client}\n${app}`, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
});

test("ships PWA assets and browser-only persistence", async () => {
  const [manifest, serviceWorker, playlistStore, packageJson, hostingConfig, app, styles] = await Promise.all([
    readFile(new URL("../public/manifest.webmanifest", import.meta.url), "utf8"),
    readFile(new URL("../public/sw.js", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/playlist-store.ts", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8"),
    readFile(new URL("../app/components/ContinPlayerApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    access(new URL("../public/og.png", import.meta.url)),
  ]);

  const parsedManifest = JSON.parse(manifest);
  assert.equal(parsedManifest.name, "Contin Player");
  assert.equal(parsedManifest.display, "standalone");
  assert.match(serviceWorker, /contin-shell-v1/);
  assert.match(playlistStore, /indexedDB\.open\(DATABASE_NAME, DATABASE_VERSION\)/);
  assert.match(playlistStore, /const PLAYLIST_STORE = "playlists"/);
  assert.match(playlistStore, /savePlaybackProgress/);
  const parsedHostingConfig = JSON.parse(hostingConfig);
  assert.match(parsedHostingConfig.project_id, /^appgprj_/);
  assert.equal(parsedHostingConfig.d1, null);
  assert.equal(parsedHostingConfig.r2, null);
  assert.match(packageJson, /"@videojs\/react": "10\.0\.0-beta\.25"/);
  assert.doesNotMatch(packageJson, /drizzle|db:migrate/i);
  assert.match(app, /Range: "bytes=0-0"/);
  assert.match(app, /headers\.get\("accept-ranges"\)/);
  assert.match(app, /headers\.get\("content-range"\)/);
  assert.match(app, /rangeSupport !== "supported"/);
  assert.match(app, /const MAX_LOCAL_MEDIA_MB = 50/);
  assert.match(app, /URL\.createObjectURL\(blob\)/);
  assert.match(app, /HTTP Range Requests/);
  assert.match(app, /keys="ArrowLeft" action="seekStep" value=\{-10\}/);
  assert.match(app, /keys="ArrowRight" action="seekStep" value=\{10\}/);
  assert.doesNotMatch(app, /<SeekButton/);
  assert.match(app, /已從 \$\{formatTime\(resumeTime\)\} 接續/);
  assert.doesNotMatch(app, /快捷鍵|<kbd>/);
  assert.doesNotMatch(app, /addEventListener\(["'](?:before)?unload["']/);
  assert.match(app, /new ResizeObserver\(updateHeight\)/);
  assert.match(app, /--player-area-height/);
  assert.match(styles, /height: var\(--player-area-height, auto\)/);
  assert.match(styles, /max-height: var\(--player-area-height, calc\(100vh - 134px\)\)/);
  assert.doesNotMatch(app, /\/api\/|requestJson/);
});
