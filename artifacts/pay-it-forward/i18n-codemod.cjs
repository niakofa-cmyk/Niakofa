// eslint-disable-next-line @typescript-eslint/no-require-imports
const ts = require("typescript");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = require("fs");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const path = require("path");

const filePath = process.argv[2];
const namespace = process.argv[3];
const dryRun = process.argv.includes("--dry-run");

const source = fs.readFileSync(filePath, "utf8");
const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

const ATTR_ALLOWLIST = new Set(["title", "placeholder", "aria-label", "alt", "label"]);
const edits = [];
const keyMap = {};
const usedKeys = new Set();

function isTranslatable(text) {
  const trimmed = text.trim();
  if (trimmed.length < 2) return false;
  if (!/[a-zA-Z]/.test(trimmed)) return false;
  if (/^[\d\s.,:%$/-]+$/.test(trimmed)) return false;
  return true;
}

function slugify(text) {
  let slug = text.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim().split(/\s+/).slice(0, 6).join("_");
  if (!slug) slug = "text";
  let finalSlug = slug, i = 2;
  while (usedKeys.has(finalSlug)) { finalSlug = `${slug}_${i}`; i++; }
  usedKeys.add(finalSlug);
  return finalSlug;
}

function registerKey(text) {
  const key = slugify(text);
  keyMap[key] = text;
  return key;
}

// Track top-level component functions (direct children of sourceFile: a
// FunctionDeclaration, or a VariableStatement whose initializer is a
// function/arrow). For each, record its body range and whether any edit
// falls inside it -- if so, we inject `const { t } = useTranslation();`
// right after its opening brace. Nested closures (IIFEs, .map callbacks,
// onClick handlers) are NOT given their own hook call -- they close over
// the outer component's `t` via normal JS lexical scoping.
const topLevelComponents = [];
sourceFile.forEachChild(node => {
  let fn = null;
  if (ts.isFunctionDeclaration(node) && node.body) {
    fn = node;
  } else if (ts.isVariableStatement(node)) {
    for (const decl of node.declarationList.declarations) {
      if (decl.initializer && (ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer)) && decl.initializer.body && ts.isBlock(decl.initializer.body)) {
        fn = decl.initializer;
      }
    }
  } else if (ts.isExportAssignment(node)) {
    // not used here
  }
  if (fn && ts.isBlock(fn.body)) {
    topLevelComponents.push({ bodyStart: fn.body.getStart() + 1, range: [fn.getStart(), fn.getEnd()], hasEdit: false });
  }
});

function findEnclosingComponent(pos) {
  for (const comp of topLevelComponents) {
    if (pos >= comp.range[0] && pos <= comp.range[1]) return comp;
  }
  return null;
}

function addEdit(start, end, replacement) {
  edits.push({ start, end, replacement });
  const comp = findEnclosingComponent(start);
  if (comp) comp.hasEdit = true;
}

function visit(node) {
  if (ts.isJsxText(node)) {
    const raw = source.slice(node.pos, node.end);
    const trimmed = raw.trim();
    if (isTranslatable(raw)) {
      const leadingLen = raw.indexOf(trimmed);
      const startOffset = node.pos + leadingLen;
      const endOffset = startOffset + trimmed.length;
      const key = registerKey(trimmed);
      addEdit(startOffset, endOffset, `{t("${namespace}.${key}")}`);
    }
  } else if (ts.isJsxAttribute(node)) {
    const name = node.name.getText();
    if (ATTR_ALLOWLIST.has(name) && node.initializer && ts.isStringLiteral(node.initializer)) {
      const text = node.initializer.text;
      if (isTranslatable(text)) {
        const key = registerKey(text);
        addEdit(node.initializer.getStart(), node.initializer.getEnd(), `{t("${namespace}.${key}")}`);
      }
    }
  } else if (ts.isJsxExpression(node) && node.expression && ts.isStringLiteral(node.expression)) {
    const text = node.expression.text;
    if (isTranslatable(text)) {
      const key = registerKey(text);
      addEdit(node.expression.getStart(), node.expression.getEnd(), `t("${namespace}.${key}")`);
    }
  } else if (
    ts.isCallExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === "toast" &&
    node.arguments.length > 0 &&
    ts.isObjectLiteralExpression(node.arguments[0])
  ) {
    for (const prop of node.arguments[0].properties) {
      if (
        ts.isPropertyAssignment(prop) &&
        (prop.name.getText() === "title" || prop.name.getText() === "description") &&
        ts.isStringLiteral(prop.initializer)
      ) {
        const text = prop.initializer.text;
        if (isTranslatable(text)) {
          const key = registerKey(text);
          addEdit(prop.initializer.getStart(), prop.initializer.getEnd(), `t("${namespace}.${key}")`);
        }
      }
    }
  }
  ts.forEachChild(node, visit);
}

visit(sourceFile);

// Add hook-injection edits for each component that had at least one edit
for (const comp of topLevelComponents) {
  if (comp.hasEdit) {
    edits.push({ start: comp.bodyStart, end: comp.bodyStart, replacement: "\n  const { t } = useTranslation();" });
  }
}

edits.sort((a, b) => b.start - a.start);
let result = source;
for (const e of edits) {
  result = result.slice(0, e.start) + e.replacement + result.slice(e.end);
}

if (!result.includes('from "react-i18next"')) {
  const importRegex = /^import .+;\n/gm;
  let lastImportEnd = 0, m;
  while ((m = importRegex.exec(result)) !== null) lastImportEnd = m.index + m[0].length;
  result = result.slice(0, lastImportEnd) + 'import { useTranslation } from "react-i18next";\n' + result.slice(lastImportEnd);
}

console.log(`Found ${edits.filter(e => !e.replacement.startsWith("\n  const")).length} translatable strings, injected hook into ${topLevelComponents.filter(c => c.hasEdit).length} component(s), namespace "${namespace}"`);
console.log(JSON.stringify(keyMap, null, 2));

if (dryRun) {
  fs.writeFileSync(filePath + ".preview.tsx", result);
  console.log(`\nDry run: wrote preview to ${filePath}.preview.tsx`);
} else {
  fs.writeFileSync(filePath, result);
  fs.writeFileSync(path.join(path.dirname(filePath), `${namespace}.i18n-keys.json`), JSON.stringify(keyMap, null, 2));
  console.log(`\nApplied. Key map saved.`);
}
