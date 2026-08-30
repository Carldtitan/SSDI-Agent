import type {
  CanonicalValue,
  CaptureSource,
  ConfirmationState,
} from "@/lib/case/types";

export function canonicalValue<T>(
  value: T | null,
  state: ConfirmationState,
  source: CaptureSource = "seed",
  capturedAt = "2026-07-28T12:00:00.000Z",
): CanonicalValue<T> {
  return {
    value,
    provenance: {
      source,
      state,
      capturedAt,
    },
  };
}
