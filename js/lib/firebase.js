// Firebase, loaded directly from Google's CDN as native ES modules.
// Nothing here needs `npm install` — the browser fetches these URLs itself.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged as _onAuthStateChanged,
  signInWithPopup,
  signOut as _signOut,
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-storage.js";
import { firebaseConfig } from "../../config.js";

export function isFirebaseConfigured() {
  return Boolean(firebaseConfig.apiKey && !firebaseConfig.apiKey.includes("PASTE_"));
}

let app, db, auth, storage;

export function getFirebaseApp() {
  if (!app) app = initializeApp(firebaseConfig);
  return app;
}

export function getDb() {
  if (!db) {
    db = initializeFirestore(getFirebaseApp(), {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
  }
  return db;
}

export function getFirebaseAuth() {
  if (!auth) auth = getAuth(getFirebaseApp());
  return auth;
}

export function getFirebaseStorage() {
  if (!storage) storage = getStorage(getFirebaseApp());
  return storage;
}

export const googleProvider = new GoogleAuthProvider();
export const onAuthStateChanged = _onAuthStateChanged;
export const signOut = _signOut;
export { signInWithPopup };
