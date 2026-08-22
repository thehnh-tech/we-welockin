// Regenerates lib/university/domains.json from the community dataset at
// https://github.com/glean/university-email-domains (7k+ institutions, one
// TOML file per domain: name / sld / tld).
//
// Usage:
//   node scripts/build-university-domains.mjs [path-to-existing-clone]
//
// Without an argument it shallow-clones into a temp directory and removes it
// afterwards. The clone uses --no-checkout and files are read through
// `git cat-file --batch`: the dataset contains a domain literally named
// "nul.ls" whose file cannot exist on a Windows working tree.

import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_URL = "https://github.com/glean/university-email-domains.git";
const OUT = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "lib",
  "university",
  "domains.json"
);

const argPath = process.argv[2];
let repoPath = argPath;
let cleanup = null;

if (!repoPath) {
  repoPath = mkdtempSync(join(tmpdir(), "uni-domains-"));
  cleanup = () => rmSync(repoPath, { recursive: true, force: true });
  console.log(`Cloning ${REPO_URL} (shallow, no checkout)...`);
  execFileSync(
    "git",
    ["clone", "--depth", "1", "--no-checkout", REPO_URL, repoPath],
    { stdio: "inherit" }
  );
}

function git(...args) {
  return execFileSync("git", ["-C", repoPath, ...args], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
}

const paths = git("ls-tree", "-r", "--name-only", "HEAD")
  .split("\n")
  .filter((p) => p.endsWith(".toml"));
console.log(`${paths.length} domain files in dataset`);

// The file NAME is the domain ("a/ac.ke/mmu.ac.ke.toml" -> "mmu.ac.ke"). It is
// the authoritative key: a handful of upstream files carry another school's
// sld/tld in their body, and deriving the key from those would drop a real
// domain on top of a duplicate.
const domainOfPath = (p) => p.slice(p.lastIndexOf("/") + 1, -".toml".length);

// Read every blob through one `git cat-file --batch` process.
const blobs = await new Promise((resolve, reject) => {
  const child = spawn("git", ["-C", repoPath, "cat-file", "--batch"], {
    stdio: ["pipe", "pipe", "inherit"],
  });
  const chunks = [];
  child.stdout.on("data", (c) => chunks.push(c));
  child.on("error", reject);
  child.on("close", (code) => {
    if (code !== 0) return reject(new Error(`git cat-file exited ${code}`));
    resolve(Buffer.concat(chunks));
  });
  child.stdin.write(paths.map((p) => `HEAD:${p}`).join("\n") + "\n");
  child.stdin.end();
});

// --batch output: "<sha> <type> <size>\n<raw content>\n" repeated, in the same
// order as the requested paths.
const entries = [];
let off = 0;
let cursor = 0;
while (off < blobs.length) {
  const nl = blobs.indexOf(0x0a, off);
  if (nl === -1) break;
  const header = blobs.toString("utf8", off, nl);
  if (header.endsWith("missing")) {
    cursor++;
    off = nl + 1;
    continue;
  }
  const size = parseInt(header.split(" ")[2], 10);
  entries.push({
    path: paths[cursor++],
    src: blobs.toString("utf8", nl + 1, nl + 1 + size),
  });
  off = nl + 1 + size + 1; // trailing newline after content
}

// Minimal TOML reader for this dataset's `key = "value"` shape. Some `name`
// values contain literal newlines (several institutions sharing one domain) —
// the value pattern therefore spans lines and honors backslash escapes.
function tomlValue(src, key) {
  const m = src.match(
    new RegExp(`^${key}\\s*=\\s*"((?:[^"\\\\]|\\\\.)*)"`, "m")
  );
  return m ? m[1].replace(/\\(.)/g, "$1") : null;
}

// Upstream names are HTML-escaped ("Science &amp; Technology"). Every consumer
// renders them as text — React escapes, the mailer escapes again — so the
// entities have to come out here or they show up literally on screen.
const ENTITIES = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};
function decodeEntities(s) {
  return s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, body) => {
    if (body[0] === "#") {
      const cp =
        body[1] === "x" || body[1] === "X"
          ? parseInt(body.slice(2), 16)
          : parseInt(body.slice(1), 10);
      return Number.isFinite(cp) && cp > 0 && cp <= 0x10ffff
        ? String.fromCodePoint(cp)
        : whole;
    }
    const key = body.toLowerCase();
    return key in ENTITIES ? ENTITIES[key] : whole;
  });
}

const map = {};
let skipped = 0;
let collisions = 0;
let mismatches = 0;
for (const { path, src } of entries) {
  const rawName = tomlValue(src, "name");
  // Multi-name files: the first listed institution is the display name.
  const name = rawName
    ?.split("\n")
    .map((s) => s.trim())
    .filter(Boolean)[0];
  if (!name) {
    skipped++;
    console.warn(`  skipped (no name): ${path}`);
    continue;
  }

  const domain = domainOfPath(path).toLowerCase();
  const sld = tomlValue(src, "sld");
  const tld = tomlValue(src, "tld");
  if (sld && tld && `${sld}.${tld}`.toLowerCase() !== domain) {
    // Upstream data error: the body describes a different domain than the
    // filename. Keeping the filename means the domain stays reachable.
    mismatches++;
    console.warn(`  body/filename mismatch: ${path} says ${sld}.${tld}`);
  }
  if (domain in map) {
    collisions++;
    console.warn(`  duplicate domain, keeping first: ${domain} (${path})`);
    continue;
  }
  map[domain] = decodeEntities(name);
}

const sorted = Object.fromEntries(
  Object.keys(map)
    .sort()
    .map((k) => [k, map[k]])
);

writeFileSync(OUT, JSON.stringify(sorted, null, 0) + "\n");
console.log(
  `Wrote ${Object.keys(sorted).length} domains to ${OUT} ` +
    `(${skipped} skipped, ${collisions} duplicate domains, ` +
    `${mismatches} body/filename mismatches)`
);

if (cleanup) cleanup();
