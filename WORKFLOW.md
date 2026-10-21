# Partner journey update — 21 October 2026

Implemented against the complete partner lead-to-deal brief in the existing `dev` checkout. Local only; no publication or push.

## Corrected gaps

- Separate the visible lead lifecycle from vendor intake approval and assignment states; retain the canonical CRM schema and existing saved records.
- Do not convert a qualified lead merely because its registration draft was saved.
- Make registration receipt (Submitted) and In Review observable, timestamped CRM events before the decision. A queued/failed request must not falsely report receipt or approval.
- Keep registration approval and CRM opportunity outcome separate, with direct links between lists, source leads, registrations, and opportunities.
- Route registration-card submission through human confirmation; always open deal details after submission from a lead card.
- Extract, validate, edit, persist, and synchronize quantity. Preserve human corrections across wizard back/forward actions. Fix month extraction that mistook “Juniper” for June.
- Show source, owner, contact information, latest activity, sync, sorting, and permitted field edit affordances.
- Link dashboard metrics to accurate filters across all authorized lead sources and show recent activity.

## Verification

`node --test tests/*.test.cjs` covers both partner-created and CRM-assigned journeys through qualification, registration, and Won/Lost; acknowledgment/review timing; manual vendor review; quantity; draft confirmation; navigation; duplicate prevention; unauthorized-record isolation; offline/failure retry; saved-state compatibility; and existing manager compatibility. The shared manager code only accepts the new Submitted phase; no manager capabilities were added to the partner portal.

Browser QA covers the existing sign-in/onboarding, dashboard, Leads list, natural-language review/confirmation, and responsive layout. The CRM and extractor remain explicitly labeled local simulations.

---

# Lead-to-Deal workflow audit and walkthrough

## Gaps corrected

| Previous behavior | Corrected behavior |
| --- | --- |
| Leads could jump directly to registered or Won | Vendor qualification, registration decision, and opportunity outcome use separate state machines |
| Source/destination changes were disconnected from Salesforce | Partner introductions go to vendor Salesforce; CRM assignments return to the partner; linked deals retain their source lead |
| Sync changed only a timestamp | Canonical CRM records, queued operations, pending confirmations, failures, retries, and conflict handling |
| Qualification and opportunity updates shared one status | Three distinct records (Lead, Deal registration, CRM opportunity) in separate tabs: My Leads, Assigned Leads, Deal Registrations, CRM Opportunities |
| Deal registration was a long form | Describe the deal in your own words; simulated extraction fills the form; review, edit, confirm |
| Registration approval was automatic only | The partner manager reviews deal registrations; approval creates the CRM opportunity |
| Free stage controls could imply vendor approval | No partner approval controls; review decisions come from mock vendor processing |
| Activity and notifications did not explain next actions | Record actions follow confirmed state; notes/follow-ups, history, notifications, and dashboard all use the same records |
| Partner view contained team administration | Program/company data is view-only; no vendor admin or team-management actions |
| Excess sample records crowded the board | Six initial leads, including two New and one Submitted example; created/edited records preserved |

## Partner-created lead to Won

1. On the first screen choose Partner, then sign in (Google, Microsoft, SSO, or email; all demo). Connect Salesforce or select Connect later, view the assigned program, and enter the dashboard.
2. My Leads → Create lead. Enter customer, region, contact, email, product interest, positive estimated value, customer need, and sharing permission; optional details are under More details. Select Submit for approval, or Save draft to finish later.
3. Observe pending synchronization, then Pending approval. The vendor CRM now has the lead. A saved draft can also be opened and submitted separately.
4. With automatic review (the default), the button shows “Waiting for approval…” with a spinner and the decision arrives about 3 seconds later: approval protects the customer for the partner for 90 days, and the lead moves to its next step, Log first contact. Approval does not create an opportunity. In manual review (set in `manager.html` → Lead reviews → Approval mode), the registration waits in the partner manager's queue; the manager checks duplicates, territory, and details, approves it, and the open partner portal syncs at once.
5. Log first contact → Call, Email, or Meeting with an outcome. The lead becomes Working.
6. Qualify lead. Confirm budget, the decision maker, the customer need, and a purchase timeline within 12 months, then Mark as qualified. The lead becomes Qualified after sync.
7. Register deal. Describe the deal (for example: “They want Service Cloud for 60 agents, about $95K, and plan to sign by the end of next quarter.”) and select Extract details. Review the filled-in fields; customer identity comes from the lead and stays locked. Confirm the summary, the customer need, and sharing permission, then Submit registration (or Save draft). The lead shows as Converted.
8. The registration appears in Deal Registrations as Pending approval and in the partner manager's queue (`manager.html` → Deal registrations). The manager checks conflicts, evidence, territory, size, and close date, then approves: the CRM opportunity is created at Discovery and the deal is protected for 90 days. The partner portal syncs at once; the record now also appears in CRM Opportunities. With automatic review on, registrations under $250,000 in supported territories are approved on the next sync.
9. Update opportunity → Proposal → Negotiation → Won, or skip directly to a later stage when appropriate. Open-stage updates can change value and expected close date without moving stages. For Won, enter the actual won amount, actual close date (today or earlier), and an outcome note of at least five characters. Each confirmed update appears in history and the canonical CRM opportunity.
10. The source lead remains Qualified (shown as Converted); registration remains Approved; only the opportunity is Won. The original estimate is retained, and dashboard revenue reflects the actual won amount once.

## CRM-assigned lead to Lost

1. Assigned Leads → Harbor Systems → Accept lead within the 48-hour window shown on the card and in the tracker. Wait for Salesforce confirmation.
2. Log first contact → Call, Email, or Meeting within 3 days. Record the outcome and discussion. The lead becomes Working after sync.
3. Add a Follow-up with a future date. Complete it when done. Both activity and completion synchronize.
4. Qualify lead with all four BANT items. The lead becomes Qualified after sync; no vendor wait is involved.
5. Register deal (describe, review, confirm), submit the registration, and receive the manager's decision as above.
6. Update opportunity → Lost. Choose Price, Competitor, No budget, No decision, Timing, or Other, then enter an outcome note of at least five characters. The source lead remains Qualified and registration Approved. Lost does not contribute to won revenue.

## Partner manager decisions

- **Return for information:** the manager writes what to add. The partner sees it as Needs information with that message, updates the lead, and resubmits; it returns to the manager's queue.
- **Reject:** Duplicate, Outside territory, Not a fit for the program, or Other with a note. The partner sees the reason, and the lead closes.
- **Deal registration decisions:** Approve creates the CRM opportunity (or links the partner's existing open opportunity for the same customer and product). Reject requires a reason (Conflicts with an existing registration, Outside territory, Not enough customer evidence, Customer not eligible, or Other with a note); the partner sees it and can revise and resubmit or withdraw.
- **Assign and reassign:** the manager assigns a vendor lead to a partner (48 hours to accept, 3 days to first contact). A declined or unaccepted lead can be reassigned to another partner, which removes it from the original partner's portal.

## Close, withdraw, and delete

- **Delete draft:** confirm deletion of a never-submitted local lead or registration. A linked registration draft is unlinked from its source lead. No CRM connection is needed for this local action. Submitted records and revised CRM registrations cannot be deleted.
- **Close lead:** partner-created leads can close from Pending approval, Needs information, Approved, Working, or Qualified. CRM-assigned leads can close from Accepted, Working, or Qualified. Choose No budget, No decision maker access, Not interested, No response, Bad timing, Chose a competitor, Duplicate, or Other, plus a note of at least five characters. The tracker shows the step the lead was closed from.
- **Decline assignment:** choose Outside our territory, No capacity right now, Not our specialty, Existing relationship conflict, or Other (with a note). The lead returns to the vendor. An active linked registration blocks closing; an unaccepted Assigned lead uses Decline instead.
- **Withdraw registration:** withdraw Pending review or Rejected registrations, or a revised Draft that already has a CRM ID. Enter a note of at least five characters. A qualified source lead can then start another registration. If Salesforce has already approved the registration, withdrawal fails with a conflict; refresh the record and close the opportunity as Lost instead.
- Closed leads and Withdrawn registrations show the reason and no editing or activity actions. Vendor review jobs leave these terminal records unchanged.

## Exceptions and recovery

- Missing permission/contact/need/value prevents submission with an error. In deal registration, Review checks required fields before Confirm; a failed Submit registration keeps the newly saved draft and the confirm step open for correction, and retrying updates that draft instead of creating another.
- Extraction fills only what it can read and lists the rest as Add this. Values from a qualified lead are never replaced by the description. The extractor is simulated (pattern-based, on-device); Fill in a form instead skips it.
- Short customer needs receive Needs information. Update & resubmit saves corrections and requests review in one queued operation. After confirmation the lead is Pending approval again; a later refresh receives the review result. The secondary resubmit action can resend unchanged information.
- Registering a customer that is already in vendor Salesforce returns Rejected as a duplicate without revealing who owns it. The lead form warns before submission when the partner already has an open lead for that company.
- Mark as qualified lists any missing BANT item and leaves the lead Working. Save progress records BANT answers without qualifying.
- Qualified lead company, email, region, estimated value, and customer need are locked. Contact name and job title can still be corrected. Once an active registration is linked, the lead is fully read-only. The same checks run against the canonical CRM record when queued edits synchronize.
- Log first contact offers Call, Email, and Meeting with an outcome (Connected, Left a message, No response). An ordinary Note or Follow-up on an Approved or Accepted lead leaves the stage unchanged and prompts the partner to log contact.
- Direct registrations in Other territories enter review, then rejection. Revise the territory and resubmit the same registration; history and ID remain.
- An existing local customer/product registration blocks duplicates. A conflicting private CRM registration returns a generic rejection without exposing the other partner.
- Use Northstar Services / Sales Cloud to link an existing opportunity, preserving its CRM value and stage.
- Temporarily go offline, then submit an update: the confirmed value stays unchanged, saved payload is inspectable, and Retry sends the same operation once. Discard restores confirmed CRM values.
- Edit a lead while offline, restore connectivity, and retry. The durable queue sends the saved request.
- If CRM changes the same edited field, opportunity stage, value, or expected close date before sync, the request fails with a conflict. Discard, load current CRM values, and reapply the intended update. Unrelated CRM changes are retained. Backward stage moves and changes to closed opportunities are rejected.
- Overdue expected close dates and open follow-ups are called out in the existing next-step panel. Source leads link directly to the registration and its current opportunity stage.
- Revoked records disappear from partner lists, search, exports, notifications, and open details.

## Boundaries

All customers, Salesforce decisions, sign-in providers, and AI extraction are simulated. The hosted application still stores records per browser and origin. Authentication and partner isolation require a real backend before use with actual customer data. The GitHub Pages publication is a static demo with simulated authentication; use fictional data only.

Automated verification covers the existing journeys plus the close/withdraw, identity lock, resubmission, outcome validation, concurrency, and form-recovery paths. Both complete journeys are exercised through the same handlers used by the interface. Existing tests that contradicted the new required outcome fields, forward-stage rules, or next-step copy were updated with user approval.

The sidebar contains Leads, Deal Registrations, and CRM Opportunities; Leads has My Leads and Assigned Leads tabs. New lead columns show two cards; New registration columns show two. Submitted and Disqualified lead columns show one card each. View all shows every retained record in list view. Welcome and onboarding were preserved unchanged during the partner-only and navigation refinements.

Salesforce setup is optional: Connect later opens the program step and dashboard without marking the CRM connected. Leads and registrations can still be created; submitted requests stay queued, and the header sync chip shows how many are waiting. The portal never redirects to Salesforce updates; connect from there when ready. Each sign-in shows the Salesforce step again, with Connect Salesforce and Connect later. Salesforce updates → Connect Salesforce opens the same confirmation flow in the portal and synchronizes saved requests after confirmation.
