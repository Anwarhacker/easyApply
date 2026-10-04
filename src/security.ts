import { z } from "zod";
export const sensitiveSchema = z
  .object({
    pan: z.string().regex(/^$|^[A-Z]{5}\d{4}[A-Z]$/),
    aadhaar: z.string().regex(/^$|^\d{12}$/),
  })
  .strict();
export const applicationSchema = z.object({
  id: z.string().min(1).max(100),
  company: z.string().trim().min(1).max(200),
  position: z.string().trim().min(1).max(200),
  url: z
    .string()
    .max(2048)
    .refine((v) => !v || safeUrl(v)),
  appliedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  followUpDate: z.union([z.literal(""), z.iso.date()]).optional(),
  status: z.enum(["Applied", "Interview", "Offer", "Rejected", "Withdrawn"]),
  resume: z.string().max(500),
  notes: z.string().max(10000),
});
export function safeUrl(value: string) {
  try {
    const u = new URL(value);
    return (
      ["https:", "http:"].includes(u.protocol) && !u.username && !u.password
    );
  } catch {
    return false;
  }
}
export const PREVIEW_TTL = 120000;
export function secureIdentityPage(url: string) {
  const u = new URL(url);
  return (
    u.protocol === "https:" || ["127.0.0.1", "localhost"].includes(u.hostname)
  );
}
