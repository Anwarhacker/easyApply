# easyApply 1.0.0 — publication candidate

This is a Chrome Web Store submission candidate, not an approved or published listing. The prior `release/easyApply-1.0.0.zip` is obsolete. Use the newly generated `release/easyApply-1.0.0-store.zip` and its SHA-256 sidecar.

## Release commands

1. `npm ci`
2. `npm run licenses`
3. `npm run lint`
4. `npm test -- --reporter=dot`
5. `npm run build`
6. `npm run test:e2e`
7. `npm run release:package` (Windows PowerShell)

`dist` is the production build and has no permanent application-site or localhost host permission. The browser runner builds a separate `dist-e2e` with localhost access to test synthetic forms. Never upload `dist-e2e`, `dist-dev`, the source repository, or a browser profile. AI browser tests use a simulated Groq response; they do not prove live provider availability or output quality.

Release validation checks version consistency, a permission allowlist, no development extension key, required resources, icon sizes, absent test hooks and source maps, and a clean archive layout. It is a targeted check, not proof that every security or compatibility issue has been found.

## Submission items still requiring the publisher

- Host the current `public/privacy.html` on a public HTTPS URL and enter it in the dashboard's Privacy Policy field. A bundled extension page alone does not fulfill this requirement.
- Supply and verify a working developer support/contact address or public support URL. Do not invent one or use a private API key as a reviewer credential.
- Review `STORE-LISTING.md` and complete the dashboard's single-purpose, permission, data-use and certification fields to match actual behavior, including optional Groq AI.
- Use current 1280×800 screenshots with synthetic details, plus a 440×280 small promotional tile and 128×128 icon. Older screenshots may depict outdated UI.
- In regular Chrome, check toolbar activation, Alt+Shift+F, context-menu access, same-origin Next navigation, and permission denial/revocation on a remote application page. Do not advertise universal portal support. See `COMPATIBILITY.md` for remaining manual site checks.
- If publishing AI functionality, use a synthetic profile and your own Groq account to verify successful generation, quota exhaustion, revocation, and Disable AI. Automated tests mock the provider.
- If version 1.0.0 has already been uploaded/published, increment both package.json and vite.config.ts before packaging an update.
- Upload the candidate in the developer dashboard and inspect validation results. No upload or submission is performed by the release scripts.

## Verified source changes (September 27, 2026)

- Removed localhost permission from production and isolated it to the E2E build.
- Profile deletion includes the saved resume; deletion errors propagate rather than reporting false success.
- Privacy policy now covers local resume review, job suggestions, multi-step watchers, tracker follow-ups, resume deletion and optional Groq sharing.
- Removed universal-compatibility and encrypted-resume implications from onboarding.
- Included notices for installed production dependencies.
- Added packaging validation and SHA-256 output.

Current execution results are recorded in `release/VERIFICATION.md` after checks finish.

## Official references

- Privacy policy: https://developer.chrome.com/docs/webstore/program-policies/privacy
- Minimum permissions: https://developer.chrome.com/docs/webstore/program-policies/permissions
- Limited Use: https://developer.chrome.com/docs/webstore/program-policies/limited-use
- Dashboard disclosures: https://developer.chrome.com/docs/webstore/cws-dashboard-privacy
- Images: https://developer.chrome.com/docs/webstore/images
