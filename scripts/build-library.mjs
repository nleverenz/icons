import fs from "node:fs";
import path from "node:path";

const LIBRARY = path.resolve("library");
const OUTPUT = path.resolve("dist/aac");
const OUTPUT_SRC = path.join(OUTPUT, "src");

const IMAGE_TYPES = new Set([".png", ".jpg", ".jpeg", ".webp", ".svg"]);

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
fs.mkdirSync(OUTPUT_SRC, { recursive: true });

const files = scan(LIBRARY);

const records = files.map((sourceFile) => {
  const relative = path.relative(LIBRARY, sourceFile);
  const folders = path.dirname(relative).split(path.sep);

  const outputName = relative.replaceAll(path.sep, "__");
  const destination = path.join(OUTPUT_SRC, outputName);

  fs.copyFileSync(sourceFile, destination);

  return {
    name: niceName(sourceFile),
    file: `src/${outputName}`,
    properties: {},
    description: "",
    tags: folders
  };
});

const data = {
  name: "AAC Library",
  vendor: "aac",
  version: "1",
  variants: {},
  files: records
};

fs.writeFileSync(
  path.join(OUTPUT, "data.json"),
  JSON.stringify(data, null, 2)
);

console.log(`Built ${records.length} AAC asset(s).`);
