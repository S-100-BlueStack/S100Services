# Main-map ENC package actions for the October 2026 demonstration

## Modes

Existing F7A 40px icon-only controls remain: Pause/Resume, Discard, Send/Accept and Tools. This task does not redesign the popup, the member table, Product Collection, Analyze, Review or Product History.

- **Pause/Resume and Discard:** Real backend actions, available only when the server returns a current, validated `EncPackage` action projection. The source, package GUID and control rowversion are never inferred from a related S-57 Product or user-supplied Graphic metadata. If the backend is unavailable or a request fails, these buttons fail closed.
- **Send/Accept:** Explicitly local-only demo transition enabled by `VITE_PACKAGE_DEMO_ENABLED=true` **only when Vite runs in development mode** (`npm run dev`). Clicking Send switches the shared action slot to Accept and shows `Demo only — no products were sent to IC-ENC.` Clicking Accept restores Send and shows `Demo only — no results were acknowledged or committed.` No URL query parameter is required or recognized. The opt-in survives route changes and page reloads because Vite provides it at startup; the simulated Send/Accept phase itself lasts only for the current popup session. Production builds and `vite preview` keep Send/Accept disabled, even if the flag is set. There is no Send/Accept HTTP mutation, Hangfire job, Product-state change, history entry, map symbol update or fake response.
- When the local Vite setting is absent, Send/Accept remain disabled while the real backend contract is deferred. Real Pause/Resume/Discard availability never depends on the frontend demo setting; the backend controls it.

The popup's member identities are source-aware. The candidate/current member table, Product statuses, warning/error details and AOI state remain backend-owned. No permanent demo badge or decorative controls are added. With unavailable backend state, the popup does not invent a Pause value.

## Freshness and accessibility

One popup-local session owns the action read, in-flight mutation, optional Worker-status polling and demo primary mode. Its `AbortController`, operation generation and current-Graphic/context check stop publication after refresh supersession, popup disposal or source replacement. A pending read cannot overwrite a successful mutation. Buttons preserve F7A's native click/keyboard handling, application-owned tooltip, Escape and focus behavior; they do not dispatch a disabled action. A simulated sent phase temporarily locks real Pause/Discard in that popup session until demo Accept restores the initial phase. **It does not lock the backend.**

Pause/Resume returns an updated authoritative Pause/version projection; Discard is not reported successful until its Worker job succeeds. After confirmed Discard, the popup invalidates its old candidate overlay and performs an immediate targeted Product-detail read for the selected package. The established Main-map source refresh then updates AOI-owned workflow/member statuses and map symbols. Separately, when an open package popup reads a primary Product-detail status changed by an external operation, it requests a coalesced single-Product `GET /electronicproducts/{name}/status` read. The source controller publishes the authoritative S-101/S-57 projection to the current Graphic without fetching geometry or reloading the complete ENC AOI list; the Product-detail response itself never replaces map status. The operation's success is independent of whether this additional read succeeds; an unsuccessful detail refresh displays a warning and does not restore the obsolete candidate overlay. Publication uses the existing popup generation/identity guard, so an older in-flight detail request cannot reintroduce a discarded candidate.

Tooltips use the application-wide visual help surface with content-sized width, viewport clamping and no trailing full stop. They describe the intended action and, when it is disabled, the verified workflow restriction. They do not include development/demo implementation notes. Only Send/Accept toasts identify the two actions as a simulation. A package with missing or incomplete Product tracks remains readable from the action endpoint with `canPause`, `canResume` and `canDiscard` set to `false`, and a stable `restrictionCode` (`MEMBER_TRACK_MISSING` or `MEMBERS_NOT_READY`). This does **not** loosen backend mutation checks; incomplete/unsafe packages cannot be paused or discarded by this candidate.

## Required demonstration setup

1. API and Worker: run in Development with `EncPackageActions:Enabled=true` in each effective `appsettings` configuration, against the existing database with B1-lite migration `008` applied.
2. Frontend: create a local, uncommitted `src/ProductCatalogue/.env.development.local` containing `VITE_PACKAGE_DEMO_ENABLED=true`, then start/restart Vite using `npm run dev` in `src/ProductCatalogue`. Alternatively, set the same environment variable in the Vite terminal before running `npm run dev`. Main Map navigation needs no URL parameter. The frontend flag controls _only_ Send/Accept simulation; it does not enable backend routes. Remove the flag (and restart Vite) after the demonstration.
3. Use an actual unsent `EncPackage` from the development/test database. Pause, confirm toast, close/reopen and check that Pause persists. Resume, confirm persistence. Clicking Send then Accept gives demo-only toasts and no network mutations.
4. For real Discard, select **only a deliberately disposable test package**. It permanently discards both unverified candidates, not the published Product versions. Verify that the open popup immediately drops candidate attributes after Worker success and updates its committed Product values; AOI status/symbol changes are published by the Main-map source owner through targeted revalidation or normal periodic/manual source refresh.
5. Check light/dark themes, focus, keyboard Enter/Space, Escape to dismiss help, stale popup disposal, two tabs, failed/slow backend, and the disabled action text.

Run local frontend verification:

```powershell
cd src/ProductCatalogue
npm run format
npm run check
```

The true backend Pause and Discard workflows must be tested separately; passing frontend tests cannot establish SQL safety. Never demo against production or real live-IC-ENC dispatch.

## Popup presentation follow-up

Main-map popup action help is unified across package, ordinary Product, dropdown and
application-owned header actions. A valid inactive (`Idle`) workflow without pause or schedule
has no footer; absent workflow state has no placeholder footer. Non-idle workflow, real pause
and any backend-provided schedule can still appear. All backend eligibility and actual
Pause/Resume/Discard effects remain unchanged, and simulated Send/Accept remains explicit
in notices rather than hover help.

## Targeted popup status synchronization

The complete `GET /electronicproducts/aoi?layer=ENC` remains authoritative for initial,
manual and periodic loads. For an open package popup that observes Product-detail
status drift, the frontend instead reads `GET /electronicproducts/{sourceName}/status`.
The response contains the same server-owned ENC member/status projection used by
the complete AOI endpoint, but no geometry. One source controller generation owns
publication to the matching Graphic, symbol, filter facets and popup. A stale read
cannot overwrite a newer full refresh or reactivate a disabled source.

The AOI and targeted status responses explicitly report `Package.HasActivePackage`.
Standalone Products without an active `EncPackage` never probe package actions.
If no verified action snapshot is available, the actions read endpoint returns
HTTP 200 with `actionsAvailable: false`; this intentionally does not claim
whether the package is absent or its control state is unavailable. No mutation
permission is granted.
Errors and disabled actions remain fail-closed.

Targeted mismatch requests are coalesced per source, with a bounded 30-second
cooldown per browser. Without a connected package popup, there is no additional
polling; regular refresh behavior is unchanged.
