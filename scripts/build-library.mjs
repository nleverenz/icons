import fs from "node:fs";
import path from "node:path";

const LIBRARY = path.resolve("library");
const OUTPUT = path.resolve("dist/aac");
// Assets remain in library/ and are served through www/public/library.

const IMAGE_TYPES = new Set([".png", ".jpg", ".jpeg", ".webp", ".svg"]);

// Custom per-image keywords come from library/metadata.json, written by the
// local tagging tool (`pnpm tag` / scripts/tag-tool.mjs). Keyed by the same
// path used below as `libraryPath`. Missing/invalid file just means no one
// has tagged anything yet.
function loadKeywordsByPath() {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(LIBRARY, "metadata.json"), "utf8"));
    const map = {};
    for (const [key, entry] of Object.entries(raw ?? {})) {
      if (Array.isArray(entry?.keywords) && entry.keywords.length) {
        map[key] = entry.keywords;
      }
    }
    return map;
  } catch {
    return {};
  }
}

const keywordsByPath = loadKeywordsByPath();

function scan(dir) {
  const results = [];

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      results.push(...scan(fullPath));
      continue;
    }

    if (!IMAGE_TYPES.has(path.extname(entry.name).toLowerCase())) continue;

    results.push(fullPath);
  }

  return results;
}

function niceName(filename) {
  return path
    .basename(filename, path.extname(filename))
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

fs.rmSync(OUTPUT, { recursive: true, force: true });
fs.mkdirSync(OUTPUT, { recursive: true });

const files = scan(LIBRARY);

const records = files.map((sourceFile) => {
  const relative = path.relative(LIBRARY, sourceFile);
  const folders = path.dirname(relative).split(path.sep);

  const libraryPath = relative.split(path.sep).join("/");
  const keywords = keywordsByPath[libraryPath] ?? [];

  return {
    name: niceName(sourceFile),
    file: `/library/${libraryPath}`,
    properties: {},
    description: "",
    tags: [...folders, ...keywords]
  };
});

function buildTaxonomy(files) {
  const root = {};

  for (const sourceFile of files) {
    const relative = path.relative(LIBRARY, sourceFile);
    const folders = path.dirname(relative).split(path.sep);

    let current = root;

    for (const folder of folders) {
      if (!current[folder]) current[folder] = {};
      current = current[folder];
    }
  }

  return root;
}

const data = {
  name: "AAC",
  vendor: "aac",
  version: "1",
  variants: {},
  taxonomy: buildTaxonomy(files),
  files: records
};

fs.writeFileSync(
  path.join(OUTPUT, "data.json"),
  JSON.stringify(data, null, 2)
);

const taggedCount = Object.keys(keywordsByPath).length;
console.log(`Built ${records.length} AAC asset(s) (${taggedCount} with custom keywords).`);
