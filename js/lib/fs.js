// Re-exports the Firestore functions the rest of the app needs, all from
// the same CDN module URL, so other files just `import { ... } from "./fs.js"`.
export {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  setDoc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  orderBy,
  where,
  serverTimestamp,
  Timestamp,
  writeBatch,
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";
