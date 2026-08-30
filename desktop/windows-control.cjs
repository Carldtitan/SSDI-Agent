/* eslint-disable @typescript-eslint/no-require-imports */
const { execFile, spawn } = require("node:child_process");
const os = require("node:os");
const path = require("node:path");
const { promisify } = require("node:util");
const { shell } = require("electron");

const execFileAsync = promisify(execFile);
const SCRIPT_PATH = path.join(__dirname, "windows-control.ps1");
const PROTECTED_PROCESSES = new Set([
  "cmd",
  "credentialuibroker",
  "powershell",
  "pwsh",
  "regedit",
  "taskmgr",
  "windowsterminal",
]);
const CAPABILITIES = new Set([
  "observe_windows",
  "open_file_explorer",
  "launch_app",
  "focus_window",
  "invoke_element",
  "click",
  "type_text",
  "press_keys",
  "scroll",
  "wait",
]);

function createWindowsControl({ emit }) {
  let elementMap = new Map();
  let lastObservation = null;
  let stopped = false;

  async function execute(request) {
    if (!CAPABILITIES.has(request.tool)) {
      throw new Error("SSDI Agent refused an unsupported Windows action.");
    }
    stopped = false;
    if (request.tool === "observe_windows") return observationResult(request.tool);

    assertSafeWindow(lastObservation?.activeWindow, request.tool);
    emit({
      id: crypto.randomUUID(),
      phase: "progress",
      message: describeAction(request),
      speak: true,
      createdAt: new Date().toISOString(),
    });

    let nativeObservation = null;
    if (request.tool === "open_file_explorer") {
      await openExplorer(request.args.location);
    } else if (request.tool === "launch_app") {
      await launchApp(request.args.app);
    } else if (request.tool === "focus_window") {
      nativeObservation = await runPowerShell("ActAndObserve", {
        tool: request.tool,
        args: withWindowTarget(request.args, lastObservation),
      });
    } else if (request.tool === "invoke_element") {
      const target = elementMap.get(request.args.elementId);
      if (!target) throw new Error("That Windows control is no longer visible. Observe the screen again.");
      assertSafeElement(target);
      try {
        nativeObservation = await runPowerShell("ActAndObserve", {
          tool: request.tool,
          args: withWindowTarget({ selector: target.selector }, lastObservation),
        });
      } catch (error) {
        if (!isStaleControlError(error) || !hasUsableBounds(target.bounds)) throw error;
        nativeObservation = await runPowerShell("ActAndObserve", {
          tool: "click",
          args: withWindowTarget(centerPoint(target.bounds), lastObservation),
        });
      }
    } else if (request.tool === "click") {
      nativeObservation = await runPowerShell("ActAndObserve", {
        tool: request.tool,
        args: withWindowTarget(request.args, lastObservation),
      });
    } else if (request.tool === "type_text") {
      nativeObservation = await runPowerShell("ActAndObserve", {
        tool: request.tool,
        args: withWindowTarget(request.args, lastObservation),
      });
    } else if (request.tool === "press_keys") {
      nativeObservation = await runPowerShell("ActAndObserve", {
        tool: request.tool,
        args: withWindowTarget(request.args, lastObservation),
      });
    } else if (request.tool === "scroll") {
      nativeObservation = await runPowerShell("ActAndObserve", {
        tool: request.tool,
        args: withWindowTarget(request.args, lastObservation),
      });
    } else if (request.tool === "wait") {
      await new Promise((resolve) => setTimeout(resolve, request.args.milliseconds));
    }
    if (stopped) throw new Error("The Windows task was stopped.");
    if (!nativeObservation && request.tool !== "wait") {
      await new Promise((resolve) => setTimeout(resolve, 350));
    }
    return observationResult(request.tool, nativeObservation);
  }

  async function observationResult(tool, nativeObservation = null) {
    const observation = await observe(nativeObservation);
    return { ok: true, tool, observation };
  }

  async function observe(nativeObservation = null) {
    const native = nativeObservation || await runPowerShell("Observe", {});
    elementMap = new Map();
    const nativeElements = Array.isArray(native.elements)
      ? native.elements
      : native.elements
        ? [native.elements]
        : [];
    const elements = nativeElements.slice(0, 260).map((element, index) => {
      const id = `uia-${index + 1}`;
      elementMap.set(id, { ...element, selector: selectorFor(element) });
      return {
        id,
        name: String(element.name || "").slice(0, 500),
        automationId: String(element.automationId || "").slice(0, 300),
        controlType: String(element.controlType || "Unknown").slice(0, 100),
        enabled: Boolean(element.enabled),
        bounds: normalizeBounds(element.bounds),
      };
    });
    lastObservation = {
      capturedAt: new Date().toISOString(),
      activeWindow: {
        title: String(native.activeWindow?.title || "Windows desktop").slice(0, 500),
        processName: String(native.activeWindow?.processName || "").slice(0, 200),
        bounds: normalizeBounds(native.activeWindow?.bounds),
      },
      elements,
    };
    return lastObservation;
  }

  async function getSelectedFiles() {
    const result = await runPowerShell("SelectedFiles", {});
    if (Array.isArray(result.paths)) return result.paths;
    return typeof result.paths === "string" && result.paths ? [result.paths] : [];
  }

  function stop() {
    stopped = true;
  }

  return { execute, getSelectedFiles, observe, stop };
}

async function openExplorer(location) {
  const folders = {
    home: os.homedir(),
    downloads: path.join(os.homedir(), "Downloads"),
    documents: path.join(os.homedir(), "Documents"),
    desktop: path.join(os.homedir(), "Desktop"),
  };
  const error = await shell.openPath(folders[location] || folders.home);
  if (error) throw new Error(`Windows could not open File Explorer: ${error}`);
  await new Promise((resolve) => setTimeout(resolve, 650));
  const expectedTitle = {
    home: "File Explorer",
    downloads: "Downloads",
    documents: "Documents",
    desktop: "Desktop",
  }[location];
  await runPowerShell("FocusWindow", { title: expectedTitle }).catch(() => undefined);
}

async function launchApp(app) {
  if (app === "explorer") return openExplorer("home");
  if (app === "settings") {
    await shell.openExternal("ms-settings:");
    return focusLaunchedWindow("Settings");
  }
  if (app === "photos") {
    await shell.openExternal("ms-photos:");
    return focusLaunchedWindow("Photos");
  }
  const executables = {
    calculator: "calc.exe",
    notepad: "notepad.exe",
    paint: "mspaint.exe",
  };
  const executable = executables[app];
  if (!executable) throw new Error("That application is not approved for this SSDI Agent session.");
  const child = spawn(executable, [], {
    detached: true,
    stdio: "ignore",
    windowsHide: false,
  });
  child.unref();
  const title = { calculator: "Calculator", notepad: "Notepad", paint: "Paint" }[app];
  await focusLaunchedWindow(title);
}

async function focusLaunchedWindow(title) {
  await new Promise((resolve) => setTimeout(resolve, 650));
  await runPowerShell("FocusWindow", { title }).catch(() => undefined);
}

async function runPowerShell(action, payload) {
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
  let stdout;
  try {
    ({ stdout } = await execFileAsync(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", SCRIPT_PATH, "-Action", action, "-PayloadBase64", encoded],
      { encoding: "utf8", maxBuffer: 2 * 1024 * 1024, timeout: 12_000, windowsHide: true },
    ));
  } catch (error) {
    const diagnostic = `${error?.stderr || ""} ${error?.message || ""}`;
    if (/control is no longer available/i.test(diagnostic)) {
      throw new Error("The Windows control changed before SSDI Agent could use it.");
    }
    if (/timed out|ETIMEDOUT/i.test(diagnostic)) {
      throw new Error("Windows took too long to complete that accessibility action.");
    }
    throw new Error("Windows could not complete that accessibility action.");
  }
  const trimmed = stdout.trim();
  if (!trimmed) return {};
  try {
    return JSON.parse(trimmed);
  } catch {
    throw new Error("Windows returned an unreadable accessibility response.");
  }
}

function isStaleControlError(error) {
  return error instanceof Error && /control changed|no longer available/i.test(error.message);
}

function hasUsableBounds(bounds) {
  return Number(bounds?.width) > 0 && Number(bounds?.height) > 0;
}

function centerPoint(bounds) {
  return {
    x: Math.round(Number(bounds.x) + Number(bounds.width) / 2),
    y: Math.round(Number(bounds.y) + Number(bounds.height) / 2),
  };
}

function selectorFor(element) {
  return {
    automationId: String(element.automationId || "").slice(0, 300),
    name: String(element.name || "").slice(0, 500),
    controlType: String(element.controlType || "").slice(0, 100),
  };
}

function withWindowTarget(args, observation) {
  return {
    ...args,
    windowTitle: observation?.activeWindow?.title || "",
  };
}

function normalizeBounds(value) {
  return {
    x: Number(value?.x) || 0,
    y: Number(value?.y) || 0,
    width: Math.max(0, Number(value?.width) || 0),
    height: Math.max(0, Number(value?.height) || 0),
  };
}

function assertSafeWindow(activeWindow, tool) {
  if (["observe_windows", "focus_window", "wait", "open_file_explorer", "launch_app"].includes(tool)) return;
  const processName = String(activeWindow?.processName || "").toLowerCase();
  if (PROTECTED_PROCESSES.has(processName)) {
    throw new Error("SSDI Agent will not type or click inside terminals, credential windows, Registry Editor, or Task Manager.");
  }
}

function assertSafeElement(target) {
  const label = `${target.name || ""} ${target.automationId || ""}`.toLowerCase();
  if (/\b(delete|remove|erase|purchase|buy|pay|send|submit|sign|upload)\b/.test(label)) {
    throw new Error("SSDI Agent stopped before a sensitive or destructive control.");
  }
}

function describeAction(request) {
  if (request.tool === "open_file_explorer") return `Opening File Explorer at ${request.args.location}.`;
  if (request.tool === "launch_app") return `Opening ${request.args.app}.`;
  if (request.tool === "focus_window") return `Switching to ${request.args.title}.`;
  if (request.tool === "invoke_element") return "Using the selected Windows control.";
  if (request.tool === "click") return "Clicking the visible Windows screen.";
  if (request.tool === "type_text") return "Typing into the active Windows control.";
  if (request.tool === "press_keys") return `Pressing ${request.args.keys.join(" + ")}.`;
  if (request.tool === "scroll") return `Scrolling ${request.args.direction}.`;
  return "Waiting for Windows to finish.";
}

module.exports = { createWindowsControl };
