# PRM partner portal

A compact partner sales workspace with connected lead qualification, deal registration, and Salesforce opportunity tracking.

## Run locally

```sh
python3 -m http.server 4173 --bind 127.0.0.1 --directory dist
```

Open http://localhost:4173. The application is buildless; no dependency installation is required. All interface assets are bundled locally.

## GitHub Pages deployment

Push to `main` to run the workflow checks and publish `dist/` using GitHub Actions. Configure the repository's Pages publishing source as **GitHub Actions**. No external services, secrets, package installation, or build step are required.

This is a public static demo when hosted with GitHub Pages. Sign-in and Salesforce are simulations; use fictional customer data only. Business records stay in each browser's localStorage and are not uploaded with source or shared across devices.

## Vercel deployment

Import this repository with Root Directory set to the repository root (`.`). The committed `vercel.json` selects Other, skips installation/build, and serves `dist/`. Redeploy the latest commit after changing settings. Routing uses URL fragments, so no catch-all rewrite is required.

## Partner lead-to-deal journey

The partner workspace uses the existing local Salesforce simulator and saved records. Welcome and onboarding are unchanged.

- **Dashboard:** Total Leads, New Leads, Qualified Leads, Active Deals, Pending Registrations, Pending Actions, and Recent Activities. Metrics open the matching authorized list and filter; recent activity opens its record.
- **Leads:** All leads, My leads, and CRM assigned sources share search, status filters, sorting, Flow and List views. The list includes company/contact/email, source/destination, owner, latest activity, lifecycle, and sync state. Select a company or next action for details.
- **Lead lifecycle:** New → Contacted → Qualified → Converted, with Disqualified / Closed outcomes. Existing CRM states are retained for compatibility: Draft, Submitted, Needs information, Approved, Assigned, and Accepted appear under New with a separate intake label; Working displays as Contacted. Vendor intake validation is distinct from partner sales qualification. A registration draft does not convert the lead; successful CRM submission does.
- **Create / work a lead:** Company, contact, email, phone, source, product interest, customer notes, and estimated value use existing validation and duplicate hints. Save a draft or submit to vendor Salesforce. Accept CRM assignments before contacting them. Log calls, emails, meetings, notes, and follow-ups, then confirm the existing BANT checklist to qualify. Authorized edits, status updates, activities, and failures remain synchronized through the durable outbox.
- **Register a deal:** Describe the opportunity or enter it manually. Local pattern-based extraction fills the fields, including quantity; missing information stays visible for human correction. Review preserves edits when going back and forward. Confirm the customer need and sharing permission before submitting. Saved drafts also reopen the confirmation screen before submission. Retries reuse the same registration.
- **Registration tracking:** Draft → Submitted → In Review → Approved / Rejected. Submitted means the simulated CRM acknowledged receipt, not merely that a request is queued. `Pending review` remains the stored name for In Review. Sync errors preserve the last confirmed status. Submitted and In Review run on separate simulated update cycles; automatic review then makes the vendor decision, while manual mode waits for a vendor action. Existing incoming Expired and Withdrawn records remain read-only.
- **Opportunity tracking:** Approved registrations create or link a CRM opportunity. Track opportunity opens the related view, with a link back to the registration and source lead. Registration approval is separate from Discovery, Proposal, Negotiation, Won, and Lost. Won requires an actual amount, close date, and note; Lost requires a reason and note. Canonical Salesforce updates remain authoritative.

Details include the current stage, next action, editable/read-only field indicators, source, destination, owner, IDs, sync state, activities, and history. Registration details include a timestamped status tracker, quantity, submission date, and opportunity reference. Partner records remain scoped to the current account. No vendor controls were added to the partner workspace.

Existing local records, qualified identity locks, draft deletion, lead closure, registration withdrawal, vendor rejection/revision, sync retry/discard, and opportunity conflict checks are preserved. Local storage remains `minute-v1`; no migration resets existing business records.

## New leads for you (simple accept flow)

The partner Overview opens with **New leads for you**: every lead the vendor's partner account manager sends, in four plain steps — **Accept → Contact → Qualify → Register deal**. Each row shows one next action:

- **Accept** or **Decline** (48-hour window shown on the row).
- **Mark contacted** after accepting: one tap logs the first contact and moves the lead to Working. **Add details** opens the full contact form if needed.
- **Qualify** confirms it is a real opportunity, then **Register deal** starts the registration.

If Salesforce is not connected, an accepted lead shows "Accepted. Sends to Salesforce once connected." with a Connect button. The vendor sees each acceptance live in Lead distribution.

## Ask PartnerAssistant (chat link)

Both portals show an **Ask PartnerAssistant** button in the bottom-right corner that opens the natural-language assistant. Set the widget link in `dist/chat-link.js`:

- `CHAT_URL`: the knowledge-base widget link. Empty shows a "not connected yet" note.
- `OPEN_IN`: `'panel'` shows the widget inside the app; `'tab'` opens it in a new tab (use this if the widget blocks embedding).

## Partner manager portal

`manager.html` is the vendor side of the flow, for one role: the partner manager. Choose Partner manager on the first screen and sign in on the same sign-in screen partners use (Google, Microsoft, SSO, or email; all demo); it lands on Overview. Opening `manager.html` while signed out goes to that sign-in screen. The manager pages don't link to the partner portal. Pages:

- **Overview:** action first: come in, make the decisions waiting for you, move on. Built from hand-drawn SVG charts (no chart library), all updating live as partners act or you decide.
  - Hero: greeting, how partner pipeline is trending, and **Up next**: the one decision to make now with its check result and buttons (Approve when every check passed, otherwise Reject or Return for info; Reassign for response-time breaches), Review for the full record, Skip, and a done-today progress bar. The right side shows partner-sourced pipeline with its 12-month trend.
  - Decision queue: every registration to decide, oldest first, then response-time breaches, each with its check result and the same quick buttons; filter by leads, deals, or at risk. After a decision the toast names what's up next.
  - Your day: progress ring (done today vs still waiting), counts per queue that open the right page, the automatic-review switch, and Assign a lead.
  - KPI tiles: leads in progress (registered vs assigned), revenue won over 12 months with a win-rate ring, lead-to-deal conversion with a mini funnel, and response time against the 48-hour and 3-day windows.
  - Trend chart: open pipeline by partner (stacked areas) or closed-won revenue by month (stacked columns), 6 or 12 months, with partner toggles and a hover tooltip per month.
  - Pipeline mix: a donut of open pipeline by stage, territory, or product; hover a segment for its share, click a stage to open those opportunities.
  - Lead-to-deal funnel (full width): six steps as bars with step-to-step conversion; click a step to see those leads.
  - Partner leaderboard: sort by pipeline, revenue, or win rate, with 6-month sparklines and target rings; click a partner for details.
  - Live partner activity: new events slide in as they happen.
  - Motion: cards rise in, charts draw, and numbers count up when the overview opens; live changes count from the old value to the new one. Reduced-motion preferences turn this off.
  - Earlier months in the trend charts are simulated reporting history; the current month is always computed from the live Salesforce simulation.

- **Lead reviews:** partner registrations waiting for a decision, oldest first. Each review runs the registration checks against every partner's records — duplicates (an exact active match blocks approval; similar names, shared email domains, and the partner's own open opportunities are flagged), territory, contact details, customer-need detail, and sharing permission — and recommends a decision. Approve (90-day protection), Return for information with a message, or Reject with a reason (Duplicate, Outside territory, Not a fit for the program, Other).
- **Deal registrations:** partner deal registrations waiting for a decision, with checks for conflicting registrations or opportunities from any partner, evidence (a qualified lead, or a confirmed customer need for direct registrations), territory, deal size (from $250,000), and close date. Approve (creates the CRM opportunity at Discovery and protects the deal for 90 days) or Reject with a reason the partner sees. Recently decided registrations show their CRM opportunity stage. Deep link: `manager.html#registration/<REG id>`.
- **Lead distribution:** assign a vendor lead to a partner, track the 48-hour acceptance and 3-day first-contact windows, and reassign leads that were declined or not accepted in time.
- **All partner leads:** every partner's leads with stage, BANT progress, activities, and your decision log. Filter by stage group and partner.
- **Opportunities:** every CRM opportunity created from approved registrations, with totals per stage (Discovery, Proposal, Negotiation, Won, Lost) and stage and partner filters. Opportunity details show the stage path, value, protection, and the source deal registration.
- **Partners:** the program directory with tier (Platinum, Gold, Silver), type, territory, primary contact, open pipeline, closed won, active leads, win rate, and progress to the annual sourced-pipeline target. A partner's details add lead acceptance and list their leads and opportunities; Assign a lead preselects that partner.

The top bar has Search (Command/Ctrl+K; partners, leads, registrations, and opportunities) and Partner activity (a feed of submissions, contacts, acceptances, and your decisions). Vendor-side demo data for Northbridge Consulting and Cobalt Systems is added once, so the program looks realistic, including registrations that wait for your decision in any approval mode (a clean lead, one with too little detail, a large deal, one outside the territory, and an assignment past its 48-hour window). Partner portals never see other partners' records.

Approval mode is automatic by default: program rules decide each registration a few seconds after the partner submits it, so the partner journey runs end to end. Switch to manual review (Lead reviews → Approval mode) to make every lead and deal registration wait for your decision.

Both portals share the browser-local simulated Salesforce, and stay connected live: with each open in its own tab, a partner submission appears in the manager's queue at once, and a manager decision or assignment syncs into the open partner portal immediately, with a notification (like a CRM webhook). A partner who is mid-form keeps their input; the screen refreshes after they finish.

## Salesforce simulation

This is an explicitly labeled browser-local simulation. It does not connect to Salesforce, Google, email, or any other external customer system. The simulated CRM stores canonical records separately from the portal's confirmed snapshot, plus a durable outbox and idempotent operation results.

Submitted updates remain pending until a successful sync. Failed requests retain their proposed values for inspection and retry. Refresh receives the next simulated vendor review. Conflicting customer edits or stale opportunity stages produce an actionable error; discarding the failed request restores the latest confirmed CRM values. Independent CRM changes are preserved.

Demo behavior:

- With automatic review on (the default), the Submit for approval button shows a spinner with “Waiting for approval…” and the decision arrives about 3 seconds after a submission, then the record moves to its next step. If the lead is missing the partner's permission to share customer details, Submit asks for it in a short dialog first. Lead registrations: other territory is rejected, a customer already registered in vendor Salesforce is rejected as a duplicate (without revealing the other partner), a customer need under 20 characters returns Needs information, and everything else is approved with 90-day protection.
- Registrations are acknowledged first, then enter review on the next simulated update. Automatic mode simulates the vendor decision on the following update; manual mode waits for vendor review. Other territories are reviewed and rejected, with a revision path.
- `Evergreen Systems / Sales Cloud` demonstrates a duplicate conflict without revealing another partner's records.
- `Northstar Services / Sales Cloud` demonstrates linking an existing authorized opportunity and retaining its canonical values.
- Connection failures preserve saved requests. Retry recovers them after connectivity returns. Automated tests also inject a deterministic failure in the mock CRM; there are no failure-testing controls in the partner UI.

Data persists in browser localStorage under `minute-v1`. Deploying the static application does not upload browser business records; localhost and the hosted origin have separate storage. The mock partner filters apply to lists, details, mutations, search, notifications, and export. These are not a production security boundary. Production requires server authorization, real authentication, OAuth, CRM APIs/webhooks, and durable server persistence.

## Interface

The existing PRM blue/orange palette, compact Tabler components, light sidebar, welcome animation, and centered onboarding remain. The first screen offers two portals as cards, Partner and Partner manager. Both continue to the same sign-in screen (Continue with Google, Microsoft, or SSO, or email; all are demo sign-ins); a partner then goes through onboarding, and a partner manager lands on the manager Overview. Signing out of either portal returns to this screen. Partner onboarding then has two steps: Connect CRM (Connect Salesforce or Connect later) and the read-only program overview. Each sign-in shows that step with Connect Salesforce and Connect later. With Connect later, leads and registrations can still be created and submitted updates wait until the partner connects from Salesforce updates; the portal never redirects there on its own. A sync status chip in the header shows the state: Salesforce synced (with the time), Syncing, N updates waiting to sync, Salesforce sync failed, or Salesforce not connected; clicking it opens Salesforce updates. Demo passwords are never stored or sent.

The dashboard keeps its journey hero and next moves, with six linked journey metrics, an expandable action list, and recent activity.

Portal screens share one heading component and spacing tokens. The sidebar has Leads, Deal Registrations, and CRM Opportunities. Leads has two tabs, My Leads and Assigned Leads. Flow and list views share category, search, and status filters. Lead boards show New, Contacted, Qualified, Converted, and Disqualified / Closed. New columns display two cards; the closed column displays one card; View all opens the complete filtered list. Lead cards show the lead rating and the most relevant deadline, protection period, or BANT progress. Each card's next step is a button: one-click steps (Submit for approval, Accept, Submit registration, Retry) run from the card, which shows a “Processing submission…” loading button until the vendor decides, then the card moves to its new column with a brief highlight; steps that need details open their dialog and return to the board. Lead details add a journey tracker and a BANT checklist; the lead form keeps optional details (job title, phone, website, industry, company size, timeline, rating, source) folded away and warns about a customer the partner already has an open lead for. New registration columns display at most two cards. Details show origin, destination, next action, canonical customer data, activities, follow-ups, and timestamped history. Dashboard totals, notifications, search, and CSV export use the same authorized records. Salesforce updates is a partner status/activity view with retry controls, not CRM configuration. Vendor administration and team-management controls are absent; company/program information is view-only.

Keyboard shortcuts: Command/Ctrl+K for search and Command/Ctrl+J for quick actions. Tables sort by column; boards and tables scroll horizontally on smaller screens. Forms have validation, errors, cancel actions, and saved-update feedback. Reduced-motion preferences are respected.

## Files

- `dist/sales-workflow.js`: partner-scoped state machine, canonical mock CRM, outbox, validation, duplicate checks, and review processing.
- `dist/deal-assist.js`: simulated natural-language extractor for deal registration.
- `dist/app.js`: shared page components, forms, navigation, details, notifications, and synchronization feedback.
- `dist/manager.html`, `dist/manager.js`: the partner manager portal (vendor side).
- `dist/theme.css`: compact responsive design tokens and components.
- `dist/vendor/`: local Tabler 1.6.1 stylesheet and MIT license.
- `tests/`: domain and UI-controller tests with a minimal DOM harness.
- `WORKFLOW.md`: workflow audit findings and walkthroughs.

## Verification

```sh
node --check dist/sales-workflow.js
node --check dist/app.js
node --check dist/manager.js
node --test tests/*.test.cjs
```

Tests cover both full journeys, the manager portal pages, filters, search, and activity, the three-step registration and its extractor, deal registration approval in the manager portal, sync status, sign-in options, qualification locks, draft deletion, close/withdraw/resubmit, actual won amounts and close dates, duplicate/link behavior, validation, sync failure/retry/discard, reload persistence, CRM concurrency, partner permissions, notifications, navigation, forms, search/export, and markup structure. UI tests exercise event handlers in a DOM stub; they do not substitute for browser layout, native form validation, drag, or accessibility-engine testing. Both portals were also checked in a browser during development.
