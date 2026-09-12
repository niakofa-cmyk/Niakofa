import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const appPath = resolve(root, "artifacts/pay-it-forward/src/App.tsx");
const source = readFileSync(appPath, "utf8");

const importedModules = new Map();
const importPatterns = [
  /import\s+(\w+)\s+from\s+["']@\/(pages|components)\/([^"']+)["']/g,
  /(?:const|let)\s+(\w+)\s*=\s*lazy\(\(\)\s*=>\s*import\(["']@\/(pages|components)\/([^"']+)["']\)/g,
];

for (const pattern of importPatterns) {
  for (const match of source.matchAll(pattern)) {
    importedModules.set(match[1], {
      root: match[2],
      module: match[3],
    });
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
    imported: importedModules.get(component),
  });
}

const fallbackRoute = source.match(/<Route\s+component=\{(\w+)\}\s*\/>/);
if (fallbackRoute) {
  routes.push({
    path: "<fallback>",
    component: fallbackRoute[1],
    inline: false,
    imported: importedModules.get(fallbackRoute[1]),
  });
}

const duplicatePaths = routes
  .filter((route) => route.path !== "<fallback>")
  .map((route) => route.path)
  .filter((path, index, paths) => paths.indexOf(path) !== index);

const missingImports = routes.filter(
  (route) => route.path !== "<fallback>" && !route.inline && !route.imported,
);

const missingModules = routes.filter((route) => {
  if (!route.imported) return false;
  const moduleRoot = resolve(
    root,
    "artifacts/pay-it-forward/src",
    route.imported.root,
  );
  return ![".ts", ".tsx"].some((extension) =>
    existsSync(resolve(moduleRoot, `${route.imported.module}${extension}`)),
  );
});

console.log(`Route audit: ${routes.length - 1} declared routes + fallback`);
console.log(`Component/page imports: ${importedModules.size}`);
console.log(`Inline routes: ${routes.filter((route) => route.inline).length}`);

if (duplicatePaths.length > 0) {
  console.error(`Duplicate route paths: ${[...new Set(duplicatePaths)].join(", ")}`);
}

if (missingImports.length > 0) {
  for (const route of missingImports) {
    console.error(
      `Missing route component import: ${route.path} -> ${route.component}`,
    );
  }
}

if (missingModules.length > 0) {
  for (const route of missingModules) {
    console.error(
      `Missing route module: ${route.path} -> @/${route.imported.root}/${route.imported.module}`,
    );
  }
}

if (duplicatePaths.length || missingImports.length || missingModules.length) {
  process.exitCode = 1;
} else {
  console.log("✓ Every declared route resolves to an imported page/component or explicit inline component.");
}