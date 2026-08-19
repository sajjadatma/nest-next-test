import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const messagesDir = path.join(root, "src", "i18n", "messages");
const source = JSON.parse(await readFile(path.join(messagesDir, "extracted.en.json"), "utf8"));
const targetPath = path.join(messagesDir, "fa.json");
const target = JSON.parse(await readFile(targetPath, "utf8"));
const missing = Object.keys(source).filter((key) => !target[key]);

async function translate(text) {
  const url = new URL("https://translate.googleapis.com/translate_a/single");
  url.searchParams.set("client", "gtx");
  url.searchParams.set("sl", "en");
  url.searchParams.set("tl", "fa");
  url.searchParams.set("dt", "t");
  url.searchParams.set("q", text);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Translation failed (${response.status}) for: ${text}`);
  const data = await response.json();
  return data[0].map((part) => part[0]).join("");
}

const concurrency = 12;
let completed = 0;
await Promise.all(Array.from({ length: concurrency }, async () => {
  while (missing.length) {
    const key = missing.shift();
    if (!key) return;
    target[key] = await translate(key);
    completed += 1;
    if (completed % 25 === 0) console.log(`Translated ${completed}/${Object.keys(source).length - Object.keys(target).filter((key) => !source[key]).length}.`);
  }
}));

await writeFile(targetPath, `${JSON.stringify(Object.fromEntries(Object.entries(target).sort(([a], [b]) => a.localeCompare(b, "en"))), null, 2)}\n`);
console.log(`Wrote ${Object.keys(target).length} Persian messages.`);
