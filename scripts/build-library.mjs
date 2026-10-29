import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const LIBRARY = path.resolve("library");
const OUTPUT = path.resolve("dist/aac");
// Assets remain in library/ and are served through www/public/library.

const IMAGE_TYPES = new Set([".png", ".jpg", ".jpeg", ".webp", ".svg"]);
// Documents get a generated page-1 thumbnail (via poppler's pdftoppm) instead
// of being displayed directly — a browser can't render a PDF as an <img>.
const DOC_TYPES = new Set([".pdf"]);

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

    const ext = path.extname(entry.name).toLowerCase();
    if (!IMAGE_TYPES.has(ext) && !DOC_TYPES.has(ext)) continue;

    results.push(fullPath);
  }

  return results;
}

// Renders page 1 of a PDF to a PNG via poppler's pdftoppm (brew/apt package
// "poppler"/"poppler-utils") so it has something an <img> can show. Thumbnails
// are build output — regenerated every run, never committed — so this always
// runs, not just for new/changed files.
function renderPdfThumbnail(sourceFile, destPngPath) {
  fs.mkdirSync(path.dirname(destPngPath), { recursive: true });
  const tmpPrefix = destPngPath.replace(/\.png$/, "");
  try {
    execFileSync("pdftoppm", ["-png", "-f", "1", "-l", "1", "-scale-to", "800", sourceFile, tmpPrefix], {
      stdio: ["ignore", "ignore", "pipe"],
    });
  } catch (err) {
    if (err.code === "ENOENT") {
      throw new Error(
        `pdftoppm not found (needed to preview "${path.relative(LIBRARY, sourceFile)}"). ` +
          `Install poppler: "brew install poppler" on macOS, "apt-get install poppler-utils" on Linux/CI.`,
      );
    }
    throw new Error(`Failed to render a preview for "${path.relative(LIBRARY, sourceFile)}": ${err.message}`);
  }
  // pdftoppm names single-page output "<prefix>-1.png" — move it to the exact path we want.
  fs.renameSync(`${tmpPrefix}-1.png`, destPngPath);
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

  // sourceFile is always the real asset (what Download/View raw should give
  // you). file is what gets shown as an <img> — same as sourceFile for a
  // normal image, a generated page-1 thumbnail for a PDF.
  const sourceUrl = `/library/${libraryPath}`;
  let fileUrl = sourceUrl;

  if (DOC_TYPES.has(path.extname(sourceFile).toLowerCase())) {
    const previewRelative = relative.replace(/\.pdf$/i, ".png");
    const previewAbsPath = path.join(OUTPUT, "previews", previewRelative);
    renderPdfThumbnail(sourceFile, previewAbsPath);
    fileUrl = `/dist/aac/previews/${previewRelative.split(path.sep).join("/")}`;
  }

  return {
    name: niceName(sourceFile),
    file: fileUrl,
    sourceFile: sourceUrl,
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
