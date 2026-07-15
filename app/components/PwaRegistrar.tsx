"use client";

import { useEffect } from "react";

export function PwaRegistrar() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // The player remains fully usable when service workers are unavailable.
      });
    }
  }, []);

  return null;
}
