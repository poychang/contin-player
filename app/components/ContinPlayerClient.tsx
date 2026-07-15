"use client";

import dynamic from "next/dynamic";

const ContinPlayerApp = dynamic(
  () => import("./ContinPlayerApp").then((module) => module.ContinPlayerApp),
  {
    ssr: false,
    loading: () => (
      <main className="app-shell">
        <div className="loading-state" role="status">
          <span className="loading-orbit" />
          正在準備你的播放空間…
        </div>
      </main>
    ),
  },
);

export function ContinPlayerClient() {
  return <ContinPlayerApp />;
}
