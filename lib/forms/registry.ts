import ssa16Aliases from "@/anvil_fields/ssa-16.json";
import ssa3368Aliases from "@/anvil_fields/ssa-3368.json";
import ssa3369Aliases from "@/anvil_fields/ssa-3369.json";
import ssa827Aliases from "@/anvil_fields/ssa-827.json";
import ssa16SourceFields from "@/fieldmaps/ssa-16.json";
import ssa3368SourceFields from "@/fieldmaps/ssa-3368.json";
import ssa3369SourceFields from "@/fieldmaps/ssa-3369.json";
import ssa827SourceFields from "@/fieldmaps/ssa-827.json";
import type { FormKind, FormPayload } from "@/lib/forms/types";

const aliasesByForm: Record<FormKind, Set<string>> = {
  ssa16: new Set(ssa16Aliases.map((field) => field.id)),
  ssa3368: new Set(ssa3368Aliases.map((field) => field.id)),
  ssa3369: new Set(ssa3369Aliases.map((field) => field.id)),
  ssa827: new Set(ssa827Aliases.map((field) => field.id)),
};

export const FORM_REGISTRY: Record<
  FormKind,
  { sourceFieldCount: number; configuredAliasCount: number }
> = {
  ssa16: {
    sourceFieldCount: ssa16SourceFields.length,
    configuredAliasCount: ssa16Aliases.length,
  },
  ssa3368: {
    sourceFieldCount: ssa3368SourceFields.length,
    configuredAliasCount: ssa3368Aliases.length,
  },
  ssa3369: {
    sourceFieldCount: ssa3369SourceFields.length,
    configuredAliasCount: ssa3369Aliases.length,
  },
  ssa827: {
    sourceFieldCount: ssa827SourceFields.length,
    configuredAliasCount: ssa827Aliases.length,
  },
};

export function assertKnownAliases(
  form: FormKind,
  data: FormPayload["data"],
): void {
  const known = aliasesByForm[form];
  const unknown = Object.keys(data).filter((alias) => !known.has(alias));
  if (unknown.length > 0) {
    throw new Error(
      `Unknown ${form.toUpperCase()} field alias: ${unknown.join(", ")}`,
    );
  }
}

