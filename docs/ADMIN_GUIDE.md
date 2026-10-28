# Admin guide

## Roles at a glance

| Role | Default access | Default metrics |
|---|---|---|
| **Super Admin** | Everything, including integrations, users, settings and audit log. Can't be restricted. | All |
| **Marketing Manager** | Assigned ad accounts. All reports, creator mapping, manual sync, CSV export. | All |
| **Content Team Manager** | Assigned creators only (any ad account). Overview, creators, creatives, CSV export. 365-day look-back. | Non-sensitive metrics: no spend, CPM, CPC or cost-per metrics |
| **Creator Viewer** | Assigned creators only. Creator pages only. 90-day look-back. No export. | Impressions, link clicks, CTR, purchases, ROAS, video engagement |
| **Custom roles** | Whatever a Super Admin defines (**User Management → Roles**) | Chosen per role |

A person's access combines all their roles, then applies their personal overrides. A personal **deny always wins**, so you can hide spend from one person who otherwise has a role that shows it.

## Adding a user

1. Go to **User Management → Invite user**.
2. Enter their email and name, and pick a **role**.
3. Narrow or widen their access in the editor:
   * **Ad accounts**: role default, all, or selected accounts.
   * **Creators**: role default, all, or selected creators. With selected creators, the person never sees unmapped ads or other creators' ads.
   * **Metrics**: for each metric, *Role* (inherit), *Allow* or *Deny*. Sensitive metrics are marked. If a combination lets someone work out a hidden metric (for example, ROAS and purchase value together reveal spend), the editor warns you.
   * **Reports, dates & exports**: turn CSV export on or off, set a maximum look-back in days, or set a hard "no data before" date.
   * **Permission overrides**: grant or deny individual capabilities, for example creator mapping for one marketing manager.
4. Click **Create user & invite**.
   * If SMTP is configured, the person gets an email with a single-use link valid for 72 hours.
   * If it isn't, the link appears on screen. Send it privately.
5. When they set a password, their status becomes **active**. Nobody can register without an invitation.

Changes to someone's access apply from their **next request**. There's no cached permission state.

### Removing or pausing access

Open the user and choose:

* **Suspend & revoke access**: signs them out everywhere immediately and blocks sign-in. You can reactivate them later.
* **Sign out everywhere**: ends all their sessions but keeps the account active.
* **Resend invitation**: issues a new link and invalidates the old one.

Safeguards: you can't suspend yourself, the last active Super Admin can't be suspended or demoted, and only Super Admins can manage other Super Admins or edit roles.

Each user's page shows their last sign-in and recent activity.

## Mapping ads to creators

Meta has no reliable "creator" field, so the portal keeps its own mapping. **Each ad belongs to at most one creator.** That's what keeps creator totals from double counting.

### Creators and assets

* **Creators → New creator.** Fields: Creator ID (for example `CR014`, used by naming rules), name, optional Instagram handle and profile image, content team, owner, notes, and active flag.
* **Creative assets** are your internal records of a piece of content: title, type, content angle, hook, product, campaign tags, launch date and notes. You create them from the mapping screen (**New asset**). Linking an ad to an asset enables product and creative-type filters and asset details on creator pages.

### Mapping workspace (Creatives → Creator mapping)

1. **Needs review** lists every synced ad with no creator. New ads appear automatically after each sync.
2. Tick one or many ads (*select all on this page* works for bulk mapping), pick a **creator**, optionally pick an **asset**, add a **reason** for the audit trail, and click **Assign**.
3. To correct a mapping, open the **Mapped** tab, select the ads and assign the right creator. The workspace warns you how many ads will be reassigned. **Unmap** removes the creator.
4. The **history** icon on each ad shows every change: who, when, from which creator to which, and why.

### Naming-convention rules (optional)

If your team names ads consistently (for example `S25_CR014_Serum_HookA`), add a rule on the mapping page: *Ad name contains Creator ID*. You can also match the ad set or campaign name, or the Instagram handle, with an optional prefix such as `CR-`.

* Rules match whole tokens. `CR01` does not match `CR011`.
* They map only **unmapped** ads and never override a manual mapping.
* If a name matches more than one creator, the ad stays in *Needs review*.
* Use **Preview matches** before **Apply now**. Rules also run automatically after every structure sync.
* Managing rules requires access to all accounts and creators.

## Everyday operations

| Task | Where |
|---|---|
| Check data freshness | The sync badge on every report header. **Ad accounts** shows per-account health, last successful sync, and the job log with errors. |
| Force a refresh | **Ad accounts → Sync now**. To re-import a period, use **Resync range…**; it's safe to repeat because rows are upserted. |
| Add or remove accounts from sync | **Integrations → Ad accounts → Sync** toggle |
| Change time zone, refresh windows or leaderboard thresholds | **Settings** |
| See who did what | **Audit logs**. Sign-ins, invitations, access changes, mapping changes, Meta connections, syncs, settings and **every export** (with filters and row counts). |
| Export | **Reports → CSV exports**. Exports use the page filters and the user's own permissions. |

## Reading the numbers

* All figures are **Meta-attributed**, using each ad set's attribution setting (for example "7-day click, 1-day view", shown next to each creative).
* "Last N days" ends **yesterday**. "Today" is partial and still changing. Recent days can change for up to about 28 days as late conversions are attributed; the daily attribution refresh picks those changes up.
* Values mean:

  | Display | Meaning |
  |---|---|
  | `0` | A real zero |
  | `n/a` | Doesn't apply (for example ROAS with no spend, or video metrics for image ads) |
  | `—` | Meta didn't report it, or it's unsupported |
  | `No data` | Nothing synced for the selection |
  | `≤ value` | Summed reach, which over-counts people reached on several days |

* The **low sample** badge and the leaderboard thresholds stop a creative with ₹200 of spend and one purchase from topping a ROAS ranking. Treat flagged results as inconclusive.
* Rankings show what Meta credited to each creative. They aren't proof that a creator caused the sales.
