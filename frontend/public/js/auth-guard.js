// ─── auth-guard.js ───
// Runs on every page that should react to login state.
//
// Responsibilities:
// - Redirect unauthenticated users away from protected pages
// - Ensure `users/{uid}` document exists after sign-up/login (auto-create for students)
// - Enforce role-based routing: students -> `browse.html`, admins -> `admin.html`
// - Update basic navbar UI (name, logout, role-based links)
//
// Pages load order should be:
// 1) Firebase SDK scripts
// 2) `js/firebase-init.js`
// 3) `js/auth-guard.js`
// 4) page-specific JS

(function () {
  const cfi = window.cfi;
  if (!cfi || !cfi.auth || !cfi.db) {
    console.error("CampusFoundIt not initialized. Ensure firebase-init.js loads first.");
    return;
  }

  // Current page filename (e.g. "browse.html")
  const currentPage = (window.location.pathname.split("/").pop() || "index.html").toLowerCase();

  // Which pages require login?
  // (Home `index.html` can be public, but still shows user UI if logged in.)
  const authRequiredPages = new Set([
    "browse.html",
    "report-lost.html",
    "report-found.html",
    "admin.html",
    "setup-demo.html",
    "success.html",
  ]);

  // Which pages are restricted by role?
  const adminOnlyPages = new Set(["admin.html", "setup-demo.html"]);
  const studentOnlyPages = new Set(["report-lost.html", "report-found.html", "browse.html"]);

  // Cache: avoids repeated Firestore reads on nav changes within the same page.
  let didHandleFirstAuthState = false;

  cfi.auth.onAuthStateChanged(async (user) => {
    try {
      // 1) Not logged in
      if (!user) {
        window.currentUser = null;
        window.userRole = null;

        if (authRequiredPages.has(currentPage)) {
          // Preserve where user wanted to go.
          const next = encodeURIComponent(currentPage);
          window.location.replace(`login.html?next=${next}`);
          return;
        }

        updateAuthUI(null, null);
        return;
      }

      // 2) Logged in: ensure profile doc exists, then read role
      const { role, doc } = await cfi.ensureUserDoc(user);
      window.currentUser = user;
      window.userRole = role;
      window.currentUserProfile = doc;

      // 3) Enforce hardcoded admin account email
      // If somebody logs in with a non-admin email but has role=admin (misconfigured),
      // we treat them as student to avoid privilege escalation.
      let effectiveRole = role;
      if (role === "admin" && (user.email || "").toLowerCase() !== cfi.ADMIN_EMAIL.toLowerCase()) {
        effectiveRole = "student";
      }
      window.userRole = effectiveRole;

      // 4) Enforce page access by role
      if (adminOnlyPages.has(currentPage) && effectiveRole !== "admin") {
        window.location.replace("browse.html");
        return;
      }
      if (studentOnlyPages.has(currentPage) && effectiveRole === "admin") {
        window.location.replace("admin.html");
        return;
      }

      // 5) If user is on login page, redirect them to the right dashboard
      if (currentPage === "login.html" && !didHandleFirstAuthState) {
        didHandleFirstAuthState = true;
        window.location.replace(effectiveRole === "admin" ? "admin.html" : "browse.html");
        return;
      }

      // 6) Update UI
      updateAuthUI(user, effectiveRole);
    } catch (err) {
      console.error("Auth guard error:", err);
      // Fail safe: if auth is required, go to login
      if (authRequiredPages.has(currentPage)) {
        window.location.replace("login.html");
      } else {
        updateAuthUI(cfi.auth.currentUser || null, window.userRole || null);
      }
    }
  });

  function updateAuthUI(user, role) {
    // ---- Navbar name ----
    const userNameEl = document.getElementById("authUserName");
    if (userNameEl) {
      if (!user) userNameEl.textContent = "";
      else userNameEl.textContent = user.displayName || user.email || "Signed in";
    }

    // ---- Logout button ----
    const logoutBtn = document.getElementById("authLogoutBtn");
    if (logoutBtn) {
      logoutBtn.style.display = user ? "inline-flex" : "none";
      // Avoid duplicate listeners
      if (!logoutBtn.dataset.bound) {
        logoutBtn.dataset.bound = "1";
        logoutBtn.addEventListener("click", async () => {
          try {
            await cfi.auth.signOut();
          } finally {
            window.location.replace("login.html");
          }
        });
      }
    }

    // ---- Role-based link visibility ----
    // Any element with `data-auth-role="admin"` should only appear for admins.
    // Any element with `data-auth-role="student"` should only appear for students.
    document.querySelectorAll("[data-auth-role='admin']").forEach((el) => {
      el.style.display = role === "admin" ? "" : "none";
    });
    document.querySelectorAll("[data-auth-role='student']").forEach((el) => {
      el.style.display = role === "admin" ? "none" : "";
    });

    // ---- Remove the loading overlay ----
    const loadingScreen = document.getElementById("authLoadingScreen");
    if (loadingScreen) {
      loadingScreen.style.opacity = "0";
      setTimeout(() => loadingScreen.remove(), 400);
    }
  }
})();
