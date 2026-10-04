# Recruitment-site compatibility checks

Date: September 13, 2026. Method: isolated Chromium with the built easyApply extension, no personal browser profile, no credentials, no uploads, no filled live fields, and no submissions. Synthetic values were passed only to the scanner's in-memory preview.

The read-only harness is scripts/check-live-sites.mjs. It creates a disposable extension copy under .test-browser-profiles with host access limited to the listed test sites. It never changes dist or the production manifest. Evidence is written to test-results/compatibility/results.json and local screenshots. Run after npm run build, with network access available:

```sh
node scripts/check-live-sites.mjs
```

## Coverage and findings

| Platform | Public page exercised | Result and limits |
| --- | --- | --- |
| Greenhouse | InterSystems application, job 7885747003 | Application controls scanned. Basic name, email, phone, and LinkedIn matches found. Preferred-name fields now stay manual and the custom Country dropdown is rejected with an explanation. |
| Lever | Lever implementation training application, job a7e7fd90-d227-4d97-aa49-afc847672a50 | Application controls scanned. Name, email, phone, and LinkedIn matches found. Optional disclosures and custom location entry need review/manual entry. The country option list no longer produces a false state-field match. |
| Ashby | OpenAI API Multicloud application, job 4070d52e-0263-4cd5-9107-052b4ecc1209 | Application controls scanned. Legal name, email, and phone matched. Custom location/date controls, uploads, and company-specific questions remain manual. |
| Zoho Recruit | Coditas Senior .Net Developer, job 31162000034795542 | Application controls scanned. Names, email, and mobile matched. Inspection exposed the Total Experience narrative mismatch and the team-leading years mismatch; both were corrected. Custom City selection and CAPTCHA remain manual. |
| SmartRecruiters | Experian Software Engineer I, publication 56b70d08-2652-4b3a-87ac-6666524c7d58 | Application link opened, but the service restricted access in the automated browser. No eligible main-document controls were available. Full compatibility unverified. |
| Workday | NVIDIA external careers, then an Apply Manually flow | Reached a Sign In page. No account was created or used. Authenticated application steps unverified. |
| LinkedIn | Public job search / authentication wall | Public search inspected; a later request reached an authentication wall. Easy Apply behind login remains unverified. |

An earlier Zoho posting at Cogni View India was closed, so it was replaced by the Coditas posting. Closed postings and access restrictions are not compatibility passes.

These checks establish public DOM detection on four application forms. Full filling, custom-widget acceptance, and multi-step completion on live recruitment systems remain unverified. Passing local tests does not establish that an employer's backend will accept every filled value.

## Remaining manual release checks

Use an authorized test account or employer sandbox for real filling. For each platform, record the exact application URL, browser/extension version, date, observed fields, expected values, actual values, and screenshots containing no real personal information.

1. On a fresh remote page, use the native right-click panel and Quick Fill command before opening the popup. Repeat with a second saved profile and confirm the selected profile survives reopening the extension.
2. Review the popup preview. Verify existing values are unchecked, custom widgets are explained, unknown fields remain manual, and preferred names are not replaced with legal names.
3. Fill permitted test data and confirm the site's own UI retains it after blur, validation, and navigation to the next step. Re-scan each step. Include native dropdowns, radios, checkbox groups, and numeric constraints.
4. Confirm passwords, OTPs, consent, uploads, CAPTCHA, and unapproved identity fields are untouched. Use dummy identity only in an authorized secure test environment.
5. Verify no automatic submission occurs, including after shortcut presses and retrying a failed connection.
6. Complete at least five distinct recruitment-platform workflows before making a broad compatibility claim; prioritize the currently unverified SmartRecruiters, Workday, and LinkedIn flows.

## Public URLs used

- https://job-boards.greenhouse.io/intersystems/jobs/7885747003
- https://jobs.lever.co/leverdemo-8/a7e7fd90-d227-4d97-aa49-afc847672a50/apply
- https://jobs.ashbyhq.com/openai/4070d52e-0263-4cd5-9107-052b4ecc1209/application
- https://coditas.zohorecruit.in/jobs/Careers/31162000034795542/Senior-Net-Developer
- https://jobs.smartrecruiters.com/Experian/744000143860629-software-engineer-i
- https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite
- https://www.linkedin.com/jobs/search/?keywords=software%20engineer

## Retention regression coverage (September 28, 2026)

The local browser regression includes a React-style portalled dropdown cleared
400 ms after blur, plus native select/date fields rejected by delayed focusout
validation. Fill reports check custom dropdowns and supported calendar inputs
alongside native controls after a bounded 750 ms settling window. Native selects,
dates, and checkable controls now emit focusout for framework blur handlers.
Existing multi-step tests cover a user-triggered next-step offer, filling the
new step, validation-only updates, Back, and same-origin navigation.

These checks establish local fixture behavior, not live employer backend
acceptance. Validation later than the settling window and authenticated portal
workflows still require manual verification.
