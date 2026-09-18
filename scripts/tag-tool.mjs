// Local-only tagging tool for the AAC library.
//
// Run with `pnpm tag` (or `node scripts/tag-tool.mjs`) from the repo root,
// then open the printed URL in your browser. Type keywords under any image
// and they save straight to library/metadata.json as you go — nothing to
// edit by hand. This server never runs on the deployed site; it's just for
// your own machine.
//
// After tagging, publish as usual:
//   ./scripts/update-site.sh
//   git add -A && git commit -m "Tag images" && git push

import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import http from "node:http";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, "..");
const LIBRARY = path.join(ROOT, "library");
const METADATA_PATH = path.join(LIBRARY, "metadata.json");

const IMAGE_TYPES = new Set([".png", ".jpg", ".jpeg", ".webp", ".svg"]);
const CONTENT_TYPES = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
};

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

function loadMetadata() {
  try {
    const raw = JSON.parse(fs.readFileSync(METADATA_PATH, "utf8"));
    return raw && typeof raw === "object" ? raw : {};
  } catch {
    return {};
  }
}

function saveMetadata(data) {
  fs.mkdirSync(LIBRARY, { recursive: true });
  fs.writeFileSync(METADATA_PATH, JSON.stringify(data, null, 2) + "\n");
}

function buildRecords() {
  const metadata = loadMetadata();
  const files = scan(LIBRARY).filter(
    (f) => path.resolve(f) !== path.resolve(METADATA_PATH),
  );

  return files
    .map((sourceFile) => {
      const relative = path.relative(LIBRARY, sourceFile);
      const libraryPath = relative.split(path.sep).join("/");
      const folders = path.dirname(relative).split(path.sep);
      const existing = metadata[libraryPath]?.keywords;
      return {
        libraryPath,
        assetUrl: "/asset/" + libraryPath.split("/").map(encodeURIComponent).join("/"),
        name: niceName(sourceFile),
        breadcrumb: folders.slice(1).join(" / ") || folders.join(" / "),
        keywords: Array.isArray(existing) ? existing : [],
      };
    })
    .sort((a, b) => a.libraryPath.localeCompare(b.libraryPath));
}

function renderPage() {
  const records = buildRecords();
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Tag AAC images</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 0; padding: 24px 32px 80px; background: #fafafa; color: #111; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  p.sub { color: #666; font-size: 13px; margin: 0 0 20px; max-width: 640px; line-height: 1.5; }
  .toolbar { display: flex; gap: 12px; align-items: center; margin-bottom: 20px; flex-wrap: wrap; }
  .toolbar input[type="text"], .toolbar select { font-size: 14px; padding: 7px 10px; border: 1px solid #ccc; border-radius: 6px; }
  #filterText { min-width: 220px; }
  .count { font-size: 13px; color: #666; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 16px; }
  .card { background: #fff; border: 1px solid #e5e5e5; border-radius: 10px; padding: 12px; display: flex; flex-direction: column; gap: 8px; }
  .card img { width: 100%; height: 120px; object-fit: contain; background: #f4f4f4; border-radius: 6px; }
  .card .name { font-weight: 600; font-size: 13px; }
  .card .crumb { font-size: 11px; color: #888; }
  .card input[type="text"] { font-size: 13px; padding: 6px 8px; border: 1px solid #ccc; border-radius: 6px; width: 100%; }
  .card input[type="text"]:focus { outline: 2px solid #6b7cff; border-color: transparent; }
  .card .saved { font-size: 11px; color: #16a34a; height: 14px; opacity: 0; transition: opacity 0.2s; }
  .card .saved.show { opacity: 1; }
  .card.has-tags { border-color: #cfe8d8; }
  .card.untagged { border-color: #f0d7a8; }
</style>
</head>
<body>
  <h1>Tag your AAC images</h1>
  <p class="sub">Type keywords for an image, separated by commas, then press Enter or click elsewhere to save. Saves go straight to <code>library/metadata.json</code>. When you're done, run <code>./scripts/update-site.sh</code>, then commit and push as usual to publish.</p>
  <div class="toolbar">
    <input type="text" id="filterText" placeholder="Filter by name or folder..." />
    <select id="filterMode">
      <option value="all">All images</option>
      <option value="untagged">Untagged only</option>
      <option value="tagged">Tagged only</option>
    </select>
    <span class="count" id="count"></span>
  </div>
  <div class="grid" id="grid"></div>

<script>
const records = ${JSON.stringify(records)};
const grid = document.getElementById("grid");
const filterText = document.getElementById("filterText");
const filterMode = document.getElementById("filterMode");
const countEl = document.getElementById("count");

function updateCount() {
  const total = records.length;
  const tagged = records.filter((r) => r.keywords.length).length;
  countEl.textContent = tagged + " of " + total + " tagged";
}

function matchesFilter(r) {
  const text = filterText.value.trim().toLowerCase();
  if (text) {
    const haystack = (r.name + " " + r.breadcrumb).toLowerCase();
    if (!haystack.includes(text)) return false;
  }
  const mode = filterMode.value;
  if (mode === "untagged" && r.keywords.length) return false;
  if (mode === "tagged" && !r.keywords.length) return false;
  return true;
}

function cardHtml(r) {
  const cls = r.keywords.length ? "has-tags" : "untagged";
  return (
    '<div class="card ' + cls + '" data-path="' + encodeURIComponent(r.libraryPath) + '">' +
    '<img src="' + r.assetUrl + '" alt="" loading="lazy" />' +
    '<div class="name">' + r.name + "</div>" +
    (r.breadcrumb ? '<div class="crumb">' + r.breadcrumb + "</div>" : "") +
    '<input type="text" value="' + r.keywords.join(", ").replace(/"/g, "&quot;") + '" placeholder="keywords, separated, by comma" />' +
    '<div class="saved">Saved</div>' +
    "</div>"
  );
}

function render() {
  const visible = records.filter(matchesFilter);
  grid.innerHTML = visible.map(cardHtml).join("");
  updateCount();
}

async function save(libraryPath, input, savedEl, card) {
  const keywords = input.value.split(",").map((s) => s.trim()).filter(Boolean);
  try {
    const res = await fetch("/api/save", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ libraryPath, keywords }),
    });
    if (!res.ok) throw new Error("save failed");
    const record = records.find((r) => r.libraryPath === libraryPath);
    if (record) record.keywords = keywords;
    card.classList.toggle("has-tags", keywords.length > 0);
    card.classList.toggle("untagged", keywords.length === 0);
    savedEl.classList.add("show");
    updateCount();
    setTimeout(() => savedEl.classList.remove("show"), 1200);
  } catch (err) {
    savedEl.textContent = "Save failed";
    savedEl.style.color = "#dc2626";
    savedEl.classList.add("show");
  }
}

grid.addEventListener(
  "blur",
  (e) => {
    const input = e.target;
    if (input.tagName !== "INPUT") return;
    const card = input.closest(".card");
    const libraryPath = decodeURIComponent(card.dataset.path);
    const savedEl = card.querySelector(".saved");
    save(libraryPath, input, savedEl, card);
  },
  true,
);

grid.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && e.target.tagName === "INPUT") {
    e.target.blur();
  }
});

filterText.addEventListener("input", render);
filterMode.addEventListener("change", render);

render();
</script>
</body>
</html>`;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");

  if (req.method === "GET" && url.pathname === "/") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(renderPage());
    return;
  }

  if (req.method === "GET" && url.pathname.startsWith("/asset/")) {
    const rel = url.pathname
      .slice("/asset/".length)
      .split("/")
      .map(decodeURIComponent)
      .join(path.sep);
    const resolved = path.resolve(LIBRARY, rel);
    if (!resolved.startsWith(path.resolve(LIBRARY) + path.sep)) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }
    try {
      const data = await fsp.readFile(resolved);
      const ext = path.extname(resolved).toLowerCase();
      res.writeHead(200, { "content-type": CONTENT_TYPES[ext] ?? "application/octet-stream" });
      res.end(data);
    } catch {
      res.writeHead(404);
      res.end("Not found");
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/save") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        const parsed = JSON.parse(body);
        const libraryPath = parsed.libraryPath;
        if (typeof libraryPath !== "string" || !libraryPath) throw new Error("missing libraryPath");
        const keywords = Array.isArray(parsed.keywords)
          ? parsed.keywords.map((k) => String(k).trim()).filter(Boolean)
          : [];

        const metadata = loadMetadata();
        if (keywords.length) {
          metadata[libraryPath] = { keywords };
        } else {
          delete metadata[libraryPath];
        }
        saveMetadata(metadata);

        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: true, count: keywords.length }));
      } catch (err) {
        res.writeHead(400, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: String(err) }));
      }
    });
    return;
  }

  res.writeHead(404);
  res.end("Not found");
});

const PORT = process.env.PORT ? Number(process.env.PORT) : 4321;
server.listen(PORT, () => {
  console.log(`\nTag your images at http://localhost:${PORT}\n`);
});
