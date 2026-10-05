import { matchField } from "../matching";
import type { DetectedFieldType, FieldMetadata } from "./types";

export function classifyMetadata(metadata: FieldMetadata): DetectedFieldType | null {
  return matchField(metadata.signals);
}
