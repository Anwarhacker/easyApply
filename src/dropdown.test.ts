import { describe, it, expect } from "vitest";
import {
  matchSelectOption,
  isBlankDropdown,
  isDropdownControl,
} from "./dropdown";

describe("conservative dropdown matching", () => {
  it("does not select placeholders or match empty option IDs", () => {
    expect(matchSelectOption("Select", [{ value: "", text: "Select" }])).toBeNull();
    expect(matchSelectOption("Python", [{ value: "", text: "Java" }])).toBeNull();
  });
  it("rejects ambiguous partial matches and single shared words", () => {
    expect(matchSelectOption("Software", [{ value: "a", text: "Software Engineer" }, { value: "b", text: "Software Tester" }])).toBeNull();
    expect(matchSelectOption("Computer Science", [{ value: "a", text: "Computer Engineering" }])).toBeNull();
    expect(matchSelectOption("Science", [{ value: "a", text: "Neuroscience" }])).toBeNull();
  });
  it("does not confuse a state prefix or unknown gender with another answer", () => {
    expect(matchSelectOption("Karnataka", [{ value: "KS", text: "Kansas" }], "state")).toBeNull();
    expect(matchSelectOption("Unknown", [{ value: "o", text: "Other" }], "gender")).toBeNull();
    expect(matchSelectOption("Other", [{ value: "decline", text: "Prefer not to say" }], "gender")).toBeNull();
  });
});

function createMockElement(
  tag: string,
  attrs: Record<string, string> = {},
): HTMLElement {
  return {
    tagName: tag.toUpperCase(),
    getAttribute: (attr: string) => attrs[attr] ?? null,
    hasAttribute: (attr: string) => attr in attrs,
    setAttribute: (attr: string, val: string) => {
      attrs[attr] = val;
    },
    querySelector: () => null,
    querySelectorAll: () => [],
    dispatchEvent: () => true,
    classList: { remove: () => {} },
  } as unknown as HTMLElement;
}

describe("isBlankDropdown", () => {
  it("recognizes empty and null values as blank", () => {
    expect(isBlankDropdown("")).toBe(true);
    expect(isBlankDropdown("   ")).toBe(true);
  });

  it("recognizes common placeholder phrases as blank", () => {
    expect(isBlankDropdown("Select")).toBe(true);
    expect(isBlankDropdown("select")).toBe(true);
    expect(isBlankDropdown("Select Country")).toBe(true);
    expect(isBlankDropdown("Select State")).toBe(true);
    expect(isBlankDropdown("Select City")).toBe(true);
    expect(isBlankDropdown("Select Salutation")).toBe(true);
    expect(isBlankDropdown("Select Gender")).toBe(true);
    expect(isBlankDropdown("Select country code")).toBe(true);
    expect(isBlankDropdown("Select one")).toBe(true);
    expect(isBlankDropdown("Select an option")).toBe(true);
    expect(isBlankDropdown("Choose")).toBe(true);
    expect(isBlankDropdown("Choose an option")).toBe(true);
    expect(isBlankDropdown("Please Select")).toBe(true);
    expect(isBlankDropdown("Please choose")).toBe(true);
    expect(isBlankDropdown("-- Select --")).toBe(true);
    expect(isBlankDropdown("-Select-")).toBe(true);
    expect(isBlankDropdown("None")).toBe(true);
    expect(isBlankDropdown("Not specified")).toBe(true);
    expect(isBlankDropdown("0")).toBe(true);
    expect(isBlankDropdown("-1")).toBe(true);
  });

  it("does not flag legitimate selections as blank", () => {
    expect(isBlankDropdown("India")).toBe(false);
    expect(isBlankDropdown("United States")).toBe(false);
    expect(isBlankDropdown("Female")).toBe(false);
    expect(isBlankDropdown("Mr.")).toBe(false);
    expect(isBlankDropdown("Karnataka")).toBe(false);
    expect(isBlankDropdown("+91")).toBe(false);
  });
});

describe("isDropdownControl", () => {
  it("identifies Lyte, Zoho, Angular Material, PrimeNG, and Element UI dropdown components", () => {
    expect(isDropdownControl(createMockElement("lyte-dropdown"))).toBe(true);
    expect(isDropdownControl(createMockElement("lyte-select"))).toBe(true);
    expect(isDropdownControl(createMockElement("crm-select"))).toBe(true);
    expect(isDropdownControl(createMockElement("crm-dropdown"))).toBe(true);
    expect(isDropdownControl(createMockElement("crux-select"))).toBe(true);
    expect(isDropdownControl(createMockElement("crux-dropdown"))).toBe(true);
    expect(isDropdownControl(createMockElement("crux-select-component"))).toBe(true);
    expect(isDropdownControl(createMockElement("crux-dropdown-component"))).toBe(true);
    expect(isDropdownControl(createMockElement("mat-select"))).toBe(true);
    expect(isDropdownControl(createMockElement("p-dropdown"))).toBe(true);
    expect(isDropdownControl(createMockElement("el-select"))).toBe(true);
    expect(isDropdownControl(createMockElement("v-select"))).toBe(true);
  });

  it("identifies data-zcui, data-component, data-field-type, and ARIA combobox / listbox elements", () => {
    expect(isDropdownControl(createMockElement("div", { "data-zcui": "select" }))).toBe(true);
    expect(isDropdownControl(createMockElement("div", { "data-component": "dropdown" }))).toBe(true);
    expect(isDropdownControl(createMockElement("div", { "data-field-type": "select" }))).toBe(true);
    expect(isDropdownControl(createMockElement("div", { role: "combobox" }))).toBe(true);
    expect(isDropdownControl(createMockElement("div", { role: "listbox" }))).toBe(true);
    expect(isDropdownControl(createMockElement("div", { "aria-haspopup": "listbox" }))).toBe(true);
    expect(isDropdownControl(createMockElement("span", { role: "button" }))).toBe(false);
  });

  it("identifies modern web components, CSS selectors, and Radix trigger buttons", () => {
    expect(isDropdownControl(createMockElement("ant-select"))).toBe(true);
    expect(isDropdownControl(createMockElement("lightning-combobox"))).toBe(true);
    expect(isDropdownControl(createMockElement("lightning-base-combobox"))).toBe(true);
    expect(isDropdownControl(createMockElement("div", { class: "ant-select ant-select-single" }))).toBe(true);
    expect(isDropdownControl(createMockElement("div", { class: "select2-container" }))).toBe(true);
    expect(isDropdownControl(createMockElement("div", { class: "chosen-container" }))).toBe(true);
    expect(isDropdownControl(createMockElement("button", { "data-radix-select-trigger": "" }))).toBe(true);
    expect(isDropdownControl(createMockElement("button", { role: "combobox" }))).toBe(true);
    expect(isDropdownControl(createMockElement("button", { "aria-haspopup": "listbox" }))).toBe(true);
    expect(isDropdownControl(createMockElement("div", { "data-automation-id": "select-country" }))).toBe(true);
  });
});

describe("matchSelectOption", () => {
  it.each([
    ["workMode", "not remote", "Work from office"],
    ["workMode", "Remote or hybrid", "Work from office"],
    ["employmentStatus", "Unemployed", "Experienced"],
    ["studyType", "Not specified", "Regular"],
    ["preDegreeType", "Not applicable", "Higher secondary"],
  ])("does not guess %s for %s", (field, answer, text) => {
    expect(matchSelectOption(answer, [{ value: "internal", text }], field)).toBeNull();
  });
  it("rejects conflicting and ambiguous category choices", () => {
    expect(matchSelectOption("WFH", [{value:"1",text:"Remote / Hybrid"}], "workMode")).toBeNull();
    expect(matchSelectOption("WFH", [{value:"1",text:"Remote"},{value:"2",text:"Work from home"}], "workMode")).toBeNull();
    expect(matchSelectOption("Partially remote", [{value:"1",text:"Remote"},{value:"2",text:"Hybrid"}], "workMode")?.value).toBe("2");
  });
  it("prefers visible labels to conflicting IDs and rejects duplicate labels", () => {
    expect(matchSelectOption("India", [{text:"Indonesia",value:"India"},{text:"India",value:"IN"}], "country")?.value).toBe("IN");
    expect(matchSelectOption("Bengaluru", [{text:"Bengaluru",value:"a"},{text:"Bengaluru",value:"b"}], "city")).toBeNull();
    expect(matchSelectOption("serving notice", [{text:"Immediate",value:"0"}], "noticePeriod")).toBeNull();
    expect(matchSelectOption("45", [{text:"30 days",value:"45"}], "noticePeriod")).toBeNull();
  });
  it("matches exact options by value or text", () => {
    const options = [
      { value: "", text: "Select an option" },
      { value: "blr", text: "Bengaluru" },
      { value: "del", text: "Delhi" },
    ];
    expect(matchSelectOption("Bengaluru", options)?.value).toBe("blr");
    expect(matchSelectOption("del", options)?.text).toBe("Delhi");
  });

  it("semantically matches gender options", () => {
    const options = [
      { value: "", text: "--Select--" },
      { value: "F", text: "Female" },
      { value: "M", text: "Male" },
      { value: "O", text: "Other" },
    ];
    expect(matchSelectOption("Female", options, "gender")?.value).toBe("F");
    expect(matchSelectOption("F", options, "gender")?.value).toBe("F");
    expect(matchSelectOption("Male", options, "gender")?.value).toBe("M");
    expect(matchSelectOption("M", options, "gender")?.value).toBe("M");
    expect(matchSelectOption("Ms", options, "gender")).toBeNull();
    expect(matchSelectOption("Mr", options, "gender")).toBeNull();
  });

  it("semantically matches salutation options", () => {
    const options = [
      { value: "", text: "Select Title" },
      { value: "mr", text: "Mr." },
      { value: "ms", text: "Ms." },
      { value: "mrs", text: "Mrs." },
    ];
    expect(matchSelectOption("Mr", options, "salutation")?.text).toBe("Mr.");
    expect(matchSelectOption("Mr.", options, "salutation")?.value).toBe("mr");
    expect(matchSelectOption("Ms", options, "salutation")?.text).toBe("Ms.");
  });

  it("semantically matches country by ISO code and dial code", () => {
    const options = [
      { value: "", text: "Select Country" },
      { value: "IN", text: "India" },
      { value: "US", text: "United States" },
      { value: "GB", text: "United Kingdom" },
    ];
    expect(matchSelectOption("India", options, "country")?.value).toBe("IN");
    expect(matchSelectOption("United States", options, "country")?.value).toBe("US");

    const dialOptions = [
      { value: "", text: "Select Code" },
      { value: "91", text: "India (+91)" },
      { value: "1", text: "United States (+1)" },
    ];
    expect(matchSelectOption("+91", dialOptions, "mobile")?.value).toBe("91");
    expect(matchSelectOption("91", dialOptions, "mobile")?.value).toBe("91");
  });

  it("semantically matches state and city options", () => {
    const stateOptions = [
      { value: "", text: "Select State" },
      { value: "KA", text: "Karnataka" },
      { value: "CA", text: "California" },
    ];
    expect(matchSelectOption("Karnataka", stateOptions, "state")?.value).toBe("KA");
    expect(matchSelectOption("KA", stateOptions, "state")?.text).toBe("Karnataka");
    expect(matchSelectOption("California", stateOptions, "state")?.value).toBe("CA");

    const cityOptions = [
      { value: "bengaluru", text: "Bengaluru" },
      { value: "mumbai", text: "Mumbai" },
    ];
    expect(matchSelectOption("Bangalore", cityOptions, "city")?.value).toBe("bengaluru");
    expect(matchSelectOption("Bombay", cityOptions, "city")?.value).toBe("mumbai");
  });

  it("semantically matches work mode options", () => {
    const options = [
      { value: "1", text: "Work from Home (Remote)" },
      { value: "2", text: "Work from Office (On-site)" },
      { value: "3", text: "Hybrid" },
    ];
    expect(matchSelectOption("Remote", options, "workMode")?.value).toBe("1");
    expect(matchSelectOption("On-site", options, "workMode")?.value).toBe("2");
    expect(matchSelectOption("Hybrid", options, "workMode")?.value).toBe("3");
  });

  it("semantically matches study type options", () => {
    const options = [
      { value: "reg", text: "Regular / Full Time" },
      { value: "dist", text: "Distance / Part Time" },
    ];
    expect(matchSelectOption("Full-time", options, "studyType")?.value).toBe("reg");
    expect(matchSelectOption("Part-time", options, "studyType")?.value).toBe("dist");
  });

  it("semantically matches experience ranges for freshers and experienced candidates", () => {
    const options = [
      { value: "exp-0", text: "Fresher (0-1 Years)" },
      { value: "exp-1", text: "1 - 3 Years" },
      { value: "exp-2", text: "3 - 5 Years" },
      { value: "exp-3", text: "5+ Years" },
    ];
    expect(matchSelectOption("0", options, "totalExperience")?.value).toBe("exp-0");
    expect(matchSelectOption("Fresher", options, "employmentStatus")?.value).toBe("exp-0");
    expect(matchSelectOption("2", options, "totalExperience")?.value).toBe("exp-1");
    expect(matchSelectOption("4 years", options, "totalExperience")?.value).toBe("exp-2");
    expect(matchSelectOption("6", options, "totalExperience")?.value).toBe("exp-3");
  });

  it("semantically matches salary / CTC range buckets", () => {
    const options = [
      { value: "1", text: "Under 3 LPA" },
      { value: "2", text: "3 - 6 LPA" },
      { value: "3", text: "6 - 10 LPA" },
      { value: "4", text: "10+ LPA" },
    ];
    expect(matchSelectOption("5 LPA", options, "expectedSalary")?.value).toBe("2");
    expect(matchSelectOption("500000", options, "expectedSalary")?.value).toBe("2");
    expect(matchSelectOption("8 LPA", options, "expectedSalary")?.value).toBe("3");
    expect(matchSelectOption("2 LPA", options, "expectedSalary")?.value).toBe("1");
    expect(matchSelectOption("15 LPA", options, "expectedSalary")?.value).toBe("4");
  });

  it("semantically matches 12th / Diploma qualification options", () => {
    const options = [
      { value: "hsc", text: "Class 12 / HSC / Intermediate" },
      { value: "dip", text: "Polytechnic / Diploma" },
    ];
    expect(matchSelectOption("12th", options, "preDegreeType")?.value).toBe("hsc");
    expect(matchSelectOption("Diploma", options, "preDegreeType")?.value).toBe("dip");
  });

  it("semantically matches backlogs options across numeric, range, and Yes/No questions", () => {
    const descriptiveOptions = [
      { value: "none", text: "No Backlogs (Nil)" },
      { value: "one", text: "1 Backlog" },
    ];
    expect(matchSelectOption("0", descriptiveOptions, "backlogs")?.value).toBe("none");
    expect(matchSelectOption("1", descriptiveOptions, "backlogs")?.value).toBe("one");

    const booleanOptions = [
      { value: "no", text: "No" },
      { value: "yes", text: "Yes" },
    ];
    expect(matchSelectOption("0", booleanOptions, "backlogs")?.value).toBe("no");
    expect(matchSelectOption("1", booleanOptions, "backlogs")?.value).toBe("yes");
    expect(matchSelectOption("2", booleanOptions, "backlogs")?.value).toBe("yes");
    expect(matchSelectOption("none", booleanOptions, "backlogs")?.value).toBe("no");

    const rangeOptions = [
      { value: "0", text: "0" },
      { value: "1-2", text: "1 to 2" },
      { value: "3+", text: "3 or more" },
    ];
    expect(matchSelectOption("0", rangeOptions, "backlogs")?.value).toBe("0");
    expect(matchSelectOption("2", rangeOptions, "backlogs")?.value).toBe("1-2");
    expect(matchSelectOption("4", rangeOptions, "backlogs")?.value).toBe("3+");
  });

  it("semantically matches passing / graduation year options", () => {
    const options = [
      { value: "1", text: "Batch of 2024" },
      { value: "2", text: "Class of 2025" },
      { value: "3", text: "2026" },
    ];
    expect(matchSelectOption("2025", options, "graduationYear")?.value).toBe("2");
    expect(matchSelectOption("2026", options, "graduationYear")?.value).toBe("3");
  });

  it("semantically matches yes/no booleans", () => {
    const options = [
      { value: "0", text: "No" },
      { value: "1", text: "Yes" },
    ];
    expect(matchSelectOption("Yes", options)?.value).toBe("1");
    expect(matchSelectOption("true", options)?.value).toBe("1");
    expect(matchSelectOption("No", options)?.value).toBe("0");
    expect(matchSelectOption("false", options)?.value).toBe("0");
  });

  it("matches degree options by acronym or full name with correct priority over prefix matches", () => {
    const options = [
      { value: "1", text: "Bachelor of Engineering (B.E.)" },
      { value: "2", text: "Bachelor of Computer Applications (BCA)" },
      { value: "3", text: "Master of Science (M.S.)" },
      { value: "4", text: "Master of Computer Applications (MCA)" },
      { value: "5", text: "Ph.D. / Doctorate" },
    ];
    expect(matchSelectOption("B.E", options, "degree")?.value).toBe("1");
    expect(matchSelectOption("B.Tech", options, "degree")?.value).toBe("1");
    expect(matchSelectOption("Bachelor of Technology", options, "degree")?.value).toBe("1");
    // Ensure BCA doesn't match BE despite both starting with "Bachelor"
    expect(matchSelectOption("BCA", options, "degree")?.value).toBe("2");
    expect(matchSelectOption("Bachelor of Computer Applications", options, "degree")?.value).toBe("2");
    expect(matchSelectOption("Master of Computer Applications", options, "degree")?.value).toBe("4");
    expect(matchSelectOption("MCA", options, "degree")?.value).toBe("4");
    expect(matchSelectOption("Ph.D.", options, "degree")?.value).toBe("5");
    expect(matchSelectOption("Doctor of Philosophy", options, "degree")?.value).toBe("5");
  });

  it("falls back to degree level hierarchy when exact degree is not listed", () => {
    const levelOptions = [
      { value: "hs", text: "High School / 12th" },
      { value: "ug", text: "Bachelor's Degree (Undergraduate)" },
      { value: "pg", text: "Master's Degree (Postgraduate)" },
      { value: "phd", text: "Doctorate / Ph.D." },
      { value: "dip", text: "Diploma" },
    ];
    expect(matchSelectOption("Bachelor of Technology in Information Technology", levelOptions, "degree")?.value).toBe("ug");
    expect(matchSelectOption("B.E. Computer Science", levelOptions, "degree")?.value).toBe("ug");
    expect(matchSelectOption("M.Tech in Artificial Intelligence", levelOptions, "degree")?.value).toBe("pg");
    expect(matchSelectOption("Master of Science in Data Science", levelOptions, "degree")?.value).toBe("pg");
    expect(matchSelectOption("Doctor of Philosophy in Robotics", levelOptions, "degree")?.value).toBe("phd");
    expect(matchSelectOption("Diploma in Mechanical Engineering", levelOptions, "degree")?.value).toBe("dip");
  });
});

it("matches calling codes exactly, not longer prefixes", () => {
 expect(matchSelectOption("+1", [{value: "other", text: "Other (+124)"}, {value: "US", text: "United States (+1)"}], "countryCode")?.value).toBe("US");
});
