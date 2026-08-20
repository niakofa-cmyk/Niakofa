import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const appPath = resolve(root, "artifacts/pay-it-forward/src/App.tsx");
const pagesRoot = resolve(root, "artifacts/pay-it-forward/src/pages");
const source = readFileSync(appPath, "utf8");

const importedPages = new Map();
const importPatterns = [
  /import\s+(\w+)\s+from\s+["']@\/pages\/([^"']+)["']/g,
  /(?:const|let)\s+(\w+)\s*=\s*lazy\(\(\)\s*=>\s*import\(["']@\/pages\/([^"']+)["']\)/g,
];

for (const pattern of importPatterns) {
  for (const match of source.matchAll(pattern)) {
    importedPages.set(match[1], match[2]);
  }
}

const routes = [];
const routePattern =
  /<Route\s+path=["']([^"']+)["']\s+component=\{([^}]+)\}\s*\/>/g;

for (const match of source.matchAll(routePattern)) {
  const path = match[1];
  const component = match[2].trim();
  routes.push({
    path,
    component,
    inline: component.startsWith("()"),
    page: importedPages.get(component),
  });
}

const fallbackRoute = source.match(/<Route\s+component=\{(\w+)\}\s*\/>/);
if (fallbackRoute) {
  routes.push({
    path: "<fallback>",
    component: fallbackRoute[1],
    inline: false,
    page: importedPages.get(fallbackRoute[1]),
  });
}

const duplicatePaths = routes
  .filter((route) => route.path !== "<fallback>")
  .map((route) => route.path)
  .filter((path, index, paths) => paths.indexOf(path) !== index);

const missingImports = routes.filter(
  (route) => route.path !== "<fallback>" && !route.inline && !route.page,
);

const missingPages = routes.filter((route) => {
  if (!route.page) return false;
  return ![".ts", ".tsx"].some((extension) =>
    existsSync(resolve(pagesRoot, `${route.page}${extension}`)),
  );
});

console.log(`Route audit: ${routes.length - 1} declared routes + fallback`);
console.log(`Page imports: ${importedPages.size}`);
console.log(`Inline routes: ${routes.filter((route) => route.inline).length}`);

if (duplicatePaths.length > 0) {
  console.error(`Duplicate route paths: ${[...new Set(duplicatePaths)].join(", ")}`);
}

if (missingImports.length > 0) {
  for (const route of missingImports) {
    console.error(
      `Missing page import: ${route.path} -> ${route.component}`,
    );
  }
}

if (missingPages.length > 0) {
  for (const route of missingPages) {
    console.error(`Missing page module: ${route.path} -> ${route.page}`);
  }
}

if (duplicatePaths.length || missingImports.length || missingPages.length) {
  process.exitCode = 1;
} else {
  console.log("✓ Every declared route resolves to an imported page or explicit inline component.");
}