import { onSnapshot, orderBy, query, setDoc, serverTimestamp, deleteDoc } from "../lib/fs.js";
import { invitesCol, inviteDoc, usersCol, userDoc } from "../lib/collections.js";
import { escapeHtml } from "../lib/format.js";
import { badge, toast } from "../lib/ui.js";
import { iconHtml } from "../lib/icons.js";
import { currentActor } from "../lib/auth.js";
import { updateWithAudit } from "../lib/crud.js";
import { addCleanup } from "../lib/router.js";

let invites = [];
let users = [];
let mountedContainer = null;

export function renderUsersPanel(container) {
  mountedContainer = container;
  const unsubInv = onSnapshot(query(invitesCol(), orderBy("invitedAt", "desc")), (snap) => { invites = snap.docs.map((d) => ({ id: d.id, ...d.data() })); paint(); });
  const unsubUsers = onSnapshot(usersCol(), (snap) => { users = snap.docs.map((d) => ({ uid: d.id, ...d.data() })); paint(); });
  [unsubInv, unsubUsers].forEach(addCleanup);
  paint();
}

function paint() {
  if (!mountedContainer) return;
  const actor = currentActor();
  mountedContainer.innerHTML = `
    <div class="card">
      <div class="card-header"><span class="card-title">Invite a family member</span></div>
      <div class="card-body">
        <div class="flex items-end gap-2" style="flex-wrap:wrap;">
          <div class="field" style="flex:1;min-width:200px;margin-bottom:0;"><label for="inv-email">Google account email</label><input class="input" id="inv-email" type="email" placeholder="name@gmail.com" /></div>
          <div class="field" style="margin-bottom:0;"><label for="inv-role">Role</label><select class="input" id="inv-role"><option value="member">Member</option><option value="admin">Admin</option></select></div>
          <button type="button" class="btn btn-primary" id="inv-send">${iconHtml("userPlus")}Invite</button>
        </div>
        <p class="text-xs text-concrete mt-2">They'll get access automatically the first time they sign in with this exact Google account.</p>
      </div>
    </div>

    ${invites.length > 0 ? `
      <div class="card mt-3">
        <div class="card-header"><span class="card-title">Pending invites</span></div>
        <div class="card-body flex-col gap-2">
          ${invites.map((inv) => `
            <div class="flex items-center justify-between text-sm">
              <span>${escapeHtml(inv.email)}</span>
              <div class="flex items-center gap-2">${badge(inv.role, "amber")}<button type="button" class="btn-icon" data-remove-invite="${inv.id}" aria-label="Cancel invite">${iconHtml("trash")}</button></div>
            </div>`).join("")}
        </div>
      </div>` : ""}

    <div class="card mt-3">
      <div class="card-header"><span class="card-title">Users</span></div>
      <div class="card-body flex-col gap-2">
        ${users.map((u) => `
          <div class="flex items-center justify-between text-sm">
            <div><p class="font-medium">${escapeHtml(u.displayName || u.email)}</p><p class="text-xs text-concrete">${escapeHtml(u.email)}</p></div>
            <div class="flex items-center gap-2">
              ${badge(u.role, u.role === "admin" ? "blueprint" : "neutral")}
              ${badge(u.isActive ? "Active" : "Disabled", u.isActive ? "green" : "rust")}
              ${actor && u.uid !== actor.uid ? `
                <button type="button" class="btn-icon" data-toggle-role="${u.uid}" data-role="${u.role}" aria-label="${u.role === "admin" ? "Remove admin from" : "Make admin"} ${escapeHtml(u.displayName || u.email)}" title="${u.role === "admin" ? "Remove admin (demote to member)" : "Make admin"}">${iconHtml(u.role === "admin" ? "shieldOff" : "shield")}</button>
                <button type="button" class="btn-icon" data-toggle-user="${u.uid}" data-active="${u.isActive}" aria-label="${u.isActive ? "Disable" : "Enable"} ${escapeHtml(u.displayName || u.email)}" title="${u.isActive ? "Disable — blocks sign-in without deleting their record" : "Re-enable"}">${iconHtml(u.isActive ? "eye" : "eyeOff")}</button>
              ` : `<span class="text-xs text-concrete" style="padding-left:4px;">(you)</span>`}
            </div>
          </div>`).join("")}
      </div>
    </div>
  `;

  mountedContainer.querySelector("#inv-send").addEventListener("click", async () => {
    const email = mountedContainer.querySelector("#inv-email").value.trim();
    const role = mountedContainer.querySelector("#inv-role").value;
    const a = currentActor();
    if (!email || !a) return;
    try {
      await setDoc(inviteDoc(email), { email: email.trim().toLowerCase(), role, invitedBy: a.uid, invitedAt: serverTimestamp() });
      toast("success", `Invited ${email}. Ask them to sign in with this Google account.`);
      mountedContainer.querySelector("#inv-email").value = "";
    } catch (err) {
      console.error(err);
      toast("error", "Couldn't send the invite.");
    }
  });

  mountedContainer.querySelectorAll("[data-remove-invite]").forEach((btn) =>
    btn.addEventListener("click", () => deleteDoc(inviteDoc(btn.getAttribute("data-remove-invite"))))
  );

  mountedContainer.querySelectorAll("[data-toggle-user]").forEach((btn) =>
    btn.addEventListener("click", async () => {
      const uid = btn.getAttribute("data-toggle-user");
      const isActive = btn.getAttribute("data-active") === "true";
      const a = currentActor();
      if (!a) return;
      try {
        await updateWithAudit(userDoc(uid), "user", { isActive }, { isActive: !isActive }, a);
        toast("success", isActive ? "User disabled" : "User re-enabled");
      } catch (err) {
        console.error(err);
        toast("error", "Couldn't update this user.");
      }
    })
  );

  mountedContainer.querySelectorAll("[data-toggle-role]").forEach((btn) =>
    btn.addEventListener("click", async () => {
      const uid = btn.getAttribute("data-toggle-role");
      const role = btn.getAttribute("data-role");
      const a = currentActor();
      if (!a) return;

      if (role === "admin") {
        const remainingAdmins = users.filter((u) => u.role === "admin" && u.uid !== uid).length;
        if (remainingAdmins === 0) {
          toast("error", "Can't remove the last remaining admin — promote someone else first.");
          return;
        }
        if (!window.confirm("Remove admin access from this person? They'll keep their account but won't be able to manage users, categories, or settings anymore.")) return;
      }

      const newRole = role === "admin" ? "member" : "admin";
      try {
        await updateWithAudit(userDoc(uid), "user", { role }, { role: newRole }, a);
        toast("success", newRole === "admin" ? "User is now an admin" : "Admin access removed");
      } catch (err) {
        console.error(err);
        toast("error", "Couldn't update this user's role.");
      }
    })
  );
}
