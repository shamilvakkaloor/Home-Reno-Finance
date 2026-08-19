import {
  getFirebaseAuth,
  googleProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut as fbSignOut,
  isFirebaseConfigured,
} from "./firebase.js";
import { getDoc, setDoc, deleteDoc, serverTimestamp } from "./fs.js";
import { userDoc, inviteDoc, bootstrapDoc } from "./collections.js";
import { createStore } from "./store.js";

// status: "loading" | "signed_out" | "unauthorized" | "authorized"
export const authStore = createStore({
  status: "loading",
  firebaseUser: null,
  appUser: null,
});

export function isAdmin() {
  return authStore.get().appUser?.role === "admin";
}

export function currentActor() {
  const u = authStore.get().appUser;
  return u ? { uid: u.uid, displayName: u.displayName || u.email } : null;
}

export function initAuth() {
  if (!isFirebaseConfigured()) {
    authStore.set({ status: "signed_out" });
    return;
  }
  const auth = getFirebaseAuth();
  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      authStore.set({ status: "signed_out", firebaseUser: null, appUser: null });
      return;
    }
    try {
      const ref = userDoc(user.uid);
      const snap = await getDoc(ref);
      if (!snap.exists()) {
        authStore.set({ status: "unauthorized", firebaseUser: user, appUser: null });
        return;
      }
      const data = snap.data();
      if (!data.isActive) {
        authStore.set({ status: "unauthorized", firebaseUser: user, appUser: null });
        return;
      }
      authStore.set({ status: "authorized", firebaseUser: user, appUser: { uid: user.uid, ...data } });
    } catch (err) {
      console.error("Failed to resolve user role", err);
      authStore.set({ status: "unauthorized", firebaseUser: user, appUser: null });
    }
  });
}

export async function signInWithGoogle() {
  const auth = getFirebaseAuth();
  const cred = await signInWithPopup(auth, googleProvider);
  const ref = userDoc(cred.user.uid);
  const snap = await getDoc(ref);
  if (snap.exists()) return;

  const email = (cred.user.email || "").trim().toLowerCase();
  const invRef = email ? inviteDoc(email) : null;
  const invSnap = invRef ? await getDoc(invRef) : null;

  if (invSnap?.exists()) {
    const invite = invSnap.data();
    await setDoc(ref, {
      email: cred.user.email || "",
      displayName: cred.user.displayName || "",
      photoURL: cred.user.photoURL || "",
      role: invite.role || "member",
      isActive: true,
      createdAt: serverTimestamp(),
    });
    await deleteDoc(invRef);
    return;
  }

  // First-ever sign-in for this project becomes admin automatically.
  const isFirst = await claimBootstrap();
  if (isFirst) {
    await setDoc(ref, {
      email: cred.user.email || "",
      displayName: cred.user.displayName || "Admin",
      photoURL: cred.user.photoURL || "",
      role: "admin",
      isActive: true,
      createdAt: serverTimestamp(),
    });
  }
}

async function claimBootstrap() {
  try {
    const ref = bootstrapDoc();
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, { claimed: true, claimedAt: serverTimestamp() });
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export async function logout() {
  await fbSignOut(getFirebaseAuth());
}

export { isFirebaseConfigured };
