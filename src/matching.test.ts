import { describe, it, expect } from "vitest";
import { matchField } from "./matching";
import { alternateLabels } from "./alternate-labels";
describe("field matching", () => {
  it.each([
    [["Current salary", "expectedSalary"], "currentSalary"],
    [["Permanent address", "currentAddress"], "permanentAddress"],
    [["Legal first name", "fullName"], "firstName"],
    [["City", "country"], "city"],
    [["Email address or phone number", "email"], null],
    [["Current salary and expected salary", "expectedSalary"], null],
    [["Years of experience with Python", "totalExperience"], null],
    [["Experience in Java", "experience"], null],
    [["Company website", "portfolio"], null],
    [["Employer email", "email"], null],
    [["Name of your current employer", "name"], null],
    [["Total experience in years"], "totalExperience"],
  ])("respects label meaning and ambiguity for %j", (signals, expected) => {
    expect(matchField(signals)).toBe(expected);
  });
  it.each([
    [["Suffix", "Prefix"], null],
    [["Legal Middle Name", "name"], null],
    [["Apt#/Flat", "Address"], null],
    [["Apartment number", "Home address"], null],
    [["Preferred Last Name", "lastName"], null],
    [["Legal First Name", "firstName"], "firstName"],
    [["Legal Last Name", "lastName"], "lastName"],
    [["Prefix"], "salutation"],
    [["Phone Number"], "mobile"],
    [["City *"], "city"],
    [["Pin Code *"], "postalCode"],
    [["State *"], "state"],
  ])("keeps Oracle contact field %j distinct", (signals, expected) => {
    expect(matchField(signals)).toBe(expected);
  });
  it.each([
    "Mobile Phone Number *",
    "Please enter your cell phone number",
    "Telephone No.",
    "Mob. No.",
    "contactPhoneNumber",
    "MOBILE_NUMBER",
    "telNo",
    "Phone number / Mobile number",
  ])("recognizes phone spelling %s", (text) =>
    expect(matchField([text])).toBe("mobile"),
  );
  it.each([
    "Email Address",
    "EMAIL ADDRESS *",
    "Please enter your Email Address (required)",
    "E-mail address",
    "Email_Address",
    "emailAddress",
    "Ｅｍａｉｌ Address",
  ])("handles email formatting %s", (value) =>
    expect(matchField([value])).toBe("email"),
  );
  it.each([
    ["Please enter your DOB", "dob"],
    ["Select your Gender (optional)", "gender"],
    ["Your PIN code", "postalCode"],
    ["Salutation", "salutation"],
    ["Title", "salutation"],
  ])("handles prompt %s", (value, field) =>
    expect(matchField([value])).toBe(field),
  );
  for (const [field, labels] of Object.entries(alternateLabels)) {
    it.each(labels)(`maps ${field} alias %s`, (text) =>
      expect(matchField([text])).toBe(field),
    );
  }
  it.each([
    "Emergency contact number",
    "Father name",
    "Reference email",
    "Alternate phone",
    "Address line 2",
    "Mobile country code",
    "12th aggregate CGPA",
    "Email OTP",
    "How many years of experience do you have in team leading?",
    "Preferred First Name",
    "Please provide your preferred first name or nickname (if different from first name provided above).",
    "Job Title",
    "Current Job Title",
    "Professional Title",
    "Current Designation",
    "Present Role",
  ])("does not misfill %s", (text) => expect(matchField([text])).toBeNull());
  it("uses numeric total experience for the unqualified Total Experience label", () => {
    expect(matchField(["Total Experience", "rec-form_experience"])).toBe("totalExperience");
    expect(matchField(["Work experience"])).toBe("experience");
  });
  it.each(["EMAIL ID", "E-mail ID", "emailId", "emailid", "Email address"])(
    "matches email variant %s",
    (text) => expect(matchField([text])).toBe("email"),
  );
  it.each([
    "phone",
    "mobile",
    "contact number",
    "mobile number",
    "phone_number",
  ])("matches %s", (text) => expect(matchField([text])).toBe("mobile"));
  it("uses alternate signals", () =>
    expect(matchField(["unknown", "given-name"])).toBe("firstName"));
  it("prefers specific address", () =>
    expect(matchField(["permanent address"])).toBe("permanentAddress"));
  it.each([
    "password",
    "OTP",
    "UPI PIN",
    "bank account number",
    "I agree to terms",
    "CVV",
    "SSN",
  ])("blocks %s", (text) => expect(matchField([text, "full name"])).toBeNull());
  it("does not guess unknown fields", () =>
    expect(matchField(["favorite color"])).toBeNull());
  it("matches sensitive identifiers explicitly", () =>
    expect(matchField(["aadhaar number"])).toBe("aadhaar"));
});
