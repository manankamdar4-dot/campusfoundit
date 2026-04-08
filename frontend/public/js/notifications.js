// ─── notifications.js ───
// Shared notifications bell (real-time) for logged-in users.
//
// Usage:
// - Include this script AFTER `firebase-init.js` and `auth-guard.js`.
// - Add the following elements (IDs) in your navbar:
//   - notifBellBtn
//   - notifBellBadge
//   - notifDropdown
//   - notifList
//   - notifMarkAllReadBtn
//
// If a page doesn't include these elements, this script does nothing.

(function () {
  const cfi = window.cfi;
  if (!cfi || !cfi.db || !cfi.auth) return;

  const notifBellBtn = document.getElementById("notifBellBtn");
  const notifBellBadge = document.getElementById("notifBellBadge");
  const notifDropdown = document.getElementById("notifDropdown");
  const notifList = document.getElementById("notifList");
  const notifMarkAllReadBtn = document.getElementById("notifMarkAllReadBtn");
  const notifWrap = document.getElementById("notifWrap");

  if (!notifBellBtn || !notifBellBadge || !notifDropdown || !notifList || !notifMarkAllReadBtn) return;

  let notifications = [];

  function tsToMs(ts) {
    if (!ts) return 0;
    if (ts.toMillis) return ts.toMillis();
    if (ts.toDate) return ts.toDate().getTime();
    const d = new Date(ts);
    return Number.isFinite(d.getTime()) ? d.getTime() : 0;
  }

  function escapeHtml(str) {
    return String(str || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function formatTimeAgo(timestamp) {
    const ms = tsToMs(timestamp);
    if (!ms) return "Recently";
    const diffMs = Date.now() - ms;
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return "Just now";
    if (diffMin < 60) return `${diffMin} min ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr} hr ago`;
    const diffDays = Math.floor(diffHr / 24);
    if (diffDays < 7) return `${diffDays} days ago`;
    return new Date(ms).toLocaleDateString("en-IN", { month: "short", day: "numeric" });
  }

  function openDropdown(open) {
    notifDropdown.classList.toggle("hidden", !open);
  }

  notifBellBtn.addEventListener("click", () => {
    const isOpen = !notifDropdown.classList.contains("hidden");
    openDropdown(!isOpen);
  });

  document.addEventListener("click", (e) => {
    if (notifDropdown.classList.contains("hidden")) return;
    if (notifWrap && notifWrap.contains(e.target)) return;
    openDropdown(false);
  });

  notifMarkAllReadBtn.addEventListener("click", async () => {
    const user = cfi.auth.currentUser;
    if (!user) return;
    const unread = notifications.filter((n) => !n.read);
    if (unread.length === 0) return;
    const batch = cfi.db.batch();
    unread.forEach((n) => batch.update(cfi.db.collection("notifications").doc(n.id), { read: true }));
    await batch.commit();
  });

  function render() {
    const unreadCount = notifications.filter((n) => !n.read).length;
    if (unreadCount > 0) {
      notifBellBadge.classList.remove("hidden");
      notifBellBadge.textContent = unreadCount > 9 ? "9+" : String(unreadCount);
    } else {
      notifBellBadge.classList.add("hidden");
    }

    if (notifications.length === 0) {
      notifList.innerHTML = `<div class="p-4 text-sm text-on-surface-variant">No notifications yet.</div>`;
      return;
    }

    notifList.innerHTML = "";
    notifications
      .slice()
      .sort((a, b) => (b.created_at_ms || 0) - (a.created_at_ms || 0))
      .slice(0, 30)
      .forEach((n) => {
        const row = document.createElement("button");
        row.type = "button";
        row.className =
          "w-full text-left px-4 py-3 border-b border-outline-variant/10 hover:bg-surface-container-low transition-colors";
        row.innerHTML = `
          <div class="flex items-start gap-3">
            <div class="mt-0.5 w-2.5 h-2.5 rounded-full ${n.read ? "bg-transparent" : "bg-primary"}"></div>
            <div class="flex-1">
              <p class="text-sm font-semibold">${escapeHtml(n.message || "Notification")}</p>
              <p class="text-[11px] text-on-surface-variant mt-1">${formatTimeAgo(n.created_at)}</p>
            </div>
          </div>`;
        row.addEventListener("click", async () => {
          if (!n.read) await cfi.db.collection("notifications").doc(n.id).update({ read: true });
        });
        notifList.appendChild(row);
      });
  }

  cfi.auth.onAuthStateChanged((user) => {
    notifications = [];
    render();
    if (!user) return;

    cfi.db
      .collection("notifications")
      .where("uid", "==", user.uid)
      .orderBy("created_at", "desc")
      .onSnapshot((snap) => {
        notifications = [];
        snap.forEach((d) => {
          const data = d.data() || {};
          notifications.push({ id: d.id, ...data, created_at_ms: tsToMs(data.created_at) });
        });
        render();
      });
  });
})();

