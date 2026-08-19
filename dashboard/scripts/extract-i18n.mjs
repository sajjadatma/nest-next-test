import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import ts from "typescript";

const root = path.resolve(import.meta.dirname, "..");
const sourceRoot = path.join(root, "src");
const output = path.join(sourceRoot, "i18n", "messages", "extracted.en.json");
const translatableAttributes = new Set(["aria-label", "placeholder", "title", "alt"]);
const messages = new Set();

async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map((entry) => entry.isDirectory() ? files(path.join(directory, entry.name)) : entry.name.endsWith(".tsx") && !entry.name.endsWith(".test.tsx") ? [path.join(directory, entry.name)] : []))).flat();
}

function add(value) {
  const text = value.replaceAll("&amp;", "&").replaceAll("&nbsp;", " ").replace(/\s+/g, " ").trim();
  if (text.length > 1 && /[A-Za-z\u0600-\u06ff]/.test(text)) messages.add(text);
}

function inspect(node) {
  if (ts.isJsxText(node)) add(node.getText());
  if (ts.isJsxExpression(node) && node.expression && ts.isStringLiteral(node.expression)) add(node.expression.text);
  if (ts.isJsxAttribute(node) && translatableAttributes.has(node.name.text) && node.initializer && ts.isStringLiteral(node.initializer)) add(node.initializer.text);
  ts.forEachChild(node, inspect);
}

for (const file of await files(sourceRoot)) inspect(ts.createSourceFile(file, await readFile(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX));
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(Object.fromEntries([...messages].sort().map((key) => [key, key])), null, 2)}\n`);
console.log(`Extracted ${messages.size} messages to ${path.relative(root, output)}.`);
