# Setup guide

Everything below is done in a web browser. No terminal, no Node, no npm, no
credit card. Budget about 15 minutes for the first run.

---

## Part 1 — Create the Firebase project

### 1. Make the project

Go to <https://console.firebase.google.com> and sign in with the Google
account your family will use to manage this.

- **Add project** → name it (e.g. `home-reno-finance`) → Continue
- Google Analytics: **turn it off**. You don't need it and it adds a step.
- Create project → wait about 30 seconds → Continue

You stay on the free **Spark** plan for everything this app actually
uses — Firestore and Authentication. (Firebase Storage, used only for a
photo-attachment feature this build doesn't have a UI for yet, now requires
upgrading to Blaze — see the note in step 5. Skip it for now if you'd rather
not add a card.)

### 2. Turn on Firestore

- Left sidebar → **Build → Firestore Database** → Create database
- Location: pick the one closest to you (`asia-south1` for India,
  `europe-west1` for Europe). **This cannot be changed later.**
- Start in **production mode**. Rules get replaced in step 5 anyway.
- Enable

### 3. Turn on Authentication

- Left sidebar → **Build → Authentication** → Get started
- **Google** → toggle **Enable** → pick a support email → Save

This app signs everyone in with their own real Google account (Gmail) — no
separate passwords to manage.

### 4. Copy your config into `config.js`

- Click **Project Overview** in the left sidebar, then the **+ Add app**
  button just under your project name
- Choose the web icon `</>`
- App nickname: anything. Leave "Also set up Firebase Hosting" unticked —
  you're deploying elsewhere in Part 2 → **Register app**
- You now see a code block containing `const firebaseConfig = { … }`
- Copy the six values into `config.js` in this folder, replacing every
  `PASTE_…` placeholder.

Already registered an app and need the values again? **Project settings**
(gear icon) → scroll to **Your apps** → **SDK setup and configuration** →
**Config**.

Save the file. This is the only file you need to edit before deploying.

> These values are public. Anyone can read them by viewing your page source,
> and that's fine — they identify your project, they don't grant access to
> it. All access control lives in the rules you paste in the next step.

### 5. Paste the security rules

This step is what makes the app safe. Do not skip it.

- **Firestore Database → Rules** tab
- Delete everything in the editor
- Open `firestore.rules` from this folder, copy the whole file, paste it in
- **Publish**

Then, optionally, do the same for Storage (used for receipt/bill photo
attachments — a feature this build doesn't have a UI for yet, so most people
can skip this entirely and come back to it later):

- **Build → Storage → Get started**. Firebase will ask you to **upgrade to
  the Blaze (pay-as-you-go) plan** to enable Storage — Firestore and
  Authentication stay free without this, but Storage no longer does. Blaze
  requires a card on file but still has a generous free-usage allowance
  underneath it, so a small family app like this one shouldn't actually get
  billed — but it does mean adding a card.
  - **If you'd rather not add a card right now: skip this section.** Nothing
    else in the app depends on Storage. You can come back and do it later,
    whenever the attachment-upload feature actually gets built.
  - If you do upgrade: accept the default bucket → production mode → Done
- **Storage → Rules** tab → delete everything → paste in `storage.rules` from
  this folder → **Publish**

---

## Part 2 — Put the app online

Pick one. All are free and need no card. **Netlify Drop** is the fastest.

### Option A — Netlify Drop (fastest, about 60 seconds)

1. Go to <https://app.netlify.com/drop>
2. Drag this entire folder onto the page
3. You get a live URL immediately, like `random-name-123.netlify.app`

To update later (e.g. after editing `config.js`), just drag the folder again.
Create a free account if you want to keep the same URL and set a custom name.

### Option B — GitHub Pages

1. Create a free GitHub account and a new **public** repository
2. **Add file → Upload files**
3. **Important:** open this folder on your computer, select **everything
   inside it** — `index.html`, `config.js`, the `css` and `js` folders, and
   so on — and drag *those* in. Do **not** drag the outer folder itself.
4. Commit
5. **Settings → Pages** → Source: `Deploy from a branch` → Branch: `main`,
   folder `/ (root)` → Save
6. Wait a minute; your URL appears at the top of that page

**Getting a 404?** Open your repository page. You should see `index.html`
listed directly in the file list. If instead you see a single folder you
have to click into first, the files went in one level too deep — delete them
and re-upload following step 3 exactly.

### Option C — Cloudflare Pages

1. <https://pages.cloudflare.com> → Create a project → Direct Upload
2. Drag the folder → Deploy

### Testing on your own machine first

Opening `index.html` by double-clicking will **not** work — browsers block ES
modules loaded from `file://`. Use any of the three options above, or if you
happen to have Python installed, run `python3 -m http.server` in this folder
and open <http://localhost:8000>. (Skip this entirely if you'd rather just
deploy straight to Netlify Drop and test on the live URL — that's just as
fast and needs nothing installed.)

### 6. Add your deployed domain to Firebase

Back in Firebase: **Authentication → Settings → Authorized domains** → **Add
domain** → paste your Netlify/GitHub Pages/Cloudflare URL (just the domain,
e.g. `random-name-123.netlify.app`). Google Sign-In will fail on your live
site until you do this.

---

## Part 3 — First run

1. Open your live URL. It shows the sign-in screen.
2. Click **Sign in with Google** and choose the account you'll use as admin.
   **The very first Google account to ever sign in becomes admin
   automatically** — do this yourself first, before inviting family.
3. You're now signed in.

### Recommended configuration order

| # | Screen | What to do |
|---|---|---|
| 1 | Settings → Categories & sources | Click "Add starter categories & sources" for a ready-made set (Cement, Electrical, Labour Wages, etc., in English + Malayalam), or add your own |
| 2 | Accounts | Add your bank/cash accounts with opening balances |
| 3 | Settings → Users & access | Invite family members by their Gmail address |
| 4 | Budget | Set the total project budget and warning/critical thresholds |
| 5 | Transactions | Start logging money received, expenses, transfers |

### Inviting family members

**Settings → Users & access → Invite a family member** — enter their Gmail
address, pick Admin or Member, click Invite. The next time *they* sign in
with that exact Google account, they're let straight in with the role you
set. No password to hand over.

---

## Part 4 — Everyday questions

**Where do account balances come from?**
They're calculated live from every transaction (opening balance + money in −
money out) — never stored or edited directly. Delete a transaction and every
balance updates instantly; restore it and they update back. The Accounts and
Reports pages both show a reconciliation check that flags any drift, which by
construction should never actually happen.

**Someone made a mistake on an expense.**
Delete it (admin only) from the Transactions list and add a corrected one.
Deletes are soft — the record isn't gone, it's marked deleted and can be
restored from **Audit history**.

**How do I add a loan or pay one back?**
**Loans** page → Add loan (this also records the money landing in an
account). When it's time to repay, open the loan and click "Loan repayment".

**How do I track a bill I haven't fully paid yet?**
**Bills** page → Add bill with the total amount. Record partial or full
payments against it as you pay; status moves Unpaid → Partial → Paid
automatically.

**Can I see everything in Malayalam?**
Yes — the language toggle is in the top bar (desktop) — tap it to switch
between English and മലയാളം at any time. It remembers your choice per device.

**How do I back up my data?**
**Reports → Full backup (JSON)** downloads every collection as one file.
**Reports → CSV** exports the category summary; **Transactions → Export CSV**
exports the filtered transaction list.

**A family member says they're "not authorized".**
They haven't been invited yet, or their invite email doesn't exactly match
the Gmail account they signed in with. Check **Settings → Users & access**
for pending invites, and re-invite with the correct address if needed.

**I want to start over.**
Firebase console → Firestore Database → delete each collection's documents.
The app doesn't have a first-run reset screen (unlike some other setups) —
the very next person to sign in after all `users` documents are gone becomes
the new admin automatically.

---

## Part 5 — Staying inside the free tier

Firestore and Authentication (everything this app actually uses today) stay
on the free **Spark** plan: 50,000 document reads, 20,000 writes, and 20,000
deletes per day, 1 GiB stored. A small family renovation ledger — a handful
of accounts, a few hundred transactions over the life of the project, two or
three people checking the dashboard daily — uses a tiny fraction of that.
You're very unlikely to ever see a bill.

If you did upgrade to Blaze for Storage (Part 1, step 5), Blaze still has a
free allowance underneath the pay-as-you-go pricing, and photo attachments
for a project this size stay well within it — but note that Blaze, unlike
Spark, is billing-capable if usage ever did exceed the free allowance.

Check usage any time under Firestore → Usage (and Storage → Usage, if
enabled).

---

## Troubleshooting

**Blank page / "Firebase isn't configured yet" banner on the sign-in
screen.**
`config.js` still has placeholder (`PASTE_…`) values. Redo Part 1, step 4.

**"Missing or insufficient permissions" in the browser console.**
The security rules weren't pasted, or were pasted incompletely. Redo Part 1,
step 5, for Firestore (and for Storage too, if you enabled it).

**Google Sign-In popup closes immediately or shows an error.**
Your deployed domain isn't in Firebase's Authorized domains list yet. Redo
Part 2, step 6.

**"This Google account isn't authorized on this project yet."**
Expected the first time anyone other than the admin signs in. They need to
be invited from **Settings → Users & access** first — see Part 3.

**Nothing updates when someone else on the family adds a transaction.**
Check you're both online — the app works offline and queues changes, but
needs a connection to sync between devices. The offline banner at the top
tells you when you've lost connection.

**Charts aren't showing.**
Chart.js is loaded from a CDN (`cdn.jsdelivr.net`) inside `index.html`. If
your network blocks that domain (some corporate/school wifi does), charts
won't render, though the rest of the app works fine. Try a different
network, or self-host `chart.umd.min.js` and change the `<script src>` in
`index.html` to point at your own copy.
