// ─── firebase-init.js ───
// CampusFoundIt Firebase bootstrap (NO backend).
// This project uses Firebase Web SDK (compat CDN) so everything runs in the browser.
//
// IMPORTANT:
// - Keep all Firebase initialization in this one file.
// - Other scripts should use `window.cfi` (CampusFoundIt helpers) instead of touching `firebase` directly.
//
// Why compat?
// - Your HTML currently loads `firebase-*-compat.js` from the CDN, so we keep this consistent.

(function () {
  // ---- 1) Firebase project config ----
  // If you ever regenerate keys in Firebase console, update them here.
  const firebaseConfig = {
    apiKey: "AIzaSyAbIeGKWLZ9rYkuy1B2dRbtHx_9vgY3TtE",
    authDomain: "campusfoundit-3fdc8.firebaseapp.com",
    projectId: "campusfoundit-3fdc8",
    // NOTE:
    // Most Firebase Storage buckets look like "<projectId>.appspot.com".
    // Your current value is kept to avoid breaking an existing setup.
    storageBucket: "campusfoundit-3fdc8.firebasestorage.app",
    messagingSenderId: "406013828856",
    appId: "1:406013828856:web:3406aa49e99f6c6516250d",
  };

  // ---- 2) Hardcoded admin account (required by spec) ----
  // This is the ONLY email that can log in as Admin.
  // The password is not stored in code; it's entered in `login.html`.
  const ADMIN_EMAIL = "admin@campusfoundit.edu";

  // ---- 3) Initialize Firebase only once ----
  if (!window.firebase) {
    console.error("Firebase SDK not loaded. Check your <script> tags.");
    return;
  }

  try {
    // Prevent "Firebase App named '[DEFAULT]' already exists" if multiple pages/scripts load init.
    if (!firebase.apps || firebase.apps.length === 0) {
      firebase.initializeApp(firebaseConfig);
    }
  } catch (e) {
    console.error("Firebase initializeApp failed", e);
  }

  // ---- 4) Create service instances ----
  let db = null;
  let auth = null;
  let storage = null;

  try {
    db = firebase.firestore();
    // Firestore recommended settings (safe defaults).
    db.settings({ ignoreUndefinedProperties: true });
  } catch (e) {
    console.error("Firestore init failed", e);
  }

  try {
    auth = firebase.auth();
  } catch (e) {
    console.error("Auth init failed", e);
  }

  try {
    storage = firebase.storage();
  } catch (e) {
    console.error("Storage init failed", e);
  }

  // ---- 5) CampusFoundIt helper namespace ----
  // We expose a tiny, consistent API so all pages behave the same.
  const cfi = {
    // Raw services
    db,
    auth,
    storage,

    // Constants
    ADMIN_EMAIL,

    // Timestamps
    serverTimestamp: () => firebase.firestore.FieldValue.serverTimestamp(),

    // Basic collection refs (nice for autocomplete + consistency)
    col: {
      users: () => db.collection("users"),
      lost_items: () => db.collection("lost_items"),
      found_items: () => db.collection("found_items"),
      claim_requests: () => db.collection("claim_requests"),
      notifications: () => db.collection("notifications"),
    },

    // Safe helper: ensure the `users/{uid}` document exists.
    // On first login/sign-up, we create a profile doc with role=student.
    ensureUserDoc: async (user) => {
      if (!db || !user) return { role: null, doc: null };

      const ref = db.collection("users").doc(user.uid);
      const snap = await ref.get();

      if (!snap.exists) {
        const profile = {
          name: user.displayName || "Student",
          email: user.email || null,
          // Never auto-create admins. Admin accounts are provisioned intentionally.
          role: "student",
          created_at: firebase.firestore.FieldValue.serverTimestamp(),
        };
        await ref.set(profile, { merge: true });
        return { role: "student", doc: profile };
      }

      const data = snap.data() || {};
      return { role: data.role || "student", doc: data };
    },
  };

  // Backwards-compatible globals (your existing code uses these)
  window.db = db;
  window.auth = auth;
  window.storage = storage;

  // Preferred global
  window.cfi = cfi;
})();
