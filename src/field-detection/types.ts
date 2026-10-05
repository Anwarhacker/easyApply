import type { Field } from "../model";
import type { Control } from "../field-signals";

export type DetectedFieldType = Field | "pan" | "aadhaar";

export interface FieldMetadata {
  tag: string;
  type: string;
  name: string;
  id: string;
  placeholder: string;
  ariaLabel: string;
  autocomplete: string;
  labelText: string;
  signals: string[];
}

export interface DetectedField {
  element: Control;
  type: DetectedFieldType | null;
  confidence: number;
  evidence: string[];
}
