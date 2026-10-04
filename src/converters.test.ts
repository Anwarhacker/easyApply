import { describe, it, expect } from "vitest";
import {
  parseDate,
  calculateAge,
  birthPartValue,
  convertDateForControl,
  formatDate,
  parseNoticeDays,
  matchNoticeOption,
  parseSalary,
  convertSalaryForControl,
  smartConvert,
  splitInternationalPhone,
  callingCodes,
} from "./converters";

describe("Date Converter", () => {
  it("parses YYYY-MM-DD correctly", () => {
    const d = parseDate("2000-08-15");
    expect(d).toEqual({ year: 2000, month: 8, day: 15 });
  });

  it("parses DD/MM/YYYY correctly", () => {
    const d = parseDate("15/08/2000");
    expect(d).toEqual({ year: 2000, month: 8, day: 15 });
  });

  it("parses Month YYYY correctly", () => {
    const d = parseDate("September 2024");
    expect(d).toEqual({ year: 2024, month: 9, day: 1 });
  });

  it("formats dates into various target representations", () => {
    const parsed = { year: 2000, month: 8, day: 15 };
    expect(formatDate(parsed, "YYYY-MM-DD")).toBe("2000-08-15");
    expect(formatDate(parsed, "MM/DD/YYYY")).toBe("08/15/2000");
    expect(formatDate(parsed, "DD/MM/YYYY")).toBe("15/08/2000");
    expect(formatDate(parsed, "Month YYYY")).toBe("August 2000");
    expect(formatDate(parsed, "YYYY")).toBe("2000");
  });
});

describe("Notice Period Converter", () => {
  it.each(["serving notice", "not immediate", "30-60 days", "available from 2026-10-01", "within 30 days", "-15 days"])("does not invent a duration for %s", value => {
    expect(parseNoticeDays(value)).toBeNull();
  });
  it("uses visible durations, rejects approximation and overlapping ranges", () => {
    expect(matchNoticeOption("-15 days", [{text:"15 days",value:"a"}])).toBeNull();
    expect(matchNoticeOption("0.01 weeks", [{text:"Immediate",value:"a"}])).toBeNull();
    expect(matchNoticeOption("45 days", [{text:"30 days",value:"45"}])).toBeNull();
    expect(matchNoticeOption("Serving notice", [{text:"Immediate",value:"0"}])).toBeNull();
    expect(matchNoticeOption("30 days", [{text:"Less than 30 days",value:"a"}])).toBeNull();
    expect(matchNoticeOption("30 days", [{text:"Within 30 days",value:"a"}])?.value).toBe("a");
    expect(matchNoticeOption("45 days", [{text:"31–60 days",value:"a"}])?.value).toBe("a");
    expect(matchNoticeOption("30 days", [{text:"0-30 days",value:"a"},{text:"30-60 days",value:"b"}])).toBeNull();
    expect(matchNoticeOption("1 month", [{text:"30 days",value:"a"},{text:"30 days",value:"b"}])).toBeNull();
  });
  it("parses days, weeks, months, and immediate joiners", () => {
    expect(parseNoticeDays("Immediate")).toBe(0);
    expect(parseNoticeDays("0 days")).toBe(0);
    expect(parseNoticeDays("15 days")).toBe(15);
    expect(parseNoticeDays("2 weeks")).toBe(14);
    expect(parseNoticeDays("1 month")).toBe(30);
    expect(parseNoticeDays("2 months")).toBe(60);
    expect(parseNoticeDays("90 days")).toBe(90);
  });

  it("matches semantic notice period options in select dropdowns", () => {
    const options = [
      { text: "Immediate Joiner", value: "0" },
      { text: "15 Days or less", value: "15" },
      { text: "1 Month (30 Days)", value: "30" },
      { text: "2 Months", value: "60" },
      { text: "3 Months (90 Days)", value: "90" },
    ];

    // "2 weeks" (~14 days) should match "15 Days or less"
    const match1 = matchNoticeOption("2 weeks", options);
    expect(match1?.value).toBe("15");

    // "Immediate" should match "Immediate Joiner"
    const match2 = matchNoticeOption("Immediate", options);
    expect(match2?.value).toBe("0");

    // "30 days" should match "1 Month"
    const match3 = matchNoticeOption("30 days", options);
    expect(match3?.value).toBe("30");

    // "60 days" should match "2 Months"
    const match4 = matchNoticeOption("60 days", options);
    expect(match4?.value).toBe("60");
  });
});

describe("Salary Converter", () => {
  it("parses LPA, thousands, and raw amounts", () => {
    expect(parseSalary("12 LPA")?.amount).toBe(1200000);
    expect(parseSalary("8.5 Lakhs")?.amount).toBe(850000);
    expect(parseSalary("100k")?.amount).toBe(100000);
    expect(parseSalary("₹15,00,000")?.amount).toBe(1500000);
    expect(parseSalary("$120,000")?.amount).toBe(120000);
  });

  it("converts annual salary to monthly when requested by hints", () => {
    const mockInput = {
      placeholder: "Enter monthly salary",
      type: "text",
    } as unknown as HTMLInputElement;

    const res = convertSalaryForControl("12 LPA", mockInput, ["monthly salary", "salary per month"]);
    expect(res).toBe("100000");
  });

  it("converts full salary amount to Lakhs when field asks in LPA", () => {
    const mockInput = {
      placeholder: "e.g. 12",
      type: "text",
    } as unknown as HTMLInputElement;

    const res = convertSalaryForControl("1200000", mockInput, ["expected ctc in lpa"]);
    expect(res).toBe("12");
  });

  it("ensures numeric purity for type=number inputs", () => {
    const mockInput = {
      type: "number",
      placeholder: "Annual salary",
    } as unknown as HTMLInputElement;

    const res = convertSalaryForControl("₹12,00,000", mockInput, ["annual salary"]);
    expect(res).toBe("1200000");
  });
});

describe("smartConvert pipeline", () => {
  it("converts date according to control hints", () => {
    const mockDateInput = {
      type: "text",
      placeholder: "DD/MM/YYYY",
    } as unknown as HTMLInputElement;

    const res = smartConvert("dob", "2000-08-15", mockDateInput, ["date of birth"]);
    expect(res).toBe("15/08/2000");
  });

  it("converts salary according to control hints", () => {
    const mockSalaryInput = {
      type: "text",
      placeholder: "Monthly compensation",
    } as unknown as HTMLInputElement;

    const res = smartConvert("expectedSalary", "12 LPA", mockSalaryInput, ["monthly compensation"]);
    expect(res).toBe("100000");
  });

  it("uses only an explicitly saved salutation", () => {
    const mockSelect = {} as unknown as HTMLSelectElement;
    expect(smartConvert("salutation", "", mockSelect, [], { gender: "Male" })).toBe("");
    expect(smartConvert("salutation", "", mockSelect, [], { gender: "Female" })).toBe("");
    expect(smartConvert("salutation", "", mockSelect, [], {})).toBe("");
    expect(smartConvert("salutation", "Dr.", mockSelect, [], { gender: "Male" })).toBe("Dr.");
  });

  it("preserves international mobile without a verified calling-code selector", () => {
    const mockPhoneInput = {
      type: "text",
      placeholder: "Phone Number",
      pattern: "[0-9]{10}",
      maxLength: 10,
    } as unknown as HTMLInputElement;

    const res = smartConvert("mobile", "+91 9876543210", mockPhoneInput, ["phone number"]);
    expect(res).toBe("+91 9876543210");
  });
});

describe("Split international phone normalization", () => {
 it.each([
  ["+919876543210", "+91", "9876543210"],
  ["+1 (202) 555-0123", "+1", "2025550123"],
  ["0044 20 7946 0958", "+44", "2079460958"],
  ["+49 30 123456", "+49", "30123456"],
 ])("splits %s using offered dialing codes", (raw, code, national) => {
   expect(splitInternationalPhone(raw, ["+1", "+91", "+44", "+49"])).toEqual({ callingCode: code, nationalNumber: national });
 });
 it.each(["9876543210", "+999123456789", "+12025550123 ext 5", "", "+1234567890123456"])("does not guess unsupported phone %s", raw => {
   expect(splitInternationalPhone(raw, ["+1", "+91"])).toBeNull();
 });
 it("reads explicit option prefixes without confusing +1 and +124", () => {
   expect(callingCodes("India (+91) US (+1) +1242")).toEqual(["+91", "+1"]);
 });
});


describe("DOB formats and derived values", () => {
  it.each(["2000-02-30", "2023-02-29", "2000-13-01", "31/04/2000", "nonsense"])("rejects invalid calendar date %s", raw => expect(parseDate(raw)).toBeNull());
  it("accepts leap days and named dates", () => {
    expect(parseDate("2000-02-29")?.day).toBe(29);
    expect(parseDate("15 Aug 2000")).toEqual({ year: 2000, month: 8, day: 15 });
  });
  it.each([
    ["DD/MM/YYYY", "15/08/2000"], ["MM/DD/YYYY", "08/15/2000"],
    ["DD.MM.YYYY", "15.08.2000"], ["YYYY/MM/DD", "2000/08/15"],
    ["DD-Mon-YYYY", "15-Aug-2000"], ["DD MMM YYYY", "15 Aug 2000"],
  ])("respects format %s with numeric keyboards", (placeholder, expected) => {
    const el = { type: "text", inputMode: "numeric", placeholder } as HTMLInputElement;
    expect(convertDateForControl("2000-08-15", el, ["Date of birth"])).toBe(expected);
  });
  it("keeps native date ISO regardless of placeholder", () => {
    expect(convertDateForControl("15/08/2000", {type:"date", placeholder:"MM/DD/YYYY"} as HTMLInputElement, [])).toBe("2000-08-15");
  });
  it("calculates age around the birthday and rejects future/partial dates", () => {
    expect(calculateAge("2000-08-15", new Date(2026,7,14))).toBe(25);
    expect(calculateAge("2000-08-15", new Date(2026,7,15))).toBe(26);
    expect(calculateAge("2027-01-01", new Date(2026,7,15))).toBeNull();
    expect(calculateAge("2000")).toBeNull();
    expect(calculateAge("2000-02-29", new Date(2025,1,28))).toBe(24);
    expect(calculateAge("2000-02-29", new Date(2025,2,1))).toBe(25);
  });
  it("uses month labels over conflicting zero-based values", () => {
    const months = Array.from({length:12}, (_, i) => ({ text: new Date(2000,i,1).toLocaleString("en-US", {month:"long"}), value: String(i) }));
    expect(birthPartValue({year:2000,month:8,day:15}, "month", months)).toBe("7");
    expect(birthPartValue({year:2000,month:1,day:15}, "month", months)).toBe("0");
    expect(birthPartValue({year:2000,month:8,day:15}, "month", [{text:"08",value:"aug"}])).toBe("aug");
    expect(birthPartValue({year:2000,month:8,day:15}, "month", [{text:"July",value:"july"}])).toBe("");
  });
});
