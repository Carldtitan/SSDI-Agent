import type { PostalAddress } from "@/lib/case/types";
import type { AnvilAddress, AnvilFullName } from "@/lib/forms/types";

export function splitFullName(value: string | null): AnvilFullName | null {
  if (!value?.trim()) return null;
  const parts = value
    .trim()
    .split(/\s+/)
    .filter((part, index) =>
      index === 0 ? !/^(dr|mr|mrs|ms)\.?$/i.test(part) : true,
    );
  if (parts.length === 0) return null;
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: "" };
  }
  const [firstName, ...rest] = parts;
  const lastName = rest.pop() ?? "";
  return {
    firstName,
    ...(rest.length > 0 ? { mi: rest.join(" ").slice(0, 1) } : {}),
    lastName,
  };
}

export function digitsOnly(value: string | null): string | null {
  return value ? value.replace(/\D/g, "") : null;
}

export function toAnvilAddress(
  address: PostalAddress | null,
): AnvilAddress | null {
  if (!address) return null;
  return {
    street1: address.line1,
    ...(address.line2 ? { street2: address.line2 } : {}),
    city: address.city,
    state: address.state,
    zip: address.zip,
  };
}

export function yesNo(value: boolean | null): string | null {
  if (value === null) return null;
  return value ? "Yes" : "No";
}

export function compact<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined && value !== "";
}
