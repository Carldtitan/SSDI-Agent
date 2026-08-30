import type {
  ActivityEvent,
  ComputerEnvironment,
  CandidateFile,
  ComputerToolRequest,
  ComputerToolResult,
} from "@/lib/computer/schema";

declare global {
  interface Window {
    ssdiAgentDesktop?: {
      getEnvironment(): Promise<ComputerEnvironment>;
      executeTool(request: ComputerToolRequest): Promise<ComputerToolResult>;
      stopComputer(): Promise<{ ok: boolean }>;
      linkCandidate(request: {
        candidateId: string;
        linked: boolean;
      }): Promise<ComputerToolResult & { linked: boolean }>;
      listLinkedCandidates(): Promise<CandidateFile[]>;
      exportCase(request: {
        archive: ArrayBuffer;
        applicantName: string;
        missingDocuments: Array<{ label: string; reason: string }>;
      }): Promise<{
        ok: boolean;
        canceled: boolean;
        path?: string;
        formCount?: number;
        evidenceCount?: number;
        missingCount?: number;
      }>;
      onActivity(listener: (event: ActivityEvent) => void): () => void;
    };
  }
}

export {};
