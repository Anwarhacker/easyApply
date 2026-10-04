import { useState } from "react";

const features = [
  [
    "Resume ↔ Job Match",
    "Read the current job description, location and salary. Compare a saved or selected PDF/TXT resume to detected skills and keywords, with evidence and qualifications to review. Analysis stays local.",
  ],
  [
    "Smart fill prompt",
    "Choose a target role and copy a prompt to use in ChatGPT with your resume. Review its suggested answers and enter them in Settings yourself.",
  ],
  [
    "Multiple job profiles",
    "Create, edit, select, and delete profiles for different roles in Settings.",
  ],
  [
    "Personal and contact details",
    "Save your name, email, mobile, addresses, date of birth, and other application details.",
  ],
  [
    "Education and fresher details",
    "Keep school, diploma, degree, university, marks, graduation, backlog, and education-gap information together.",
  ],
  [
    "Skills, projects, and experience",
    "Store technologies, projects, certifications, internships, work experience, and online profile links.",
  ],
  [
    "Job preferences and answers",
    "Save preferred roles, locations, salary expectations, availability, relocation preferences, and common application answers.",
  ],
  [
    "Scan application forms",
    "Detect supported visible inputs, text areas, dropdowns, radio buttons, and checkboxes using their labels and other field information.",
  ],
  [
    "Review before filling",
    "Preview detected matches and choose individual fields. Unknown fields stay unfilled; populated fields are skipped by default.",
  ],
  [
    "Careful form filling",
    "Fill selected fields and notify common web frameworks of changes. Changed fields and outdated previews require review or a new scan. Forms are never submitted automatically.",
  ],
  [
    "Encrypted identity vault",
    "Keep PAN and Aadhaar separately encrypted with a vault passphrase. Unlock when needed and confirm before filling. Identity locks automatically after two minutes.",
  ],
  [
    "Sensitive-answer review",
    "Legal and other sensitive matches require deliberate selection. Never store passwords, OTPs, UPI PINs, or banking credentials.",
  ],
  [
    "Saved info and custom entries",
    "View saved profile data, add your own title and value, edit or delete entries, and search titles or values. Custom entries are for manual copying.",
  ],
  [
    "One-click copy and download",
    "Copy individual values or all saved info, or download a text file. Encrypted vault contents are excluded; exported information is plain text.",
  ],
  [
    "Application tracker",
    "Track applications, change statuses, record follow-up dates, filter due items, and undo the last deletion in Settings.",
  ],
  [
    "Resume attachments",
    "Save a resume locally and attach it to supported empty Resume/CV inputs. Scanning can attach your saved resume; other documents remain manual.",
  ],
  [
    "Local storage and clear feedback",
    "Keep saved data in this Chrome profile, with loading states, validation, and error messages. No developer backend or cloud sync. Optional AI generation sends selected career context to Groq after consent.",
  ],
  [
    "Compatibility guidance",
    "Review filled values before submitting. Embedded forms, custom controls, and scanned resumes may need manual entry.",
  ],
] as const;

export function Features() {
  const [open, setOpen] = useState(false);
  return (
    <div className="features">
      <button
        type="button"
        className="highlight-action wide"
        aria-expanded={open}
        aria-controls="features-list"
        onClick={() => setOpen(!open)}
      >
        {open ? "Hide features" : "Explore all features"}
      </button>
      {open && (
        <section
          id="features-list"
          className="card feature-list"
          aria-labelledby="features-heading"
        >
          <h2 id="features-heading">Everything in easyApply</h2>
          <p>
            Choose a profile to scan a page. Open Settings to manage profiles,
            Identity, and Tracker, or Saved info to copy your details.
          </p>
          <dl>
            {features.map(([title, description]) => (
              <div key={title}>
                <dt>{title}</dt>
                <dd>{description}</dd>
              </div>
            ))}
          </dl>
          <p className="footnote">
            Some custom widgets, embedded forms, and multi-step sites need
            manual entry. Review the page before submitting yourself.
          </p>
        </section>
      )}
    </div>
  );
}
