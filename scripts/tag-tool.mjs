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
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 0; padding: 24px 32px 100px; background: #fafafa; color: #111; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  p.sub { color: #666; font-size: 13px; margin: 0 0 20px; max-width: 640px; line-height: 1.5; }
  .toolbar { display: flex; gap: 12px; align-items: center; margin-bottom: 12px; flex-wrap: wrap; }
  .toolbar input[type="text"], .toolbar select { font-size: 14px; padding: 7px 10px; border: 1px solid #ccc; border-radius: 6px; }
  #filterText { min-width: 220px; }
  .count { font-size: 13px; color: #666; }
  .select-all { font-size: 13px; color: #444; display: flex; align-items: center; gap: 6px; cursor: pointer; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 16px; }
  .card { position: relative; background: #fff; border: 1px solid #e5e5e5; border-radius: 10px; padding: 12px; display: flex; flex-direction: column; gap: 8px; }
  .card img { width: 100%; height: 120px; object-fit: contain; background: #f4f4f4; border-radius: 6px; }
  .card .name { font-weight: 600; font-size: 13px; padding-right: 20px; }
  .card .crumb { font-size: 11px; color: #888; }
  .card input[type="text"] { font-size: 13px; padding: 6px 8px; border: 1px solid #ccc; border-radius: 6px; width: 100%; }
  .card input[type="text"]:focus { outline: 2px solid #6b7cff; border-color: transparent; }
  .card .saved { font-size: 11px; color: #16a34a; height: 14px; opacity: 0; transition: opacity 0.2s; }
  .card .saved.show { opacity: 1; }
  .card.has-tags { border-color: #cfe8d8; }
  .card.untagged { border-color: #f0d7a8; }
  .card.selected { border-color: #6b7cff; box-shadow: 0 0 0 1px #6b7cff; }
  .card .select-box { position: absolute; top: 10px; right: 10px; width: 16px; height: 16px; cursor: pointer; }
  .batch-bar { position: fixed; left: 0; right: 0; bottom: 0; background: #111; color: #fff; padding: 14px 32px; display: none; align-items: center; gap: 10px; flex-wrap: wrap; }
  .batch-bar.show { display: flex; }
  .batch-bar input[type="text"] { font-size: 14px; padding: 7px 10px; border: 1px solid #444; border-radius: 6px; min-width: 260px; background: #1c1c1c; color: #fff; }
  .batch-bar button { font-size: 13px; padding: 7px 14px; border-radius: 6px; border: none; cursor: pointer; }
  .batch-bar .apply { background: #6b7cff; color: #fff; font-weight: 600; }
  .batch-bar .clear { background: transparent; color: #ccc; text-decoration: underline; }
  .batch-bar .status { font-size: 12px; color: #9fe6b0; }
</style>
</head>
<body>
  <h1>Tag your AAC images</h1>
  <p class="sub">Type keywords for an image, separated by commas, then press Enter or click elsewhere to save. Check the box on several images to tag them all at once from the bar at the bottom. Saves go straight to <code>library/metadata.json</code>. When you're done, run <code>./scripts/update-site.sh</code>, then commit and push as usual to publish.</p>
  <div class="toolbar">
    <input type="text" id="filterText" placeholder="Filter by name or folder..." />
    <select id="filterMode">
      <option value="all">All images</option>
      <option value="untagged">Untagged only</option>
      <option value="tagged">Tagged only</option>
    </select>
    <label class="select-all"><input type="checkbox" id="selectAllVisible" /> Select all shown</label>
    <span class="count" id="count"></span>
  </div>
  <div class="grid" id="grid"></div>

  <div class="batch-bar" id="batchBar">
    <span id="batchCount">0 selected</span>
    <input type="text" id="batchInput" placeholder="add keywords to all selected, separated by comma" />
    <button class="apply" id="batchApply">Add to selected</button>
    <button class="clear" id="batchClear">Clear selection</button>
    <span class="status" id="batchStatus"></span>
  </div>

<script>
const records = ${JSON.stringify(records)};
const grid = document.getElementById("grid");
const filterText = document.getElementById("filterText");
const filterMode = document.getElementById("filterMode");
const countEl = document.getElementById("count");
const selectAllVisible = document.getElementById("selectAllVisible");
const batchBar = document.getElementById("batchBar");
const batchCount = document.getElementById("batchCount");
const batchInput = document.getElementById("batchInput");
const batchApply = document.getElementById("batchApply");
const batchClear = document.getElementById("batchClear");
const batchStatus = document.getElementById("batchStatus");

const selected = new Set();

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
  const tagCls = r.keywords.length ? "has-tags" : "untagged";
  const selCls = selected.has(r.libraryPath) ? " selected" : "";
  return (
    '<div class="card ' + tagCls + selCls + '" data-path="' + encodeURIComponent(r.libraryPath) + '">' +
    '<input type="checkbox" class="select-box" ' + (selected.has(r.libraryPath) ? "checked" : "") + ' />' +
    '<img src="' + r.assetUrl + '" alt="" loading="lazy" />' +
    '<div class="name">' + r.name + "</div>" +
    (r.breadcrumb ? '<div class="crumb">' + r.breadcrumb + "</div>" : "") +
    '<input type="text" class="keywords-input" value="' + r.keywords.join(", ").replace(/"/g, "&quot;") + '" placeholder="keywords, separated, by comma" />' +
    '<div class="saved">Saved</div>' +
    "</div>"
  );
}

function render() {
  const visible = records.filter(matchesFilter);
  grid.innerHTML = visible.map(cardHtml).join("");
  updateCount();
  updateBatchBar();
  const anyUnselectedVisible = visible.some((r) => !selected.has(r.libraryPath));
  selectAllVisible.checked = visible.length > 0 && !anyUnselectedVisible;
}

function updateBatchBar() {
  batchBar.classList.toggle("show", selected.size > 0);
  batchCount.textContent = selected.size + " selected";
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
    savedEl.classList.remove("show");
    savedEl.textContent = "Saved";
    savedEl.style.color = "";
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
    if (!input.classList || !input.classList.contains("keywords-input")) return;
    const card = input.closest(".card");
    const libraryPath = decodeURIComponent(card.dataset.path);
    const savedEl = card.querySelector(".saved");
    save(libraryPath, input, savedEl, card);
  },
  true,
);

grid.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && e.target.classList && e.target.classList.contains("keywords-input")) {
    e.target.blur();
  }
});

grid.addEventListener("change", (e) => {
  const box = e.target;
  if (!box.classList || !box.classList.contains("select-box")) return;
  const card = box.closest(".card");
  const libraryPath = decodeURIComponent(card.dataset.path);
  if (box.checked) {
    selected.add(libraryPath);
    card.classList.add("selected");
  } else {
    selected.delete(libraryPath);
    card.classList.remove("selected");
  }
  updateBatchBar();
});

selectAllVisible.addEventListener("change", () => {
  const visible = records.filter(matchesFilter);
  if (selectAllVisible.checked) {
    visible.forEach((r) => selected.add(r.libraryPath));
  } else {
    visible.forEach((r) => selected.delete(r.libraryPath));
  }
  render();
});

batchClear.addEventListener("click", () => {
  selected.clear();
  batchInput.value = "";
  batchStatus.textContent = "";
  render();
});

batchApply.addEventListener("click", async () => {
  const additions = batchInput.value.split(",").map((s) => s.trim()).filter(Boolean);
  if (!additions.length || selected.size === 0) return;
  batchApply.disabled = true;
  batchStatus.textContent = "Saving...";
  try {
    const paths = Array.from(selected);
    const res = await fetch("/api/batch-save", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ paths, add: additions }),
    });
    if (!res.ok) throw new Error("batch save failed");
    const result = await res.json();
    for (const [libraryPath, keywords] of Object.entries(result.updated)) {
      const record = records.find((r) => r.libraryPath === libraryPath);
      if (record) record.keywords = keywords;
    }
    batchInput.value = "";
    batchStatus.textContent = "Added \\"" + additions.join(", ") + "\\" to " + paths.length + " image(s).";
    render();
    setTimeout(() => { batchStatus.textContent = ""; }, 3000);
  } catch (err) {
    batchStatus.textContent = "Save failed - try again.";
  } finally {
    batchApply.disabled = false;
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

  if (req.method === "POST" && url.pathname === "/api/batch-save") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        const parsed = JSON.parse(body);
        const paths = Array.isArray(parsed.paths) ? parsed.paths.filter((p) => typeof p === "string") : [];
        const additions = Array.isArray(parsed.add)
          ? parsed.add.map((k) => String(k).trim()).filter(Boolean)
          : [];
        if (!paths.length || !additions.length) throw new Error("missing paths or keywords to add");

        const metadata = loadMetadata();
        const updated = {};
        for (const libraryPath of paths) {
          const existing = Array.isArray(metadata[libraryPath]?.keywords)
            ? metadata[libraryPath].keywords
            : [];
          // Merge, de-duplicated, case-insensitively, keeping first-seen casing.
          const merged = [...existing];
          for (const word of additions) {
            if (!merged.some((k) => k.toLowerCase() === word.toLowerCase())) merged.push(word);
          }
          metadata[libraryPath] = { keywords: merged };
          updated[libraryPath] = merged;
        }
        saveMetadata(metadata);

        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: true, updated }));
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
