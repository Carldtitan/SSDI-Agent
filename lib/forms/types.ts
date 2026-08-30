export type FormKind = "ssa16" | "ssa3368" | "ssa3369" | "ssa827";

export interface AnvilFullName {
  firstName: string;
  mi?: string;
  lastName: string;
}

export interface AnvilAddress {
  street1: string;
  street2?: string;
  city: string;
  state: string;
  zip: string;
}

export type AnvilPrimitive = string | number | boolean;
export type AnvilComplexValue = AnvilFullName | AnvilAddress;
export type AnvilFieldValue =
  | AnvilPrimitive
  | AnvilComplexValue
  | {
      value: AnvilPrimitive | AnvilComplexValue;
      readOnly?: boolean;
    };

export interface FormPayload {
  title: string;
  fontSize: number;
  textColor: string;
  useInteractiveFields: boolean;
  defaultReadOnly: boolean;
  data: Record<string, AnvilFieldValue>;
}

export interface FormAdapterResult {
  kind: FormKind;
  label: string;
  sourceFieldCount: number;
  configuredAliasCount: number;
  payload: FormPayload;
}
