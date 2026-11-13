# DC-UX-03G — Full Package Details / startup review validation

## Change boundary

- In Package Assignment, select a Package with a long (over 650 characters)
  HTML description. The `Details` field must show the entire sanitized content
  immediately, without a `Full details` summary or other disclosure control.
- Verify an ordinary short description, multiple language entries and a missing
  description. `Not provided` fallback and optional language labels remain.
- Test light and dark themes: bold underlined field labels, neutral zebra rows,
  scrollable tables, clickable safe links and wrapping of long text remain.
- Verify keyboard tab order includes only actual links/actions, without a
  hidden Details disclosure. Change Package selection and confirm stale
  content does not appear.
- Mock Feature information remains a plain definition list.

## Security regression

Ensure HTML descriptions containing scripts, event handlers, inline CSS,
unsafe links or unsupported elements are sanitized by
`renderPackageDescriptions.js`. The Details correction must not bypass
`appendSanitizedHtml()` or insert arbitrary HTML into the live DOM.

## Required local commands

Run from `src/DataCatalogue` with the project's dependencies installed:

```powershell
npm run format
npm run check
```

## Startup measurement / manual checks

Follow [DC_STARTUP_LOADING_REVIEW.md](DC_STARTUP_LOADING_REVIEW.md), especially
its Section 6, to capture a real cold and warm waterfall before optimizing
startup. Distinguish map tiles and optional AOI reads from the authoritative
Package list. Test manual Refresh, rapid Pipeline changes, retry after API
failure and navigation away during a pending request. The unified loader is a
separate future task and is **not** part of this candidate.
