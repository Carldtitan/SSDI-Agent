import type { ApplicantCase } from "@/lib/case/types";
import { assertKnownAliases, FORM_REGISTRY } from "@/lib/forms/registry";
import type {
  AnvilFieldValue,
  FormAdapterResult,
  FormKind,
} from "@/lib/forms/types";

export function createAdapterResult(
  kind: FormKind,
  label: string,
  data: Record<string, AnvilFieldValue | null | undefined>,
  options: { interactive?: boolean; defaultReadOnly?: boolean } = {},
): FormAdapterResult {
  const sanitized = Object.fromEntries(
    Object.entries(data).filter(
      (entry): entry is [string, AnvilFieldValue] =>
        entry[1] !== null && entry[1] !== undefined,
    ),
  );
  const payload = {
    title: `${label} - Applicant working copy`,
    fontSize: 8,
    textColor: "#25202A",
    useInteractiveFields: options.interactive ?? false,
    defaultReadOnly: options.defaultReadOnly ?? true,
    data: sanitized,
  };
  assertKnownAliases(kind, payload.data);
  return {
    kind,
    label,
    ...FORM_REGISTRY[kind],
    payload,
  };
}

export function conditionNames(
  applicantCase: ApplicantCase,
  ids: readonly string[],
): string {
  const names = new Map(
    applicantCase.conditions.map((condition) => [
      condition.id,
      condition.name.value,
    ]),
  );
  return ids
    .map((id) => names.get(id))
    .filter((value): value is string => Boolean(value))
    .join(", ");
}

export function providerName(
  applicantCase: ApplicantCase,
  providerId: string | null,
): string | null {
  if (!providerId) return null;
  const provider = applicantCase.providers.find(
    (entry) => entry.id === providerId,
  );
  return provider?.name.value ?? provider?.facility.value ?? null;
}

