# Chrome Web Store listing draft

Name: **easyApply**

Short description: **Save job profiles locally, review form matches, and fill repetitive job application fields.**

## Single purpose

Help users prepare and complete job applications using saved profile information, reusable answers, resumes, and application progress records.

## Description

easyApply helps you spend less time retyping job application details.

- Create local profiles for different roles.
- Import a PDF or TXT resume, review extracted values, and choose what to apply.
- Scan supported forms, inspect matches, and fill selected fields. Quick Fill can fill eligible empty fields using your chosen profile.
- Keep a resume attached to each profile and attach it to supported empty Resume/CV inputs. Scanning may attach the selected profile's saved resume.
- Get local profile suggestions from a job description and offers to fill newly detected steps.
- Save reusable answers and see where more profile information is needed.
- Track applications, update statuses, and record follow-up dates. Follow-ups are shown in the tracker; they are not notifications.
- Optionally generate AI answer drafts using your own Groq API key, after enabling the feature and consenting to share selected career facts, job context and questions.

Profiles and resume files are stored in your Chrome profile. Ordinary information and resume files are not encrypted by easyApply. The separate optional PAN/Aadhaar vault uses passphrase-based local encryption. No developer-operated backend, advertising, analytics or cloud sync is used. Optional AI requests go directly to Groq; its account limits and policies apply.

You control submission. Review filled values and attached documents before submitting. Existing answers are generally preserved, but manual corrections may be necessary. Custom controls, embedded forms, scanned resumes and some application sites are not supported. Application detection is not proof of successful employer receipt. easyApply does not bypass CAPTCHAs or submit applications automatically.

## Permission explanations

- **storage:** Profiles, reusable answers, application records, preferences and optional encrypted identity/API-key records. Session storage holds temporary pending actions and the optional session API key.
- **activeTab:** Temporary access after the user activates the extension on the current application page.
- **scripting:** Inject the local scanner, autofill actions and in-page panel on user activation.
- **contextMenus:** User-triggered Quick Fill and panel actions from the browser's right-click menu.
- **Optional api.groq.com access:** Contact Groq directly only for enabled, user-requested AI generation. The API key is user-supplied. Core local autofill works without AI.
- **Web-accessible bundled JavaScript:** Local modules required by the injected application panel. This declaration does not grant access to read every website.

## Data-disclosure review notes

Complete the current dashboard fields yourself after reviewing the privacy policy; do not claim the extension handles no user data.

- Personally identifiable information: names, addresses, contact details, optional identity numbers and saved profile information.
- Authentication information: optional user-provided Groq API key; the vault passphrase is used transiently and not retained.
- Website content: form labels, questions, entered values, job descriptions and application URLs used by the requested features.
- Financial/personal details: salary expectations and optional saved career information. No banking credentials should be stored.
- Health/sensitive information: optional voluntary disability and demographic answers can be saved locally when users choose them. These are excluded from structured AI career facts.
- User activity: after activation, form interaction/submission detection and Next-step detection support visible save/fill/tracking features; there is no general browsing-history or analytics log.
- Groq transfer: selected career facts, job context and questions leave the device when the optional AI feature is requested. Free text may contain personal information even after basic redaction.

These notes map actual behavior for review; dashboard category definitions and certifications must be checked when submitting. Do not claim externally enforced Groq retention guarantees or universal compatibility.

## Reviewer instructions

Core features require no account. Open Settings, create a synthetic profile, then invoke the toolbar, context menu or shortcut on a test application form. Open Resume Autofill for a text PDF/TXT preview. The tracker can be used without an employer account. Optional AI needs the reviewer's own Groq API key; do not include a publisher secret. The identity vault is optional and can be demonstrated with synthetic test values and a new passphrase.

## Publisher-owned fields

Public privacy policy URL and support/contact details remain to be supplied. Use the current bundled policy as the source for hosting. No public endpoint has been created by this task.
