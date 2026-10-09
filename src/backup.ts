import { z } from "zod";
import { profileSchema, type Profile, type Application } from "./model";
import { applicationSchema } from "./security";
import { savedAnswerSchema, type SavedAnswer } from "./answer-library";
import { customEntrySchema, type CustomEntry } from "./custom-info";
import { migrateProfile } from "./fresher";
import { getStoredResumeDirect, saveStoredResumeItemDirect, deleteStoredResumeDirect, listStoredResumeIdsDirect, type StoredResume } from "./resume-vault";

const formatVersion = 1;
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const categories = ["profiles", "applications", "activeProfileId", "answerLibrary", "customEntries", "learningPreferences", "resumes"] as const;
type Category = typeof categories[number];
type Payload = { profiles?:Profile[]; applications?:Application[]; activeProfileId?:string; answerLibrary?:SavedAnswer[]; customEntries?:Record<string,CustomEntry[]>; learningPreferences?:Record<string,boolean>; resumes?:Record<string,StoredResume> };
export type Backup = { app: "easyApply"; formatVersion: number; exportedAt: string; data: Payload; metadata: { categories: Category[]; schemaVersion: number } };
const profileList = z.array(profileSchema).max(100).refine(rows => new Set(rows.map(row => row.id)).size === rows.length, "Profile IDs must be unique.");
const appList = z.array(applicationSchema).max(5000).refine(rows => new Set(rows.map(row => row.id)).size === rows.length, "Application IDs must be unique.");
const answerList = z.array(savedAnswerSchema).max(500);
const customList = z.record(z.string().max(100), z.array(customEntrySchema).max(100));
const resumeSchema = z.record(z.string().max(100), z.object({ name:z.string().max(255), size:z.number().int().min(1).max(10*1024*1024), type:z.enum(["application/pdf","application/vnd.openxmlformats-officedocument.wordprocessingml.document","text/plain"]), dataBase64:z.string().max(15*1024*1024).regex(/^data:[^;,]+;base64,[A-Za-z0-9+/]*={0,2}$/), updatedAt:z.iso.datetime() }));

function validateData(input: unknown): Payload {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw Error("Backup is missing its data object.");
  const data = input as Record<string, unknown>;
  const unknownKeys = Object.keys(data).filter(key => !categories.includes(key as Category));
  if (unknownKeys.length) throw Error(`Unsupported data categories: ${unknownKeys.join(", ")}.`);
  const output: Payload = {};
  if (data.profiles !== undefined) {
    if (!Array.isArray(data.profiles)) throw Error("Profiles must be an array.");
    const migrated = data.profiles.map(migrateProfile);
    output.profiles = profileList.parse(migrated);
  }
  if (data.applications !== undefined) output.applications = appList.parse(data.applications);
  if (data.activeProfileId !== undefined) output.activeProfileId = z.string().max(100).parse(data.activeProfileId);
  if (data.answerLibrary !== undefined) {
    const parsed = answerList.parse(data.answerLibrary);
    if (new Set(parsed.map(x=>x.id)).size !== parsed.length) throw Error("Answer Library contains duplicate IDs.");
    output.answerLibrary = parsed;
  }
  if (data.customEntries !== undefined) output.customEntries = customList.parse(data.customEntries);
  if (data.learningPreferences !== undefined) output.learningPreferences = z.record(z.string().max(100), z.boolean()).parse(data.learningPreferences);
  if (data.resumes !== undefined) {
    const resumes=resumeSchema.parse(data.resumes);
    for (const resume of Object.values(resumes)) {
      const [header,payload]=resume.dataBase64.split(",",2);
      if (header!==`data:${resume.type};base64` || atob(payload).length!==resume.size) throw Error("A stored resume has invalid file data or a mismatched size/type.");
    }
    output.resumes = resumes;
  }
  return output;
}

export async function createBackup(selected: Category[] = [...categories]): Promise<Backup> {
  const raw = await chrome.storage.local.get(["profiles", "applications", "activeProfileId", "easyapply.answer-library", "easyapply.backup.last-export", "onboarding:v2"]);
  const all: Payload = {};
  if (selected.includes("profiles")) all.profiles = profileList.parse((Array.isArray(raw.profiles) ? raw.profiles : []).map(migrateProfile));
  if (selected.includes("applications")) all.applications = appList.parse(raw.applications ?? []);
  if (selected.includes("activeProfileId")) all.activeProfileId = z.string().max(100).parse(raw.activeProfileId ?? "");
  if (selected.includes("answerLibrary")) all.answerLibrary = answerList.parse(raw["easyapply.answer-library"] ?? []);
  if (selected.includes("customEntries") || selected.includes("learningPreferences")) {
    const ids = Array.isArray(raw.profiles) ? raw.profiles.map((p: {id:string})=>p.id) : [];
    const keys = ids.flatMap((id:string)=>[...(selected.includes("customEntries")?[`custom:${id}`]:[]),...(selected.includes("learningPreferences")?[`easyapply.learning:${id}`]:[])]);
    const extra = keys.length ? await chrome.storage.local.get(keys) : {};
    if (selected.includes("customEntries")) all.customEntries = customList.parse(Object.fromEntries(ids.map((id:string)=>[id,extra[`custom:${id}`] ?? []])));
    if (selected.includes("learningPreferences")) all.learningPreferences = z.record(z.string().max(100), z.boolean()).parse(Object.fromEntries(ids.filter((id:string)=>extra[`easyapply.learning:${id}`] !== undefined).map((id:string)=>[id,extra[`easyapply.learning:${id}`]])));
  }
  if (selected.includes("resumes")) {
    const resumes: Record<string, StoredResume> = {};
    for (const profile of (Array.isArray(raw.profiles) ? raw.profiles : []) as Profile[]) {
      const resume = await getStoredResumeDirect(profile.id);
      if (resume) resumes[profile.id] = resume;
    }
    all.resumes = resumes;
  }
  const data = validateData(all);
  return { app:"easyApply", formatVersion, exportedAt:new Date().toISOString(), data, metadata:{categories:selected, schemaVersion:formatVersion} };
}

export async function parseBackup(file: File): Promise<Backup> {
  if (file.size === 0) throw Error("The selected file is empty.");
  if (file.size > MAX_FILE_BYTES) throw Error("Backup files must be 20 MB or smaller.");
  let parsed: unknown;
  try { parsed = JSON.parse(await file.text()); } catch { throw Error("This file is not valid JSON. Choose an easyApply backup file."); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw Error("Backup must be a JSON object.");
  const backup = parsed as Record<string, unknown>;
  if (backup.app !== "easyApply") throw Error("This backup was not created by easyApply.");
  if (backup.formatVersion !== formatVersion) throw Error("This backup format version is not supported.");
  if (!backup.metadata || typeof backup.metadata !== "object" || !Array.isArray((backup.metadata as {categories?:unknown}).categories)) throw Error("Backup metadata is missing its category list.");
  const data = validateData(backup.data);
  const listed = (backup.metadata as {categories:unknown[]}).categories;
  if (listed.some(x=>typeof x!=="string" || !categories.includes(x as Category)) || listed.some(x=>typeof x!=="string" || !(x in data))) throw Error("Backup category metadata does not match its data.");
  return { app:"easyApply", formatVersion, exportedAt:z.iso.datetime().parse(backup.exportedAt), data, metadata:{categories:listed as Category[], schemaVersion:formatVersion} };
}

function byIdMerge<T extends {id:string}>(current:T[], incoming:T[], replace:boolean):T[] {
  if (replace) return incoming;
  const map = new Map(current.map(row=>[row.id,row]));
  for (const row of incoming) map.set(row.id,row); // imported version wins same-ID conflicts; unrelated rows remain
  return [...map.values()];
}
export async function importBackup(backup: Backup, mode:"merge"|"replace"): Promise<string[]> {
  const data = validateData(backup.data); // validate every category before touching storage
  const current = await chrome.storage.local.get(null);
  const next: Record<string, unknown> = {};
  const touchedKeys: string[] = [];
  const removeKeys: string[] = [];
  const put = (key:string,value:unknown) => { next[key]=value; touchedKeys.push(key); };
  const replace = mode === "replace";
  if (data.profiles) put("profiles", byIdMerge((Array.isArray(current.profiles) ? current.profiles : []).map(migrateProfile) as Profile[], data.profiles, replace));
  if (data.applications) put("applications", byIdMerge(Array.isArray(current.applications) ? current.applications as Application[] : [], data.applications, replace));
  if (data.activeProfileId !== undefined) put("activeProfileId", data.activeProfileId);
  if (data.answerLibrary) {
    const merged = byIdMerge(Array.isArray(current["easyapply.answer-library"]) ? current["easyapply.answer-library"] as SavedAnswer[] : [], data.answerLibrary, replace);
    const unique = new Map<string, SavedAnswer>();
    for (const answer of merged) unique.set(answer.question.trim().toLowerCase().replace(/\s+/g," "), answer);
    put("easyapply.answer-library", [...unique.values()]);
  }
  if (data.customEntries) for (const [id, rows] of Object.entries(data.customEntries)) put(`custom:${id}`, byIdMerge(Array.isArray(current[`custom:${id}`]) ? current[`custom:${id}`] as CustomEntry[] : [], rows, replace));
  if (data.learningPreferences) for (const [id, enabled] of Object.entries(data.learningPreferences as Record<string, boolean>)) put(`easyapply.learning:${id}`, enabled);
  if (replace && data.customEntries) for (const key of Object.keys(current)) if (key.startsWith("custom:") && !(key in next)) removeKeys.push(key);
  if (replace && data.learningPreferences) for (const key of Object.keys(current)) if (key.startsWith("easyapply.learning:") && !(key in next)) removeKeys.push(key);
  touchedKeys.push(...removeKeys);
  const priorResumes: Record<string, StoredResume|null> = {};
  if (data.resumes) {
    if (replace) for (const id of await listStoredResumeIdsDirect()) priorResumes[id] = await getStoredResumeDirect(id);
    for (const [id, item] of Object.entries(data.resumes as Record<string, StoredResume>)) {
      priorResumes[id] ??= await getStoredResumeDirect(id);
      if (!replace && priorResumes[id] && priorResumes[id]!.updatedAt > item.updatedAt) continue;
    }
  }
  const priorStorage = Object.fromEntries(touchedKeys.map(key=>[key,current[key]]));
  try {
    if (Object.keys(next).length) await chrome.storage.local.set(next);
    if (removeKeys.length) await chrome.storage.local.remove(removeKeys);
    if (replace && data.resumes) {
      const keep = new Set(Object.keys(data.resumes));
      for (const id of Object.keys(priorResumes)) if (!keep.has(id)) await deleteStoredResumeDirect(id);
    }
    if (data.resumes) for (const [id,item] of Object.entries(data.resumes as Record<string,StoredResume>)) {
      if (replace || !priorResumes[id] || priorResumes[id]!.updatedAt <= item.updatedAt) await saveStoredResumeItemDirect(id,item);
    }
    const check = await chrome.storage.local.get(touchedKeys);
    for (const key of touchedKeys) if (JSON.stringify(check[key]) !== JSON.stringify(next[key])) throw Error("Saved data verification failed.");
  } catch (error) {
    try {
      const restore:Record<string,unknown>={}; const remove:string[]=[];
      for (const key of touchedKeys) {
        if (priorStorage[key] === undefined) remove.push(key);
        else restore[key]=priorStorage[key];
      }
      if (Object.keys(restore).length) await chrome.storage.local.set(restore);
      if (remove.length) await chrome.storage.local.remove(remove);
      for (const [id,item] of Object.entries(priorResumes)) {
        if (item) await saveStoredResumeItemDirect(id,item);
        else await deleteStoredResumeDirect(id);
      }
    } catch { throw Error("Import failed and automatic recovery was incomplete. Some data may need to be restored from your backup."); }
    throw new Error(`Import failed. Previous data was restored: ${error instanceof Error ? error.message : "storage error"}`, {cause:error});
  }
  return touchedKeys;
}

export type { Category };
export const backupCategories: {id:Category;label:string}[] = [
  {id:"profiles",label:"Job profiles and personal details"},{id:"applications",label:"Application tracker"},{id:"activeProfileId",label:"Active profile selection"},{id:"answerLibrary",label:"Answer Library"},{id:"customEntries",label:"Reusable custom information"},{id:"learningPreferences",label:"Learning preferences"},{id:"resumes",label:"Stored resume files"},
];
