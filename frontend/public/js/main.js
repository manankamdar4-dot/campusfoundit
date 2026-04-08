// ─── main.js ───
// Homepage: Real-time stats + recent found items (NO backend).

document.addEventListener("DOMContentLoaded", () => {
  const elReported = document.getElementById("stat-reported");
  const elMatched = document.getElementById("stat-matched");
  const elReturned = document.getElementById("stat-returned");
  const elRecovery = document.getElementById("stat-recovery-rate");
  const bar = document.getElementById("stat-returned-bar");

  // Simple animated counters (good UX for live dashboards)
  let anim = {
    reported: 0,
    matched: 0,
    returned: 0,
    recovery: 0,
  };

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function animateNumber(element, from, to, durationMs = 650) {
    if (!element) return;
    const start = performance.now();
    const delta = to - from;

    function tick(now) {
      const t = clamp((now - start) / durationMs, 0, 1);
      // Ease-out so it feels smooth
      const eased = 1 - Math.pow(1 - t, 3);
      const value = from + delta * eased;
      element.textContent = String(Math.round(value));
      if (t < 1) requestAnimationFrame(tick);
    }

    requestAnimationFrame(tick);
  }

  function animatePercent(element, from, to, durationMs = 650) {
    if (!element) return;
    const start = performance.now();
    const delta = to - from;

    function tick(now) {
      const t = clamp((now - start) / durationMs, 0, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      const value = from + delta * eased;
      element.textContent = `${String(Math.round(value))}%`;
      if (t < 1) requestAnimationFrame(tick);
    }

    requestAnimationFrame(tick);
  }

  function updateAllStats(targets) {
    const reported = targets.reported;
    const matched = targets.matched;
    const returned = targets.returned;
    const recoveryRate = reported > 0 ? (returned / reported) * 100 : 0;

    animateNumber(elReported, anim.reported, reported);
    animateNumber(elMatched, anim.matched, matched);
    animateNumber(elReturned, anim.returned, returned);
    animatePercent(elRecovery, anim.recovery, recoveryRate);

    // Progress bar matches recovery %
    if (bar) bar.style.width = `${Math.round(recoveryRate)}%`;

    anim = {
      reported,
      matched,
      returned,
      recovery: recoveryRate,
    };
  }

  // ── Real-Time Stats (ON SNAPSHOT) ──
  // Items Reported: total lost reports (who filed "lost")
  window.db.collection("lost_items").onSnapshot((snapshot) => {
    const reported = snapshot.size;
    updateAllStats({
      reported,
      matched: anim.matched,
      returned: anim.returned,
    });
  });

  // Pairs Matched: found items that were matched (admin-approved)
  window.db.collection("found_items").where("status", "==", "matched").onSnapshot((snapshot) => {
    const matched = snapshot.size;
    updateAllStats({
      reported: anim.reported,
      matched,
      returned: anim.returned,
    });
  });

  // Items Returned: found items that are physically returned
  window.db.collection("found_items").where("status", "==", "returned").onSnapshot((snapshot) => {
    const returned = snapshot.size;
    updateAllStats({
      reported: anim.reported,
      matched: anim.matched,
      returned,
    });
  });

  // ── Real-Time Recent Found Items ──
  const container = document.getElementById("recent-items-container");
  if (!container) return;

  window.db
    .collection("found_items")
    .orderBy("created_at", "desc")
    .limit(4)
    .onSnapshot((snapshot) => {
      if (snapshot.empty) {
        container.innerHTML = `
          <div class="col-span-full text-center py-12 text-on-surface-variant">
            <span class="material-symbols-outlined text-4xl mb-2 block">inbox</span>
            <p class="text-sm font-semibold">No items found yet. Be the first to report!</p>
          </div>`;
        return;
      }

      container.innerHTML = "";
      snapshot.forEach((doc) => {
        const item = doc.data() || {};
        const name = item.item_name || item.name || "Unnamed Item";
        const location = item.location_found || item.location || "Unknown location";
        const imgUrl = item.photo_path || "img/stitch_asset_2.jpg";
        const dateStr = item.created_at ? formatDate(item.created_at) : "Recently";
        const status = (item.status || "unclaimed").toLowerCase();

        let statusBadge = "";
        if (status === "returned" || status === "matched") {
          statusBadge = `<span class="bg-green-600 text-white text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded shadow-sm">${status}</span>`;
        } else if (status === "unclaimed") {
          statusBadge = `<span class="bg-green-600 text-white text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded shadow-sm">Unclaimed</span>`;
        }

        const card = document.createElement("div");
        card.className = "group cursor-pointer";
        card.innerHTML = `
          <div class="aspect-square bg-surface-container-high rounded-lg overflow-hidden mb-4 relative">
            <img alt="${escapeHtml(name)}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" src="${escapeAttr(
              imgUrl
            )}" onerror="this.style.display='none'; this.parentElement.innerHTML='<div class=\\'flex items-center justify-center h-full\\'><span class=\\'material-symbols-outlined text-5xl text-neutral-300\\'>image</span></div>'"/>
            <div class="absolute top-3 left-3 flex flex-col gap-1 items-start">
              <span class="bg-white/90 backdrop-blur-sm text-[10px] font-bold px-2 py-1 rounded uppercase tracking-wider text-primary">Found: ${escapeHtml(
                dateStr
              )}</span>
              ${statusBadge}
            </div>
          </div>
          <h4 class="font-bold text-on-surface">${escapeHtml(name)}</h4>
          <p class="text-xs text-on-surface-variant mt-1">${escapeHtml(location)}</p>`;
        container.appendChild(card);
      });
    });
});

function formatDate(timestamp) {
  if (!timestamp) return "Recently";
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  const now = new Date();
  const diffMs = now - date;
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  return date.toLocaleDateString("en-IN", { month: "short", day: "numeric" });
}

function escapeHtml(str) {
  return String(str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(str) {
  return escapeHtml(str).replaceAll("\n", " ");
}
