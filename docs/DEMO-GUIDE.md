# Demo guide

For whoever is presenting Society ERP to a housing society committee. It covers loading demo data,
what to prepare before the meeting, a running order for the demo itself, and how to answer the
questions that always come up.

Read the section "Free plan limits" before you present. One of them, the cold start, will embarrass
you if you do not know about it.

## The two addresses

| Piece | URL |
|---|---|
| Web app | https://society-erp-project.onrender.com |
| API | https://society-erp-project-api.onrender.com |

You only ever open the web app. The API address is for health checks and waking the service.

## 1. Load the demo data, once

A fresh deployment has the platform set up (plans, modules, permissions, roles, notification
templates, super admin) but **no society and no data**. An empty screen demos badly, so load the
demo society first. It creates Palm Grove Residency in Bengaluru: two towers, forty-eight units,
residents, invoices, payments, complaints, visitors, amenity bookings, notices, events, polls,
documents, meetings, staff with attendance, domestic help, vehicles, parking, incidents, emergency
contacts, contracts, assets and inventory.

Render's free plan has no Shell, so run the seed from your own machine against the deployed database.
It writes to whatever `MONGODB_URI` points at.

```bash
cd D:/project/SocietyERP
# apps/api/.env must already point MONGODB_URI at the same Atlas cluster Render uses
npm run seed
```

It takes a minute or two and finishes with `Seed complete`. It is safe to run more than once; it
checks for existing records before creating anything.

Two cautions. First, this writes into the same database your live site uses, which is the point, but
do not run it against a cluster holding a real society's data. Second, make sure
`SEED_SUPER_ADMIN_EMAIL` in your local `.env` matches the value set on Render, otherwise you end up
with two platform admin accounts. An existing account's password is never overwritten.

## 2. Logins

| Role | Email | Password | Lands on |
|---|---|---|---|
| Society admin | `admin@palmgrove.demo` | `Admin@12345` | Society dashboard |
| Committee member | `committee@palmgrove.demo` | `Committee@123` | Society dashboard |
| Security guard | `guard@palmgrove.demo` | `Guard@12345` | Gate app |
| Resident | `member@palmgrove.demo` | `Member@12345` | Resident home |
| Platform owner | the `SEED_SUPER_ADMIN_EMAIL` you set on Render | the password you set | Platform console |

The role decides the landing page and what is visible. That is worth pointing out during the demo
rather than explaining it in the abstract.

## 3. Fifteen minutes before the meeting

1. **Wake the API.** Open https://society-erp-project-api.onrender.com/api/v1/health and wait until
   it returns `"status":"ok"`. On the free plan the service sleeps after fifteen minutes idle and the
   first request takes about a minute. Doing this in front of the committee looks like a broken
   product.
2. **Open the web app** and sign in as the society admin. Leave the tab open; activity keeps the
   service awake.
3. **Open a second browser profile or an incognito window** and sign in there as the resident. You
   will switch between the two, and separate windows avoid signing in and out mid-demo.
4. **Open the gate app on your phone** at the same URL and sign in as the guard. Add it to the home
   screen if you want to show that it installs like an app.
5. **Have this page open** on a second screen or printed.

## 4. Running order

Twenty to twenty-five minutes. Adjust to what the committee cares about; most care about money
first and the gate second.

### Money, five minutes

Start here. It is the reason societies buy software.

- **Dashboard** (`/app`). Point at outstanding dues, collection this month, open complaints. Say that
  every tile respects the viewer's role.
- **Billing** (`/app/billing`). Open one invoice. Show the line items and that each line comes from a
  configurable charge head, not hard-coded logic.
- **Billing setup** (`/app/billing/setup`). Show the charge heads: fixed, per square foot, metered and formula. This
  answers "our maintenance is calculated per square foot, can it do that" before they ask.
- **Payments** (`/app/payments`). Show a receipt. Mention that online payments are verified on the server against the
  gateway signature, and that a resident marking something paid in the app cannot make it paid.
- **Reports** (`/app/reports`), then Billing vs collections. Show the chart, then export CSV. Committees like exports.

### The gate, five minutes

This is the part that gets people leaning forward. Use the phone.

- On your laptop as the **resident**, go to My Visitors and pre-approve a guest. A six digit passcode
  appears.
- On the **phone as the guard**, open Scan pass, type that passcode, and check the visitor in.
- Back on the laptop, the resident sees the visitor is inside. Say it arrived over a live connection,
  not a refresh.
- Show **Walk-in** on the phone: the guard registers someone unexpected, the resident gets an
  approve or deny request on their phone.
- Turn the phone's wifi off and log a visitor anyway. The app queues it and says so. Turn wifi back
  on and it syncs. Say plainly that it never pretends something succeeded while offline.

### Complaints and amenities, four minutes

- **Complaints** (`/app/complaints`). Open a ticket, show the timeline, assignment, and the SLA due time. Show
  Settings, then Workflows and SLA (`/app/settings/workflows`), so they can see that the escalation
  ladder is theirs to edit.
- **Amenities** (`/app/amenities`). Book the clubhouse as the resident. If the amenity has a fee, show that the booking
  stays unconfirmed until payment, and that two people cannot book the same slot.

### Community and governance, three minutes

- **Notices** (`/app/notices`). Publish one to a specific tower to show the audience picker. Mention buildings, units,
  roles or individuals.
- **Meetings** (`/app/meetings`) and **Voting** (`/app/voting`). Show an AGM with an agenda, minutes, and a resolution that went to a vote
  with one ballot per flat.

### Everything else, three minutes

Move quickly, just prove the breadth: Staff attendance, Assets with maintenance history, Contracts
with expiry reminders, Inventory, Security incidents, Emergency with the SOS button and the
click-to-call contact list.

### The resident's own view, two minutes

Switch to the resident window. My Bills, My Visitors, My Amenities, My Documents. The point to make:
residents see only their own flat, and that is enforced by the server, not just hidden in the
interface.

### Their own society, three minutes

Close with something concrete for them.

- Show **Settings → Data import**. Upload a small CSV of a few flats and walk through mapping,
  validation with per-row errors, and import. Say their existing Excel register can come in this way.
- Show **Settings → Roles** and change one permission, then show the affected menu item disappear.
  Nothing about roles is hard-coded.
- Show **Settings → Modules** and switch a module off to make the point that they pay for and see
  only what they use.

## 4b. Setting up a real society, end to end

This is the flow to follow when the committee says yes and you onboard them for real. It is also the
best thing to walk through on screen if they ask "how would we start?".

### Step 1: create the society

Two ways in.

- **The society signs itself up** at `/signup`. The form collects the society name, **type**, city and
  approximate unit count, then the admin's name, email and password, then the plan and billing cycle.
  The person who signs up becomes the society admin and chooses their own password there and then.
- **You create it for them** from the platform console at `/admin`, then invite their admin by email.

Society type is picked at this step and drives nothing structural, it is descriptive:
`APARTMENT`, `VILLA`, `TOWNSHIP`, `COOPERATIVE`, `RWA`, `GATED_COMMUNITY`, `MIXED`.

### Step 2: the onboarding wizard

The admin's first login lands on `/app/onboarding`, six steps: Society profile, Buildings, Billing,
Modules, Notifications, Finish. It can be revisited at any time; nothing is locked in.

### Step 3: structure, which is where apartment shape is decided

Create one **building** per physical block. The type is a label:
`TOWER`, `BUILDING`, `WING`, `BLOCK`, `PHASE`, `STREET`.

| Society shape | Buildings | Units |
|---|---|---|
| Apartment, several towers | one `TOWER` each: Tower A code `A`, Tower B code `B` | bulk create per tower |
| Single building with wings | one `WING` each: `A`, `B` | bulk create per wing |
| Villa or township | one `PHASE` or `STREET` per sector | create with type `VILLA` |
| Mixed use | towers plus one `BLOCK` for shops | unit type `SHOP` for the commercial ones |

Then **bulk create units** rather than adding them one at a time. You give a floor range, how many
units per floor, and a numbering pattern. Available tokens:

| Token | Meaning |
|---|---|
| `{building}` | the building code, for example `A` |
| `{floor}` | floor number |
| `{seq}` | position on the floor, 1, 2, 3 |
| `{seq2}` | the same, zero padded, 01, 02, 03 |
| `{number}` | the running count across the whole run |

The default `{floor}{seq2}` on floors 1 to 10 with 4 per floor gives 101, 102, 103, 104, 201 and so
on, forty units in one action. Every unit also gets a globally unique code of the form `A-101`, which
is what residents, vehicles and invoices are matched against later.

If they already keep a flat register in Excel, skip all of this and use
**Settings, then Data import, then Units**. Buildings are created automatically from the building
code column, and opening dues can come in on the same sheet.

### Step 4: residents, and who creates their password

Nobody can register themselves as a resident. There is no public resident signup, by design: you
cannot let a stranger claim flat A-101. But the admin never sets anyone's password either.

The real flow is an invitation:

1. The admin creates the resident record against a unit, with name, type (`OWNER`, `TENANT`,
   `FAMILY`), phone and email.
2. The system emails that person an invitation link, valid for a configurable number of days.
3. They open the link, set **their own** password, and land on the resident home at `/app/my`.

To avoid doing this one resident at a time, use **Settings, then Data import, then Residents**. The
sheet needs a unit code, name and type per row, with phone and email optional. Tick **"Create logins
and email invitations"** during the mapping step and every resident with an email address is invited
in one run. That is how you onboard two hundred flats in an afternoon.

A resident who does not want app access simply gets no email address on their record. They still
exist for billing and the gate.

For someone moving in later, there is a move-in request that an admin approves, rather than
self-registration.

### Step 5: staff and the gate

Guards and other staff are society **users**, not residents. Create them under
Settings, then Users, and give them the `SECURITY_GUARD` role. They land on `/guard` and cannot reach
billing, accounting, members or settings at all.

### Invitations need working email

An invitation is only useful if it reaches the person. Two settings decide that:

- With `EMAIL_DRIVER=console`, which is the default, nothing is sent. The message is written to the
  service log instead.
- In production the API also stops returning the invite link in its response, on purpose, so an
  admin cannot read other people's invitation tokens.

Together that means **invitations silently go nowhere until email is configured**.

**Render free instances block outbound SMTP.** Ports 25, 465 and 587 are all filtered, a change Render
made in September 2025 to curb spam. Port 25 is blocked on every plan. Because Gmail only listens on
465 and 587, **Gmail SMTP cannot work on a free Render service at all**, no matter what you put in the
variables. The handshake never completes and the job fails with `ETIMEDOUT` on `CONN`. The same
settings work from a laptop, which makes it look like a credentials problem when it is a network one.

Two ways out, both free and neither needing a card.

**Option 1, stay on SMTP using port 2525.** Render does not block 2525, and Brevo's relay accepts it.
No code change, only variables:

```
EMAIL_DRIVER=smtp
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=2525
SMTP_SECURE=false
SMTP_USER=<your Brevo SMTP login>
SMTP_PASS=<your Brevo SMTP key, not the API key>
EMAIL_FROM=Society ERP <your verified sender address>
```

`SMTP_SECURE=false` is correct here: 2525 starts in the clear and upgrades through STARTTLS, which the
transport now requires before it sends the credentials.

**Option 2, skip SMTP and use the HTTPS API.** Nothing on port 443 is ever blocked:

```
EMAIL_DRIVER=brevo
BREVO_API_KEY=<key from Brevo, Settings then SMTP & API>
EMAIL_FROM=Society ERP <your verified sender address>
```

Either way the sender address must be verified in Brevo first, and a plain Gmail address is fine for
that. The free tier is 300 emails a day with no time limit. Invite yourself before anyone else.

Paid Render instances do allow 465 and 587, so Gmail SMTP starts working the moment you upgrade.

**Then expect one more hurdle: `525 5.7.1 Unauthorized IP address` on `AUTH`.** That is not a wrong
password. It means the connection and the TLS upgrade both succeeded and Brevo refused the login
because its own IP allowlist is switched on and Render's address is not in it. New Brevo accounts
often have this enabled. Fix it one of two ways:

- **Whitelist Render's ranges.** On the API service in Render open **Connect** in the top right, switch
  to the **Outbound** tab, and copy the IP ranges. In Brevo go to **Settings, Security, Authorized
  IPs** and add them, one per line; CIDR notation is accepted. Only the API service needs this, since
  a static site makes no outbound connections. Note these are ranges Render shares between customers,
  so this narrows access rather than pinning it to you alone.
- **Or turn the restriction off.** In the same Brevo screen, under **Blocking unauthorized IP
  addresses**, find the row for SMTP keys and click **Deactivate**. Quicker, and reasonable for a demo.

A permanent authentication failure like this is retried three times and then dropped, so a
misconfiguration costs a few log lines rather than a stuck queue.

`SMTP_SECURE=true` is required for port 465. Use 587 with `SMTP_SECURE=false` if you prefer STARTTLS.
Verify by inviting yourself before you invite anyone else.

## 5. Free plan limits, and how to talk about them

Be straight about these. Committees respect it, and all three disappear on a paid plan.

- **The service sleeps after fifteen minutes idle** and takes about a minute to wake. While asleep no
  scheduled work runs, so invoice generation, reminders and SLA escalation pause. Say this is a trial
  environment, not the production setup.
- **Uploaded files disappear** on redeploy, because the free plan has no persistent disk. Documents
  and photos are for illustration only right now. Production uses S3 or an attached disk.
- **No email or WhatsApp is actually sent.** Both drivers are set to `console`, so messages are
  logged instead. Show the in-app notification bell instead of promising an email will arrive.
- **Payments are on the mock gateway.** Do not imply money moves. Say the Razorpay integration is
  built and each society enters its own credentials under Settings → Payments.

## 6. If something goes wrong

| Symptom | Cause | What to do |
|---|---|---|
| Page hangs on first load | Free instance waking | Wait a minute. Prevent it by step 3.1. |
| Login works, then everything errors | `CORS_ORIGINS` does not match the web URL | Fix it on the API service, exactly, no trailing slash |
| Refresh on an inner page gives 404 | Rewrite rule missing on the static site | Add `/*` to `/index.html`, type Rewrite |
| Home page 404 right after a deploy | Cached response from before the build | Add `?x=1` once, or wait for the cache to expire |
| No society after signing in | Demo seed has not been run | Run step 1 |
| Health shows `"database":"down"` | Atlas is refusing Render's IP | Atlas, Network Access, allow `0.0.0.0/0` |

To check the system from outside at any time:

```bash
curl https://society-erp-project-api.onrender.com/api/v1/health
```

`"status":"ok"` with `"database":"up"` means the backend is fine and anything you are seeing is a
frontend or configuration issue.

## 7. Questions that always come up

- **"Is our data mixed with other societies?"** No. Every record carries a society id, and the id
  comes from the signed login token, never from anything the browser sends. Tests assert that one
  society cannot read another's data.
- **"Can we change the maintenance formula ourselves?"** Yes, under Billing → Setup. Fixed, per
  square foot, metered and formula are all configurable per charge head.
- **"Can the guard see our dues?"** No. Guards have no access to billing, accounting, members or
  settings, and that is enforced at the API, not only hidden in the menu.
- **"What if the internet is down at the gate?"** The gate app queues entries on the device and syncs
  when the connection returns. It never shows an action as completed until the server confirms it.
- **"Can we import last year's data?"** Yes, units, residents, vehicles, staff, assets and stock,
  from CSV or Excel, with a dry run that reports problems per row before anything is written.
- **"What does it cost to run properly?"** Be honest that the demo is on a free tier. A small paid
  instance plus a managed database is the realistic starting point.
