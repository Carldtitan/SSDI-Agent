/* eslint-disable @typescript-eslint/no-require-imports */
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("ssdiAgentDesktop", {
  getEnvironment: () => ipcRenderer.invoke("ssdiAgent:get-environment"),
  executeTool: (request) =>
    ipcRenderer.invoke("ssdiAgent:execute-tool", request),
  stopComputer: () => ipcRenderer.invoke("ssdiAgent:stop-computer"),
  linkCandidate: (request) =>
    ipcRenderer.invoke("ssdiAgent:link-candidate", request),
  listLinkedCandidates: () => ipcRenderer.invoke("ssdiAgent:list-linked"),
  exportCase: (request) => ipcRenderer.invoke("ssdiAgent:export-case", request),
  onActivity: (listener) => {
    if (typeof listener !== "function") return () => {};
    const handler = (_event, activity) => listener(activity);
    ipcRenderer.on("ssdiAgent:activity", handler);
    return () => ipcRenderer.removeListener("ssdiAgent:activity", handler);
  },
});
