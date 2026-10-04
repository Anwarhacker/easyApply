import { describe, it, expect } from "vitest";
import { blankProfile } from "./model";
import { suggestProfiles } from "./job-suggestions";
describe("local job suggestions", () => {
  it("ranks relevant profiles using saved role and skill evidence", () => {
    const frontend = blankProfile("Frontend developer");
    frontend.values.skills = "React, TypeScript, CSS";
    const backend = blankProfile("Java backend engineer");
    backend.values.skills = "Java, Spring, SQL";
    const ranked = suggestProfiles({ title: "Front-end Engineer", description: "Build React interfaces with TypeScript." }, [backend, frontend]);
    expect(ranked[0].profileId).toBe(frontend.id);
    expect(ranked[0].skillTerms).toEqual(["react", "typescript"]);
  });
  it("does not recommend based on generic titles, identity, or substring matches", () => {
    const profile = blankProfile("Software engineer");
    profile.values.skills = "Java";
    profile.values.fullName = "React TypeScript";
    expect(suggestProfiles({title:"Software Engineer", description:"JavaScript React TypeScript"}, [profile])).toEqual([]);
    expect(suggestProfiles({title:"",description:""}, [profile])).toEqual([]);
  });
  it("deduplicates repeated keywords and preserves tied alternatives", () => {
    const a = blankProfile("Frontend");
    const b = blankProfile("Frontend");
    a.values.skills = "React React React";
    b.values.skills = "React";
    const results = suggestProfiles({title:"Frontend",description:"React React"}, [a,b]);
    expect(results).toHaveLength(2);
    expect(results[0].score).toBe(results[1].score);
  });
});
