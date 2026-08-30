/* eslint-disable @typescript-eslint/no-require-imports */
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");

const { PDFParse } = require("pdf-parse");
const { createWorker } = require("tesseract.js");

const LIMITS = Object.freeze({
  maxFiles: 2_000,
  maxDepth: 8,
  maxFileBytes: 15 * 1024 * 1024,
  maxExcerptCharacters: 2_000,
  maxSearchMilliseconds: 55_000,
  maxInspectedFiles: 24,
  maxOcrImages: 10,
});

const TEXT_EXTENSIONS = new Set([".txt", ".md", ".csv", ".json"]);
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".bmp"]);
const SUPPORTED_EXTENSIONS = new Set([
  ...TEXT_EXTENSIONS,
  ...IMAGE_EXTENSIONS,
  ".pdf",
]);
const SKIPPED_DIRECTORIES = new Set([
  ".git",
  ".next",
  "node_modules",
  "appdata",
  "windows",
  "$recycle.bin",
]);
const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "for",
  "find",
  "me",
  "my",
  "of",
  "please",
  "the",
  "to",
]);

function createFileTools({ emit, openPath, ocrCachePath }) {
  const roots = new Map();
  const candidates = new Map();
  const selectedPaths = new Set();
  const linkedCandidates = new Set();
  const textCache = new Map();
  let ocrWorkerPromise = null;

  function activity(phase, message, speak = false) {
    const event = {
      id: crypto.randomUUID(),
      phase,
      message,
      speak,
      createdAt: new Date().toISOString(),
    };
    emit(event);
    return event;
  }

  function listRoots() {
    return [...roots.entries()].map(([id, value]) => ({
      id,
      name: path.basename(value) || value,
      displayPath: value,
    }));
  }

  async function setRoots(filePaths) {
    if (!Array.isArray(filePaths)) throw new Error("Choose at least one folder.");
    roots.clear();
    candidates.clear();
    textCache.clear();
    for (const selectedPath of filePaths.slice(0, 8)) {
      if (typeof selectedPath !== "string") continue;
      const canonical = await fs.realpath(selectedPath);
      const stats = await fs.stat(canonical);
      if (!stats.isDirectory()) continue;
      roots.set(crypto.randomUUID(), canonical);
    }
    activity(
      "completed",
      roots.size
        ? `SSDI Agent can now search ${roots.size} approved ${roots.size === 1 ? "folder" : "folders"}.`
        : "No folders were approved.",
      true,
    );
    return listRoots();
  }

  function getEnvironment(system) {
    return {
      platform: system.platform,
      release: system.release,
      arch: system.arch,
      roots: listRoots(),
      capabilities: [
        "search_files",
        "extract_text",
        "preview_candidate",
        "open_candidate",
      ],
      limits: {
        maxFiles: LIMITS.maxFiles,
        maxDepth: LIMITS.maxDepth,
        maxFileBytes: LIMITS.maxFileBytes,
        maxExcerptCharacters: LIMITS.maxExcerptCharacters,
      },
    };
  }

  async function execute(request) {
    if (!request || typeof request !== "object" || typeof request.tool !== "string") {
      throw new Error("SSDI Agent received an invalid computer action.");
    }
    if (request.tool === "search_files") return searchFiles(request.args || {});
    if (request.tool === "extract_text") return extractCandidate(request.args || {});
    if (request.tool === "preview_candidate") return previewCandidate(request.args || {});
    if (request.tool === "open_candidate") return openCandidate(request.args || {});
    if (request.tool === "link_candidate") return linkCandidate(request.args || {});
    throw new Error("SSDI Agent refused an unsupported computer action.");
  }

  async function searchFiles(args) {
    if (!roots.size) throw new Error("Choose folders before asking SSDI Agent to search.");
    const query = boundedString(args.query, 500);
    if (!query) throw new Error("Add something for SSDI Agent to find.");
    const runtimeTerms = Array.isArray(args.terms)
      ? args.terms.map((value) => boundedString(value, 80)).filter(Boolean)
      : [];
    const terms = uniqueTerms([query, ...runtimeTerms]);
    const extensionHints = new Set(
      (Array.isArray(args.extensions) ? args.extensions : [])
        .map(normalizeExtension)
        .filter(Boolean),
    );
    const maxResults = clamp(Number(args.maxResults) || 8, 1, 12);
    const deadline = Date.now() + LIMITS.maxSearchMilliseconds;
    const approved = listRoots();
    activity(
      "started",
      `I’m searching ${approved.map((root) => root.name).join(", ")} for “${query}”.`,
      true,
    );

    const files = [];
    const failures = [];
    for (const [rootId, rootPath] of roots) {
      await walk(rootPath, rootPath, rootId, 0, files, failures, deadline);
      if (files.length >= LIMITS.maxFiles || Date.now() >= deadline) break;
    }
    activity(
      "progress",
      `I checked ${files.length} ${files.length === 1 ? "file" : "files"}. I’m reading the strongest possibilities now.`,
      true,
    );

    for (const file of files) {
      file.score = metadataScore(file, terms, extensionHints);
      file.evidence = metadataEvidence(file, terms);
    }
    const inspectPool = files
      .filter((file) => SUPPORTED_EXTENSIONS.has(file.extension))
      .sort((left, right) =>
        right.score - left.score || right.modifiedMs - left.modifiedMs,
      )
      .slice(0, LIMITS.maxInspectedFiles);

    let ocrCount = 0;
    let inspected = 0;
    for (const file of inspectPool) {
      if (Date.now() >= deadline) break;
      if (IMAGE_EXTENSIONS.has(file.extension) && ocrCount >= LIMITS.maxOcrImages) continue;
      try {
        const excerpt = await extractText(file, {
          allowOcr: ocrCount < LIMITS.maxOcrImages,
        });
        if (IMAGE_EXTENSIONS.has(file.extension)) ocrCount += 1;
        inspected += 1;
        if (excerpt) {
          file.excerpt = excerpt;
          const contentMatches = matchingTerms(excerpt, terms);
          if (contentMatches.length) {
            file.score += 7 + contentMatches.length * 3;
            file.evidence.push(
              `Contents mention ${contentMatches.slice(0, 4).join(", ")}.`,
            );
          }
        }
      } catch (error) {
        failures.push({
          name: file.name,
          reason: error instanceof Error ? error.message : "Could not read file",
        });
      }
    }

    candidates.clear();
    const ranked = files
      .filter((file) => file.score > 0)
      .sort((left, right) => right.score - left.score || right.modifiedMs - left.modifiedMs)
      .slice(0, maxResults)
      .map((file) => {
        const id = crypto.randomUUID();
        candidates.set(id, file);
        return publicCandidate(id, file);
      });

    activity(
      "completed",
      ranked.length
        ? `I found ${ranked.length} possible ${ranked.length === 1 ? "match" : "matches"} after reading ${inspected} likely files.`
        : `I did not find a confident match among ${files.length} files.`,
      true,
    );

    return {
      ok: true,
      tool: "search_files",
      query,
      scannedFiles: files.length,
      inspectedFiles: inspected,
      skippedFiles: failures.length,
      candidates: ranked,
    };
  }

  async function extractCandidate(args) {
    const [id, file] = getCandidate(args.candidateId);
    activity("started", `I’m reading ${file.name}.`, true);
    try {
      const excerpt = await extractText(file, { allowOcr: true });
      activity("completed", `I finished reading ${file.name}.`, false);
      return {
        ok: true,
        tool: "extract_text",
        candidate: publicCandidate(id, { ...file, excerpt }),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "The file could not be read.";
      activity("failed", `I could not read ${file.name}. ${message}`, true);
      throw error;
    }
  }

  async function previewCandidate(args) {
    const [id, file] = getCandidate(args.candidateId);
    if (!IMAGE_EXTENSIONS.has(file.extension)) {
      return {
        ok: true,
        tool: "preview_candidate",
        candidate: publicCandidate(id, file),
        previewDataUrl: null,
        message: "Open this file in its normal Windows application to inspect it.",
      };
    }
    if (file.size > 8 * 1024 * 1024) throw new Error("That image is too large to preview safely.");
    const buffer = await fs.readFile(file.fullPath);
    const mime = file.extension === ".png" ? "image/png" : file.extension === ".webp" ? "image/webp" : "image/jpeg";
    return {
      ok: true,
      tool: "preview_candidate",
      candidate: publicCandidate(id, file),
      previewDataUrl: `data:${mime};base64,${buffer.toString("base64")}`,
    };
  }

  async function openCandidate(args) {
    const [, file] = getCandidate(args.candidateId);
    activity("started", `I’m opening ${file.name} in Windows.`, true);
    const error = await openPath(file.fullPath);
    if (error) {
      activity("failed", `Windows could not open ${file.name}.`, true);
      throw new Error(error);
    }
    activity("completed", `${file.name} is open.`, true);
    return { ok: true, tool: "open_candidate", name: file.name };
  }

  function getCandidate(candidateId) {
    if (typeof candidateId !== "string") throw new Error("Choose a discovered file first.");
    const file = candidates.get(candidateId);
    if (!file || (!isInsideApprovedRoot(file.fullPath) && !selectedPaths.has(file.fullPath))) {
      throw new Error("That file is not available in this SSDI Agent session.");
    }
    return [candidateId, file];
  }

  async function registerPaths(filePaths) {
    if (!Array.isArray(filePaths) || !filePaths.length) {
      throw new Error("Select a file in File Explorer before adding it to the case.");
    }
    const registered = [];
    for (const filePath of filePaths.slice(0, 5)) {
      if (typeof filePath !== "string") continue;
      const canonical = await fs.realpath(filePath);
      const stats = await fs.stat(canonical);
      if (!stats.isFile() || stats.size > LIMITS.maxFileBytes) continue;
      selectedPaths.add(canonical);
      const file = {
        rootId: "windows-selection",
        fullPath: canonical,
        relativePath: path.basename(canonical),
        name: path.basename(canonical),
        extension: path.extname(canonical).toLowerCase(),
        size: stats.size,
        modifiedAt: stats.mtime.toISOString(),
        modifiedMs: stats.mtimeMs,
        score: 100,
        evidence: ["Selected in File Explorer and verified from the live Windows session."],
      };
      if (SUPPORTED_EXTENSIONS.has(file.extension)) {
        try {
          file.excerpt = await extractText(file, { allowOcr: true });
        } catch {
          // The selection remains valid even when its contents cannot be extracted.
        }
      }
      const id = crypto.randomUUID();
      candidates.set(id, file);
      registered.push(publicCandidate(id, file));
    }
    if (!registered.length) {
      throw new Error("The selected item is not a supported file or is larger than 15 MB.");
    }
    activity(
      "completed",
      `I added ${registered.length} selected ${registered.length === 1 ? "file" : "files"} as verified case evidence.`,
      true,
    );
    return { ok: true, tool: "register_selected_file", candidates: registered };
  }

  function linkCandidate(args) {
    const [id, file] = getCandidate(args.candidateId);
    const linked = args.linked !== false;
    if (linked) linkedCandidates.add(id);
    else linkedCandidates.delete(id);
    return {
      ok: true,
      tool: "link_candidate",
      linked,
      candidate: publicCandidate(id, file),
    };
  }

  function listLinkedCandidates() {
    return [...linkedCandidates]
      .map((id) => {
        const file = candidates.get(id);
        return file ? publicCandidate(id, file) : null;
      })
      .filter(Boolean);
  }

  function getLinkedFiles() {
    return [...linkedCandidates]
      .map((id) => candidates.get(id))
      .filter(Boolean);
  }

  function isInsideApprovedRoot(filePath) {
    for (const rootPath of roots.values()) {
      const relative = path.relative(rootPath, filePath);
      if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) return true;
    }
    return false;
  }

  async function walk(rootPath, currentPath, rootId, depth, files, failures, deadline) {
    if (depth > LIMITS.maxDepth || files.length >= LIMITS.maxFiles || Date.now() >= deadline) return;
    let entries;
    try {
      entries = await fs.readdir(currentPath, { withFileTypes: true });
    } catch {
      failures.push({ name: currentPath, reason: "Folder could not be read" });
      return;
    }
    for (const entry of entries) {
      if (files.length >= LIMITS.maxFiles || Date.now() >= deadline) return;
      if (entry.isSymbolicLink()) continue;
      const fullPath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        if (SKIPPED_DIRECTORIES.has(entry.name.toLowerCase()) || entry.name.startsWith(".")) continue;
        await walk(rootPath, fullPath, rootId, depth + 1, files, failures, deadline);
        continue;
      }
      if (!entry.isFile()) continue;
      try {
        const stats = await fs.stat(fullPath);
        if (stats.size > LIMITS.maxFileBytes) continue;
        files.push({
          rootId,
          fullPath,
          relativePath: path.relative(rootPath, fullPath),
          name: entry.name,
          extension: path.extname(entry.name).toLowerCase(),
          size: stats.size,
          modifiedAt: stats.mtime.toISOString(),
          modifiedMs: stats.mtimeMs,
          score: 0,
          evidence: [],
        });
      } catch {
        failures.push({ name: entry.name, reason: "File metadata could not be read" });
      }
    }
  }

  async function extractText(file, { allowOcr }) {
    if (textCache.has(file.fullPath)) return textCache.get(file.fullPath);
    let text = "";
    if (TEXT_EXTENSIONS.has(file.extension)) {
      text = await fs.readFile(file.fullPath, "utf8");
    } else if (file.extension === ".pdf") {
      const buffer = await fs.readFile(file.fullPath);
      const parser = new PDFParse({ data: buffer });
      try {
        const result = await parser.getText();
        text = result.text || "";
      } finally {
        await parser.destroy();
      }
    } else if (IMAGE_EXTENSIONS.has(file.extension) && allowOcr) {
      const worker = await getOcrWorker();
      const result = await worker.recognize(file.fullPath);
      text = result.data.text || "";
    }
    const excerpt = normalizeWhitespace(text).slice(0, LIMITS.maxExcerptCharacters);
    textCache.set(file.fullPath, excerpt);
    return excerpt;
  }

  function getOcrWorker() {
    if (!ocrWorkerPromise) {
      ocrWorkerPromise = (async () => {
        await fs.mkdir(ocrCachePath, { recursive: true });
        return createWorker("eng", 1, { cachePath: ocrCachePath });
      })();
    }
    return ocrWorkerPromise;
  }

  async function dispose() {
    if (!ocrWorkerPromise) return;
    try {
      const worker = await ocrWorkerPromise;
      await worker.terminate();
    } catch {
      // Shutdown must not block app exit.
    }
  }

  return {
    dispose,
    execute,
    getCandidate,
    getLinkedFiles,
    getEnvironment,
    linkCandidate,
    listLinkedCandidates,
    listRoots,
    registerPaths,
    setRoots,
  };
}

function publicCandidate(id, file) {
  return {
    id,
    name: file.name,
    displayPath: file.fullPath,
    extension: file.extension,
    size: file.size,
    modifiedAt: file.modifiedAt,
    score: Number(file.score.toFixed(2)),
    evidence: file.evidence.length ? file.evidence : ["Recently modified supported file."],
    excerpt: file.excerpt || undefined,
  };
}

function metadataScore(file, terms, extensionHints) {
  const name = normalize(file.name);
  const relativePath = normalize(file.relativePath);
  let score = extensionHints.has(file.extension) ? 2 : 0;
  for (const term of terms) {
    if (name.includes(term)) score += 10;
    else if (relativePath.includes(term)) score += 5;
  }
  return score;
}

function metadataEvidence(file, terms) {
  const nameMatches = matchingTerms(file.name, terms);
  const pathMatches = matchingTerms(file.relativePath, terms).filter(
    (term) => !nameMatches.includes(term),
  );
  const evidence = [];
  if (nameMatches.length) evidence.push(`Filename matches ${nameMatches.slice(0, 4).join(", ")}.`);
  if (pathMatches.length) evidence.push(`Folder path matches ${pathMatches.slice(0, 4).join(", ")}.`);
  return evidence;
}

function matchingTerms(value, terms) {
  const normalized = normalize(value);
  return terms.filter((term) => normalized.includes(term));
}

function uniqueTerms(values) {
  const terms = new Set();
  for (const value of values) {
    for (const token of normalize(value).split(" ")) {
      if (token.length >= 2 && !STOP_WORDS.has(token)) terms.add(token);
    }
  }
  return [...terms].slice(0, 24);
}

function normalize(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeWhitespace(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeExtension(value) {
  const normalized = boundedString(value, 16).toLowerCase();
  if (!normalized) return "";
  return normalized.startsWith(".") ? normalized : `.${normalized}`;
}

function boundedString(value, maxLength) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

module.exports = { createFileTools };
