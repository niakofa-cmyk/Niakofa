import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

const rawPort = process.env.PORT;
const port = rawPort ? Number(rawPort) : 3000;

if (rawPort && (Number.isNaN(port) || port <= 0)) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH ?? "/";

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss(),
    // ── Replit dev-only plugins ────────────────────────────────────────────────
    // runtimeErrorOverlay, cartographer, and devBanner are all Replit-specific.
    // Guard ALL of them behind both NODE_ENV and REPL_ID so none of them run
    // in Railway (or any other non-Replit) production builds.
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          runtimeErrorOverlay(),
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, ".."),
            }),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      // "@" maps to src/ — safe in all environments
      "@": path.resolve(import.meta.dirname, "src"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    // mapbox-gl is ~1.8 MB (minified, gzipped ~600 KB) — that is its fixed
    // library size and cannot be reduced. All other per-route chunks are
    // well under 600 KB after the lazy-loading split in App.tsx.
    // Set the warning threshold high enough to silence the mapbox noise while
    // still catching any genuinely oversized non-map bundles.
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          // ── Vendor: mapbox-gl ────────────────────────────────────────────
          // Isolate mapbox-gl into its own chunk so it is cached independently
          // of application code and does not inflate the shared vendor chunk.
          if (id.includes("node_modules/mapbox-gl")) {
            return "vendor-mapbox";
          }

          // ── Vendor: React core ───────────────────────────────────────────
          if (
            id.includes("node_modules/react/") ||
            id.includes("node_modules/react-dom/") ||
            id.includes("node_modules/scheduler/")
          ) {
            return "vendor-react";
          }

          // ── Vendor: Radix UI primitives ──────────────────────────────────
          if (id.includes("node_modules/@radix-ui/")) {
            return "vendor-radix";
          }

          // ── Vendor: Framer Motion ────────────────────────────────────────
          if (id.includes("node_modules/framer-motion")) {
            return "vendor-framer";
          }

          // ── Vendor: Tanstack Query ───────────────────────────────────────
          if (
            id.includes("node_modules/@tanstack/") ||
            id.includes("node_modules/react-query")
          ) {
            return "vendor-query";
          }

          // ── Vendor: Stripe ───────────────────────────────────────────────
          if (
            id.includes("node_modules/@stripe/") ||
            id.includes("node_modules/stripe")
          ) {
            return "vendor-stripe";
          }

          // ── Vendor: remaining large node_modules ─────────────────────────
          // Let Rollup's default splitting handle individual route chunks
          // (those come from the lazy() imports in App.tsx).
        },
      },
    },
  },
  server: {
    port,
    strictPort: true,
    host: "0.0.0.0",
    allowedHosts: true,
    fs: {
      strict: true,
      allow: [path.resolve(import.meta.dirname, "..", "..")],
    },
    proxy: {
      "/api": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
      "/ws": {
        target: "ws://localhost:8080",
        changeOrigin: true,
        ws: true,
      },
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
