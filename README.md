# easyApply

A local-first Chrome Manifest V3 extension for reviewing and autofilling job applications. Built with React, TypeScript, Tailwind CSS, Vite, CRXJS, React Hook Form, Zod, Chrome Storage, and Web Crypto. No developer backend, cloud sync, or automatic submission. Optional AI answers use your own Groq account.

## Installation and development

Use Node.js 22.12+ (Node 24 recommended) and npm.

```sh
npm ci
npm run dev
```

Load `dist-dev` as an unpacked extension while the development server is running. Development output is separate from the standalone production `dist` folder. For a standalone release:

```sh
npm run build
```

## Load unpacked extension

1. Open `chrome://extensions` in Chrome.
2. Enable **Developer mode**.
3. Click **Load unpacked** and select this project's `dist` folder.
4. Pin easyApply from Chrome's extensions menu.
5. Open easyApply → **Settings**. Create and save a profile. Use **New profile** for additional roles such as Frontend Developer, Java Developer, and DevOps Engineer; no invented personal details are seeded.
6. Open a job form, click easyApply, and choose your profile. Click **Scan application form**, review matches, deselect anything unwanted, then **Fill selected fields**.
7. Select upload documents manually and review the page. Submit the application yourself.

After rebuilding, reload the extension in `chrome://extensions` and reload the application page.

Autofill preserves existing radio-group choices and checked boxes, skips disabled controls (including disabled fieldsets), and checks text inputs and textareas against their character limits. It checks again before filling so manual choices and changed form constraints made after scanning are respected. If the page URL changes during a fill, remaining fields require a fresh scan.

Matching prioritizes visible and accessible labels over input names and IDs. Combined questions with competing meanings stay unmatched, as do employer contact details and technology-specific experience questions that cannot be answered from total experience. Accessible labels split across multiple referenced elements are read together; unrelated neighboring controls do not share labels. Unmatched questions can still use an explicitly saved answer for that exact question.

## Your application workspace

### Resume ↔ Job Match

Open **Resume ↔ Job Match** from the extension popup on a job page. It reads a single structured JobPosting (including JSON-LD graphs) when available, or falls back to visible job-page text. Review or replace the extracted description, then compare the selected profile's saved resume or choose a temporary PDF/TXT file. DOCX and scanned PDFs need a text-based PDF or TXT export. Temporary file selection does not overwrite the stored resume.

The report shows detected location and salary, required/preferred/mentioned skills, keywords found or not found in the resume, source snippets, explicit experience requirements, and education/certification statements to verify. Add role-specific keywords to extend the built-in dictionary. Comparisons run locally without an AI API, upload, or form mutation. Results are lexical evidence, not an ATS/hiring score or a declaration that a candidate lacks a qualification. Changing the JD, keyword list, or resume selection clears old results. Missing or ambiguous metadata is not guessed; users can paste the intended JD when a page is unsupported or lists several roles.

Settings opens with a personal workspace: saved profile readiness, shortcuts to missing essentials, and due follow-ups from the application tracker. Import resume details to get started, then review and save your profile. Readiness reflects saved essentials, not a prediction of application success.

Profile saves merge independently edited fields with the latest stored profile. Conflicting edits to the same field show an error and preserve the local draft. Switching roles or creating a profile asks before discarding unsaved edits. Resume and cover-letter updates change only their intended fields, and deleting a profile keeps other profiles intact. New resume imports are associated with the draft profile's ID instead of a shared default resume.

The dashboard refreshes when applications change in another extension window, updates due dates after midnight or waking the browser, and opens the tracker with due items filtered when you select Review follow-ups. Invalid draft email, phone, and graduation-year values do not count as completed essentials. Autofill previews are tied to the selected profile's saved details; changing those details requires a fresh scan. Resume attachments use the profile from that scan and respect the upload field's accepted file types. Native multi-select lists remain manual to preserve existing selections.

Expand **Your copy & paste kit** to search and copy saved contact details, professional links, introduction answers, skills, and remembered questions. It follows the selected profile. If clipboard access is unavailable, answer text remains selectable. The popup keeps scanning prominent and provides compact shortcuts to profile setup and the tracker.

Tracker saves preserve concurrent additions and unrelated edits from other extension windows. Conflicting edits keep the draft open with an explanation. Duplicate detection retains job IDs in URLs and uses the local application date. Detecting a submit action only offers a tracking prompt: confirm that the website accepted the application and review the company and role before saving it as Applied. Failed saves keep the prompt open for retry.

## Saved info, copy, and download

Click **Saved info** in the popup or Settings header to view saved profile data as labeled title–value rows. Choose a profile, search by title or value, and use **Copy** on a row or **Copy all**. **Download .txt** exports all nonempty saved fields for that profile, including fields hidden by the current search. Unsaved editor changes are not included. The panel refreshes storage when opened and can be closed with Close or Escape.

The encrypted vault is never included in this view, clipboard output, or download. Exported normal profile information is plain text; keep downloads private. If clipboard access is blocked by the browser, values remain selectable and the download option remains available.

## Fresher profile fields

Settings includes 10th and 12th/Diploma results, university and degree start year, degree percentage, study type, active backlogs, education gap in months, nationality, fresher/experienced status, numeric total experience, notice period, joining date, relocation and shift preferences, work mode, current salary, project details, certifications, and coding-profile links. Existing profiles gain blank new fields on load; no quoted personal facts or default legal answers are inserted.

Choose 12th or Diploma before using those results. Specific 12th fields do not receive Diploma results and vice versa. College and university are separate; numeric years of experience are separate from work-history text. Relevant experience remains manual because it depends on the role. Percentages are 0–100 and existing CGPA is 0–10.

Work authorization in India, visa sponsorship, and previous applications must be answered by the user and start unchecked in each preview. Review these for each employer. Documents are listed as a preparation guide and uploaded manually on the employer's page; easyApply does not store photos, marksheets, or certificates. Additional identity numbers, diversity disclosures, background-check consent, and legal declarations are not added as automatic answers.

## Identity and privacy

Security and reliability updates:

- Local storage is restricted to trusted extension contexts; injected page scripts cannot read the profile store directly. Profiles and tracker records are validated on both read and write. Invalid saved records produce a recovery message without overwriting data.
- New vault records use AES-GCM additional authenticated data to bind ciphertext to its profile. Existing vaults remain readable; use Encrypt & save to rewrite an old vault in the new format.
- PAN/Aadhaar editors and previews mask identity values. Unlocked identity automatically clears after two minutes and after filling. Remote identity fills require HTTPS; localhost remains available for dummy-data tests.
- Each preview has a single-use token and a two-minute expiry. A changed page URL, form action, control type, field mapping, or field value prevents stale filling. Existing values start unchecked, requiring explicit selection to overwrite.
- Page messages validate their sender and payload. Scans are capped at 300 controls. Page calls have a timeout; fill operations are never automatically retried because a timed-out fill may already have run.
- Loading banners announce progress for storage, scan, fill, encryption, unlock, and tracker saves. Conflicting controls are disabled, duplicate actions are blocked, and errors have a separate alert style. Reduced-motion preferences are respected.

These safeguards reduce risk but cannot make arbitrary websites trustworthy. Synthetic form events may still be rejected by custom widgets, and a website can read any data you approve filling into it. Independent profile-field edits from multiple Settings pages are merged. Conflicting edits to the same field are rejected without discarding the local draft; refresh and review before retrying.

Normal profiles and the application tracker use `chrome.storage.local`. PAN and Aadhaar are stored separately under a per-profile vault key, encrypted with AES-GCM (256-bit key, fresh 96-bit IV) and PBKDF2-SHA256 (310,000 iterations, fresh 128-bit salt). A separate vault passphrase of at least 12 characters derives the key; the passphrase and key are not persisted. This is an encryption passphrase, never an account password. Forgotten passphrases cannot be recovered; delete and recreate the vault.

Unlock identity in the popup and scan again to preview it. Sensitive matches start unchecked and require a separate confirmation before filling. Locking or closing the popup clears its in-memory identity. Deleting a profile deletes its vault. On an approved fill, identity is exposed to that website just as manually typing it would be.

Never enter passwords, OTPs, UPI PINs, or banking credentials into profile fields or notes. Use the separate encrypted Saved accounts section for login email/password pairs. Detected credential and consent controls remain excluded from autofill. Free text is user-controlled; do not paste secrets into it.

Permissions: `storage` for local data, `activeTab` and `scripting` for user-triggered scans and fills, and `contextMenus` for right-click actions. Only the isolated E2E build grants localhost access for synthetic tests. The production build uses temporary activeTab access. Optional AI generation sends selected career context directly to Groq after consent; local autofill does not. Local storage is not an OS-level secure enclave; protect your Chrome profile and device.

## Testing

```sh
npm run lint
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

The Playwright suite loads the production extension into a fresh Chromium profile, saves a profile through Settings, scans and fills the local website through the popup, checks radio/checkbox/select values and DOM events, verifies protected fields remain empty, and asserts no submission occurred. A filled-page screenshot is saved in `test-results`.

It also checks deselection, default protection for populated fields, sensitive confirmation, loading and disabled controls, post-preview field edits, and navigation rejection. The unpacked workflow was verified in Chrome for Testing 145 with Playwright 1.58.2; lint, build, and the unit tests passed at that verification point. See RELEASE-CHECKLIST.md for current verification results. Unit coverage includes ciphertext tampering, cross-profile vault-copy rejection, legacy-vault compatibility, corrupt storage, and connection timeouts. The production dependency audit reported no known vulnerabilities at verification time.

On this Windows machine, Chromium in the default download directory failed to launch with a side-by-side configuration error. The test automatically uses the workspace-local `.browser/chrome.exe` copy when present. On another machine, the normal Playwright installation is used. Set `APPLYEASE_CHROMIUM` to override the executable, or `APPLYEASE_CDP` to connect to an isolated test browser with easyApply already loaded. Never point the test at your personal browsing session: it closes the test context. Generated browser copies and profiles are git-ignored.

For manual testing:

```sh
npm run test:site
```

Open `http://127.0.0.1:4174/test-form.html`. The event counter shows input/change/blur events and manual submits. Use dummy identity values only.

## Modules and limitations

- `src/model.ts`: shared types, profile validation, field groups.
- `src/matching.ts`: reusable aliases and exclusions.
- `src/content.ts`: current-page detection, element registry, safe filling and events.
- `src/storage.ts`: normal storage and encrypted identity vault.
- `src/main.tsx`: popup, settings, profiles, identity and tracker.
- `src/*.test.ts`, `e2e/`: unit and unpacked-extension tests.

This MVP supports visible standard HTML inputs, textareas, selects, radios and checkboxes in the main document. It uses labels, names, IDs, placeholders, ARIA labels/references, autocomplete and fieldset legends. Checkbox groups require a matching saved item (comma-separated skills work); consent boxes are excluded. Selects require an exact normalized option label or value. Unknown fields are shown without a value. File inputs are highlighted, never filled.

Custom widgets, cross-origin frames, shadow roots and site-specific multi-step flows may require manual entry. Scan again after a step change. Native value setters and input/change/blur events support common framework forms, but sites requiring trusted user events can reject synthetic changes. No universal site compatibility is claimed. Dates use ISO format; CGPA supports 0–10. Application tracking is manual and editable.

Custom saved info: open Saved info, choose a profile, and click Add entry to save a title and value. Entries support editing, deletion, search, copying, and text download. They are stored locally per profile and are for manual copying. Use ordinary application information only; never enter credentials. PAN and Aadhaar belong in the encrypted vault.

First-time guide: easyApply opens a six-step welcome tour after local data loads. Back and Next save progress locally; closing the popup resumes the last saved step. Skip tour (or Escape) dismisses it, and Quick tour replays it from the popup or Settings. The final step opens profile setup when no profile has been saved. The guide never writes profile values or fills a page.

Alternate company labels are maintained in src/alternate-labels.ts, alongside the base and fresher mappings. Examples include Mail ID, Mobile No., Present Address, Year of Passing, Expected CTC, and Position Applied For. Matching uses explicit equivalents rather than fuzzy guesses. Emergency, relative, reference, secondary-contact, separate address-line, and dialing-code fields are excluded when identified. Unknown fields still require manual entry.

Label normalization accepts case changes, punctuation, underscores, camelCase, full-width characters, and common prompts such as Please enter your Email Address (required). Nearby short captions in single-control wrappers are considered for every field type. The alias catalog also covers school and degree education, projects, work preferences, and common application questions. Arbitrary wording and unsupported custom controls may still need manual entry.

Field-type validation: incompatible saved text (for example Not applicable in a numeric salary field) is left unselected with a preview explanation. Filling rechecks syntax, range, step, and format constraints before setting values. easyApply does not replace nonnumeric answers with zero or guess salary units; enter an appropriate value manually.

Smart fill prompt: open the section in the popup or Settings, enter a target role, and click Copy prompt. Paste it into ChatGPT and attach your resume there. The prompt lists every easyApply profile field and asks for supported facts, role-focused draft answers, and missing-detail questions. Review the response and manually enter values in Settings. This feature copies text only; it adds no AI API, automatic resume upload, or response import.

## Quick Fill and selected profiles

Right-click a regular HTTP/HTTPS application page and choose **easyApply: Quick Fill Form** or **easyApply: Open Quick Fill Panel**. These actions inject the content script when needed, so no earlier popup scan is required. **Alt+Shift+F** is a Chrome extension command and also works on a fresh page. If Chrome or your operating system assigns that shortcut elsewhere, configure it in `chrome://extensions/shortcuts`.

The floating panel appears after an extension action connects to the page; easyApply does not automatically inject itself into every website. Quick Fill scans and immediately fills eligible empty fields, without the popup's per-field preview. Use the popup's Scan application form workflow when you want to review first. Identity and protected eligibility answers remain excluded from Quick Fill. Upload documents and submit yourself.

Saving or selecting a profile in Settings, the popup, or the floating panel persists the selection locally. Quick Fill reads the latest saved selection and values each time. Deleting or explicitly deselecting a profile does not silently select a different profile. Legacy data with no saved preference initially uses its first profile. Refresh an already-open Settings editor before editing from another window.

Unsupported pages and connection failures show an exclamation badge and an explanatory extension toolbar tooltip; refresh a supported page and invoke the extension again. A timed-out fill is never automatically replayed.

## Privacy and release preparation

Read the [Privacy Policy](public/privacy.html), also linked from the popup and Settings. Ordinary profile and tracker data are not encrypted by easyApply; the dedicated identity and saved-account vaults are encrypted. Data filled into a website is visible to that website, which may autosave it before submission.

The policy is bundled in the production extension. Before store submission, publish this same document at a public HTTPS URL and supply a working developer contact/support channel in the listing. See [release checks](RELEASE-CHECKLIST.md) and [website compatibility testing](COMPATIBILITY.md). A successful unit suite alone does not establish compatibility with live recruitment websites.

Release checks on September 13, 2026: 516 unit tests and both browser end-to-end scenarios passed, along with lint and the production build. The Node-based end-to-end runner starts and closes its own local Vite server (or reuses an existing server). Public-form scanning was exercised on Greenhouse, Lever, Ashby, and Zoho Recruit; SmartRecruiters, Workday, and LinkedIn have documented access or login limitations. See COMPATIBILITY.md for the exact scope. Custom dropdown inputs and preferred/nickname fields remain manual; numeric total experience is distinct from role-specific experience.

## Optional AI application answers

Open **AI answers** from the extension. Expand **Enable / manage AI**, create your own key at https://console.groq.com/keys, accept the data-sharing notice and enable access. Groq offers a Free plan with quotas; this is not unlimited free inference. Paid Groq accounts follow their own billing settings. The model is `openai/gpt-oss-120b`; no shared API key is bundled.

Review the displayed career facts, enter the role/company/job description, then choose **Detect page questions** from the popup on a job page. **Generate drafts** lets you edit/copy answers; **Generate & fill** fills complete answers into the detected empty fields. Cover letters, role/company motivation, suitability, introductions, strengths, project and achievement questions are supported. Exclude unwanted questions before generation. Standalone drafts also work from Settings.

AI currently supports visible native text inputs and textareas in the main document, up to six questions per scan. It skips filled fields and protected questions, checks limits, and rejects changed or expired previews. It does not submit applications. Model output can still be inaccurate: review every answer. Missing facts are requested instead of intentionally fabricated. Keep the popup open during generation; rescan after two minutes or after filling.

The optional `https://api.groq.com/*` permission is requested only on enabling AI. Keys default to trusted `chrome.storage.session` and are never sent to content scripts. The explicit Keep API key across browser restarts toggle saves AES-GCM ciphertext in trusted `chrome.storage.local`, with a non-exportable CryptoKey in extension IndexedDB. Auto-restoration protects against casual plaintext exposure, not compromise of the browser profile/device. Turning it off removes the persistent copy; Disable AI removes session and persistent copies. Career facts and supplied job context/questions leave the device only when generation is requested; vault data and resume files are excluded. See `public/privacy.html` and Groq's data policy. Automated AI tests mock the provider; a real key is required for live verification.

Each AI question card supports Generate this answer, Regenerate and Copy. An optional writing preference can request a shorter answer or different emphasis. Regeneration sends only that question, its prior draft and preference, together with the career/job context; other drafts and manual edits are preserved. Regenerating inside the AI answers editor updates only the draft. After scanning, the compact Regenerate button beside an AI-filled field replaces that specific page answer if it is unchanged and the two-minute receipt is valid.

With AI enabled, Scan application form also detects and automatically fills supported empty AI questions. Uncheck Generate and fill AI questions during scan to preview ordinary fields without an AI request. This uses saved career facts and detected role/company; ordinary fields still require review and Fill selected fields. AI failures do not block ordinary scanning. Oversized or incomplete AI answers are skipped for individual handling.

After scanning, AI fields appear above the automatic AI checkbox. Each successfully filled field has its own Regenerate action. Regeneration preserves manual edits, rejects expired or changed targets, and invalidates the ordinary-field preview so it can be rescanned against the updated page.

Scan application form automatically attaches the selected profile's saved resume to identified empty Resume/CV file inputs before generating AI answers. It preserves existing attachments and checks the input's accepted file extensions/MIME types. Other document uploads stay manual. Attachment success means the browser field received the file; verify the employer's upload/processing status.

Split international phones: when a phone input has one adjacent native calling-code selector with explicit +code options, scanning separates the saved +/00 international number into an exact offered code and national digits. Filling selects that code and enters the national number. There is no default +91, no fixed ten-digit assumption, and no prefix stripping on standalone inputs. Ambiguous shared-code options, local numbers without an explicit international prefix, and custom non-native calling-code widgets remain manual. Changing the selector after preview requires a new scan.


### Date of birth autofill

DOB filling respects native date inputs and explicit date-format hints, including slash, dash, dot, and named-month formats. Day/month/year controls require DOB context (for example, a Date of birth fieldset or `bday-day` autocomplete). Month dropdowns use their visible labels before underlying numeric values, supporting zero-based month values. Explicit Age / Current age / Age (years) inputs derive age from a complete saved DOB; eligibility questions are not answered from age.

Read-only Flatpickr and jQuery UI inputs use their calendar APIs in the page context. Unsupported calendars, missing library instances, and constrained calendars that cannot be safely validated require manual selection. Ordinary read-only inputs remain untouched. Browser regression tests use local calendar API fixtures; compatibility with every recruitment site's calendar is not guaranteed.


### Voluntary Disclosures (opt-in)

In Profile Settings, enable **Voluntary Disclosures** separately for each profile and save your explicit choices for gender, race/ethnicity, protected veteran status, and disability status. Blank means leave unanswered; “I do not wish to self-identify” is an explicit choice. Existing profiles remain opted out and existing personal gender is not copied into a disclosure default.

Supported empty native dropdowns and radio groups use exact answers or a small list of equivalent decline phrases. General military service is not inferred from protected veteran status, and generic Yes/No options, custom dropdowns, multi-select checkboxes, and unmatched regional categories stay manual. Answers are included in normal scan previews and Quick Fill, never inferred or generated by AI. Disabling retains saved choices but stops filling. Clear choices or delete the profile to remove them. Disclosures use ordinary unencrypted local profile storage and appear in profile exports; they are not covered by the identity vault.


### Remember for next time

After activating easyApply on a page, manually answering an ordinary unmatched question and leaving the field offers Save / Dismiss. Enable automatic learning for the selected profile to save new answers immediately; changed answers still require review. Only trusted manual edits are considered; generated fills and protected questions are excluded. Save adds a per-profile `customFieldAnswers` record. Profile Settings lets you edit or forget these answers (then Save profile). They use unencrypted local profile storage and are included in exports, not AI career facts.

Scan previews and Quick Fill reuse answers for normalized exact question text on empty supported text inputs, textareas and native selects. Words, locations, numbers and negation must match; semantic guessing is intentionally absent. Controls must still match the scan snapshot, and existing answers stay untouched. This requires activating the extension on each page, preserving the existing activeTab permission model. Learning does not require submission. Fields are processed in sequence, with one review prompt at a time. A pending review suggestion expires after 15 minutes in session storage and can reappear on the next extension activation after navigation. Learning an answer does not indicate that the application was submitted or accepted.

## Publication builds

Production `dist` contains no localhost or permanent job-site host access. `npm run test:e2e` builds `dist-e2e` with localhost access solely for synthetic browser tests. Do not upload that directory. Run `npm run licenses` after dependency changes, then `npm run release:package` to build, validate, and create the store ZIP with a SHA-256 sidecar. See RELEASE-CHECKLIST.md and STORE-LISTING.md for current disclosures and remaining dashboard requirements.

## Cover letter drafts

Cover letter opens a local, editable full-letter draft. Add a company, role,
relevant achievement and a sentence explaining your interest in the employer,
then choose **Update draft**. Only the active section changes. Edited sections
require **Replace edited draft** before replacement; input and tone changes do
not erase text. Other sections remain independent drafts.

Templates use supplied profile facts and project details, omit missing
qualifications, and do not invent employer attributes. Review all wording before
use. Copy a section or download it as UTF-8 text; About You, Why Hire Me and Why
This Company can also be applied to the profile. Draft edits are not persisted
when the window closes. No API or network request is used for this generator.

## Smart Fill and Saved Info refinements

Smart Fill starts with the active profile's preferred role. Choose all fields or
only fields missing from that saved profile, and optionally include a job
description. Copy, select or download the prompt, then attach your resume in
ChatGPT. Saved profile values are never embedded in this prompt. Job context is
quoted as reference material and is not treated as evidence of qualifications.

Saved Info supports multi-word search across titles and answers, Copy all,
Copy results, and a choice of all-data or filtered text downloads. Standard
fields link to their editor in Settings. Unsaved custom-entry changes require
discard confirmation before closing, cancelling, switching profiles or editing
another entry. Failed custom-entry loads offer retry and disable bulk exports
until recovered. Exported files remain plain text and exclude the identity vault.

## Saved resume document

Resume document shows the file name, type, size, local save time and associated
profile, with labeled Download, Replace and Remove actions. PDF, DOCX and TXT
files up to 10 MB are accepted; empty files and mismatched extensions/MIME types
are rejected before replacing the stored file. This check does not inspect the
full document structure. The original document and saved profile answers remain
unchanged when replacing or removing the saved copy. Removal requires an explicit
confirmation in the card.

Resume files are ordinary local IndexedDB records, not encrypted identity-vault
records. Storage failures are shown with retry where appropriate. Failed website
messaging never falls back to storing a resume in the employer page's IndexedDB.
The card guards against stale profile-load results and concurrent operations.
Use **Attach to job page** in the popup to attach the selected profile's saved resume to an empty supported Resume/CV field. The floating widget also supports dragging the actual file into an upload area on that same page, including native file inputs and custom drop handlers. Existing files and accepted file types are checked for native inputs. Check the site's upload status after attaching. Dragging from the popup across windows or into another app may not transfer a file; use **Download**, then the destination's **Choose file** action instead. Embedded frames and websites that require trusted operating-system file drops may also need this fallback.

## Learning new application answers

Enable **Learn new answers automatically** for the selected saved profile to learn
ordinary unmatched questions after manually entering an answer and leaving the
field. Activate easyApply on the page first. Supported controls are text, URL,
search and number inputs, textareas and single-choice native dropdowns. Custom
combobox search text, credentials, identity, legal consent and sensitive questions
are excluded. No submit is required and programmatic autofill events are ignored.

New answers save locally to that profile (up to 100, 2,000 characters each).
Changed answers require Save / Dismiss confirmation. With automatic learning off,
all new answers ask before saving. Future scans reuse answers only for matching
normalized question text, preserving existing field values. Manage or forget
answers in Settings → Remembered field answers; Saved Info shows and exports
them. This is local question-answer memory, not AI training or fuzzy guessing.



### Saved login accounts
Below the application tools, Saved accounts starts collapsed behind a compact toggle. Turn it on to view editable email/password cards, with no setup or unlock step. Closing it keeps edits and hides revealed passwords; reopening the extension starts collapsed again. With the toggle off, View opens saved pairs in a read-only strip with Copy email, Copy password, and eye controls. Copy password works while masked. The editor also includes both copy buttons. Add, edit, or remove cards, then select Save accounts. The row scrolls horizontally. Eye buttons reveal individual passwords; passwords hide on window blur and after saving. Saved pairs load automatically when the extension is opened. They are shared across profiles on this device, excluded from profile exports and AI requests, and never used by automatic form filling. Records are AES-GCM encrypted with a non-exportable device key stored in extension IndexedDB. This is automatic local encryption, not passphrase or OS-vault protection. Existing older passphrase-vault records are retained untouched. Concurrent conflicting saves are rejected.


Dropdown accuracy: placeholders and disabled option groups are skipped. General partial matches require every target word and a unique result; ambiguous choices remain manual. State and city aliases use complete names or codes. Gender categories remain distinct. Custom dropdowns use their own options or explicitly linked menus, wait briefly for delayed rendering, and confirm site-managed selection state. The extension does not rewrite custom labels or hide website validation errors. Unlinked menus or controls that do not expose a verifiable result require manual selection.
# Backup and restore

Open Settings → **Backup & Restore** to download a readable, versioned JSON backup or choose a previous easyApply backup. Select categories to export; imported files are validated and previewed before applying changes. Backups include job profiles, tracker records, the Answer Library, reusable custom information, learning preferences, active profile selection, and locally stored resume files.

**Merge** updates records with matching IDs from the backup and keeps unrelated existing records. For matching Answer Library questions, the imported entry takes precedence; duplicate questions are collapsed. **Replace included categories** requires confirmation and replaces only the categories present in that backup. If a storage write fails, easyApply attempts to restore the previous stored values.

Encrypted PAN/Aadhaar identity data, saved account passwords, AI provider credentials, session tokens, temporary state, and extension infrastructure are excluded. Resume documents are included as file data in the JSON; large files can make backups exceed the 20 MB import limit. Protected vaults and credentials need to be set up separately on a new device. Backups currently use format/schema version 1; unsupported versions are rejected.
