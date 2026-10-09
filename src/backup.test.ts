import { describe, expect, it } from "vitest";
import { parseBackup } from "./backup";

function file(value: unknown, name="backup.json") {
  return new File([JSON.stringify(value)], name, {type:"application/json"});
}
const empty = {app:"easyApply",formatVersion:1,exportedAt:"2026-10-09T10:00:00.000Z",data:{profiles:[],applications:[],activeProfileId:"",answerLibrary:[],customEntries:{},learningPreferences:{},resumes:{}},metadata:{categories:["profiles","applications","activeProfileId","answerLibrary","customEntries","learningPreferences","resumes"],schemaVersion:1}};

describe("easyApply backup validation",()=>{
  it("accepts an empty valid versioned backup",async()=>{
    await expect(parseBackup(file(empty))).resolves.toMatchObject({app:"easyApply",formatVersion:1});
  });
  it("rejects invalid JSON, the wrong app, and unsupported versions",async()=>{
    await expect(parseBackup(new File(["{"],"bad.json"))).rejects.toThrow("valid JSON");
    await expect(parseBackup(file({...empty,app:"other"}))).rejects.toThrow("not created by easyApply");
    await expect(parseBackup(file({...empty,formatVersion:2}))).rejects.toThrow("version is not supported");
  });
  it("rejects missing and unknown data categories",async()=>{
    await expect(parseBackup(file({...empty,data:undefined}))).rejects.toThrow("missing its data object");
    await expect(parseBackup(file({...empty,data:{unexpected:[]}}))).rejects.toThrow("Unsupported data categories");
  });
  it("rejects oversized and empty files",async()=>{
    await expect(parseBackup(new File([],"empty.json"))).rejects.toThrow("empty");
    await expect(parseBackup(new File(["x".repeat(20*1024*1024+1)],"large.json"))).rejects.toThrow("20 MB or smaller");
  });
});
