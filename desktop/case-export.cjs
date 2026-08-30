/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("node:fs/promises");
const path = require("node:path");
const { unzipSync } = require("fflate");

const MAX_ARCHIVE_BYTES = 30 * 1024 * 1024;
const MAX_ENTRY_BYTES = 20 * 1024 * 1024;

async function exportCaseFolder({ archive, applicantName, dialog, linkedFiles, mainWindow, missingDocuments, shell }) {
  const bytes = toUint8Array(archive);
  if (!bytes.byteLength || bytes.byteLength > MAX_ARCHIVE_BYTES) {
    throw new Error("The generated forms archive is empty or too large.");
  }
  const files = unzipSync(bytes);
  const formEntries = Object.entries(files).filter(([entryName, entryBytes]) => {
    const fileName = path.basename(entryName);
    return (
      fileName.toLowerCase().endsWith(".pdf") &&
      fileName === entryName &&
      entryBytes.byteLength > 0 &&
      entryBytes.byteLength <= MAX_ENTRY_BYTES
    );
  });
  if (formEntries.length < 5) {
    throw new Error("SSDI Agent did not receive all five generated case documents.");
  }
  const selection = await dialog.showOpenDialog(mainWindow, {
    title: "Choose where SSDI Agent should create the case folder",
    buttonLabel: "Create case folder here",
    properties: ["openDirectory", "createDirectory"],
  });
  if (selection.canceled || !selection.filePaths[0]) return { ok: false, canceled: true };

  const parent = await fs.realpath(selection.filePaths[0]);
  const baseName = `SSDI Agent SSDI - ${safeName(applicantName || "Applicant")}`;
  const destination = await uniqueDirectory(parent, baseName);
  await fs.mkdir(destination, { recursive: false });

  let formCount = 0;
  for (const [entryName, entryBytes] of formEntries) {
    const fileName = path.basename(entryName);
    await fs.writeFile(path.join(destination, fileName), entryBytes, { flag: "wx" });
    formCount += 1;
  }

  let evidenceCount = 0;
  for (const file of linkedFiles) {
    const source = await fs.realpath(file.fullPath);
    const stats = await fs.stat(source);
    if (!stats.isFile() || stats.size > MAX_ENTRY_BYTES) continue;
    const outputName = await uniqueFileName(destination, `Supporting - ${safeName(file.name)}`);
    await fs.copyFile(source, path.join(destination, outputName));
    evidenceCount += 1;
  }

  const missing = Array.isArray(missingDocuments) ? missingDocuments.slice(0, 50) : [];
  const missingText = missing.length
    ? [
        "Supporting documents still missing",
        "==================================",
        "",
        ...missing.map((item) => `- ${item.label}: ${item.reason}`),
      ].join("\r\n")
    : "No supporting documents are currently marked missing in SSDI Agent.\r\n";
  await fs.writeFile(path.join(destination, "Missing supporting documents.txt"), missingText, "utf8");
  await fs.writeFile(
    path.join(destination, "README.txt"),
    [
      "SSDI Agent SSDI case folder",
      "==========================",
      "",
      `${formCount} generated application documents`,
      `${evidenceCount} supporting documents found on this computer`,
      `${missing.length} supporting documents still marked missing`,
      "",
      "Review every document and sign where required. SSDI Agent does not submit this folder to SSA.",
    ].join("\r\n"),
    "utf8",
  );
  await shell.openPath(destination);
  return { ok: true, canceled: false, path: destination, formCount, evidenceCount, missingCount: missing.length };
}

function toUint8Array(value) {
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  throw new Error("SSDI Agent received an invalid forms archive.");
}

function safeName(value) {
  const cleaned = String(value)
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/g, "")
    .slice(0, 100);
  return cleaned || "Applicant";
}

async function uniqueDirectory(parent, baseName) {
  for (let index = 1; index <= 100; index += 1) {
    const name = index === 1 ? baseName : `${baseName} (${index})`;
    const candidate = path.join(parent, name);
    try {
      await fs.access(candidate);
    } catch {
      return candidate;
    }
  }
  throw new Error("SSDI Agent could not choose a unique case-folder name.");
}

async function uniqueFileName(destination, requestedName) {
  const extension = path.extname(requestedName);
  const base = path.basename(requestedName, extension);
  for (let index = 1; index <= 100; index += 1) {
    const name = index === 1 ? `${base}${extension}` : `${base} (${index})${extension}`;
    try {
      await fs.access(path.join(destination, name));
    } catch {
      return name;
    }
  }
  throw new Error("SSDI Agent could not choose a unique evidence filename.");
}

module.exports = { exportCaseFolder };
