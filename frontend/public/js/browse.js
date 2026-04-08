// ─── browse.js ───
// Browse page (students): real-time found items + claim workflow + notifications + My Reports.
//
// This file intentionally does NOT use any backend.
// Everything is driven by Firestore onSnapshot() listeners.

document.addEventListener("DOMContentLoaded", () => {
  const cfi = window.cfi;
  if (!cfi || !cfi.db || !cfi.auth) {
    console.error("CampusFoundIt not initialized.");
    return;
  }

  // ── UI refs ────────────────────────────────────────────────────────────────
  const grid = document.getElementById("browseItemsGrid");
  const searchInput = document.getElementById("searchInput");
  const statusFilter = document.getElementById("statusFilter");
  const categoryFilter = document.getElementById("categoryFilter");
  const locationFilter = document.getElementById("locationFilter");
  const resetFiltersBtn = document.getElementById("resetFiltersBtn");
  const chips = document.getElementById("activeFilterChips");

  const tabAllItems = document.getElementById("tabAllItems");
  const tabMyReports = document.getElementById("tabMyReports");

  // Notifications UI
  const notifBellBtn = document.getElementById("notifBellBtn");
  const notifBellBadge = document.getElementById("notifBellBadge");
  const notifDropdown = document.getElementById("notifDropdown");
  const notifList = document.getElementById("notifList");
  const notifMarkAllReadBtn = document.getElementById("notifMarkAllReadBtn");

  // Claim modal UI
  const claimModal = document.getElementById("claimModal");
  const claimModalBackdrop = document.getElementById("claimModalBackdrop");
  const claimModalCloseBtn = document.getElementById("claimModalCloseBtn");
  const claimForm = document.getElementById("claimForm");
  const claimFoundItemId = document.getElementById("claimFoundItemId");
  const claimItemTitle = document.getElementById("claimItemTitle");
  const claimItemSub = document.getElementById("claimItemSub");
  const claimStudentName = document.getElementById("claimStudentName");
  const claimStudentId = document.getElementById("claimStudentId");
  const claimContactPref = document.getElementById("claimContactPref");
  const claimVerificationDetail = document.getElementById("claimVerificationDetail");
  const claimSubmitBtn = document.getElementById("claimSubmitBtn");

  if (!grid) return;

  // ── State ─────────────────────────────────────────────────────────────────
  let activeTab = "all"; // "all" | "my"
  let foundItems = [];
  let myLost = [];
  let myFound = [];
  let myClaims = [];
  let notifications = [];

  let currentUser = null;
  let currentUserProfile = null;

  // ── Tab switching ─────────────────────────────────────────────────────────
  function setActiveTab(tab) {
    activeTab = tab;
    if (tab === "all") {
      tabAllItems.className = "py-2 rounded-lg font-bold text-sm bg-primary text-white";
      tabMyReports.className =
        "py-2 rounded-lg font-bold text-sm text-on-surface-variant hover:bg-white transition-colors";
    } else {
      tabMyReports.className = "py-2 rounded-lg font-bold text-sm bg-primary text-white";
      tabAllItems.className =
        "py-2 rounded-lg font-bold text-sm text-on-surface-variant hover:bg-white transition-colors";
    }
    render();
  }
  tabAllItems?.addEventListener("click", () => setActiveTab("all"));
  tabMyReports?.addEventListener("click", () => setActiveTab("my"));

  // ── Filters ───────────────────────────────────────────────────────────────
  const filters = {
    q: "",
    status: "all",
    category: "all",
    location: "all",
  };

  function bindFilters() {
    searchInput?.addEventListener("input", () => {
      filters.q = (searchInput.value || "").trim().toLowerCase();
      render();
    });
    statusFilter?.addEventListener("change", () => {
      filters.status = statusFilter.value;
      render();
    });
    categoryFilter?.addEventListener("change", () => {
      filters.category = categoryFilter.value;
      render();
    });
    locationFilter?.addEventListener("change", () => {
      filters.location = locationFilter.value;
      render();
    });
    resetFiltersBtn?.addEventListener("click", () => {
      filters.q = "";
      filters.status = "all";
      filters.category = "all";
      filters.location = "all";
      if (searchInput) searchInput.value = "";
      if (statusFilter) statusFilter.value = "all";
      if (categoryFilter) categoryFilter.value = "all";
      if (locationFilter) locationFilter.value = "all";
      render();
    });
  }
  bindFilters();

  // ── Notifications (real-time bell) ────────────────────────────────────────
  function openNotifDropdown(open) {
    if (!notifDropdown) return;
    notifDropdown.classList.toggle("hidden", !open);
  }
  notifBellBtn?.addEventListener("click", () => {
    const isOpen = notifDropdown && !notifDropdown.classList.contains("hidden");
    openNotifDropdown(!isOpen);
  });
  document.addEventListener("click", (e) => {
    // Close dropdown if clicking outside
    if (!notifDropdown || notifDropdown.classList.contains("hidden")) return;
    const wrap = document.getElementById("notifWrap");
    if (wrap && !wrap.contains(e.target)) openNotifDropdown(false);
  });

  notifMarkAllReadBtn?.addEventListener("click", async () => {
    if (!currentUser) return;
    const unread = notifications.filter((n) => !n.read);
    if (unread.length === 0) return;
    const batch = cfi.db.batch();
    unread.forEach((n) => batch.update(cfi.db.collection("notifications").doc(n.id), { read: true }));
    await batch.commit();
  });

  function renderNotifications() {
    if (!notifList || !notifBellBadge) return;
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
          if (!n.read) {
            await cfi.db.collection("notifications").doc(n.id).update({ read: true });
          }
        });
        notifList.appendChild(row);
      });
  }

  // ── Claim modal helpers ────────────────────────────────────────────────────
  function openClaimModal(foundItem) {
    if (!claimModal) return;
    claimFoundItemId.value = foundItem.id;
    claimItemTitle.textContent = foundItem.item_name || "Found item";
    claimItemSub.textContent = `${foundItem.category || "other"} • ${foundItem.location_found || "Unknown location"} • ${
      foundItem.date_found || "Unknown date"
    }`;

    // Prefill from profile
    claimStudentName.value = currentUserProfile?.name || currentUser?.displayName || "";
    claimStudentId.value = currentUserProfile?.studentId || "";
    claimContactPref.value = "email";
    claimVerificationDetail.value = "";

    claimModal.classList.remove("hidden");
  }
  function closeClaimModal() {
    claimModal?.classList.add("hidden");
  }
  claimModalBackdrop?.addEventListener("click", closeClaimModal);
  claimModalCloseBtn?.addEventListener("click", closeClaimModal);

  claimForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!currentUser) return;

    const foundId = claimFoundItemId.value;
    const provided = (claimVerificationDetail.value || "").trim();
    const studentName = (claimStudentName.value || "").trim();
    const studentId = (claimStudentId.value || "").trim();
    const contactPref = claimContactPref.value;

    if (!foundId || !provided || !studentName || !studentId) return;

    claimSubmitBtn.disabled = true;
    try {
      const found = foundItems.find((f) => f.id === foundId);
      if (!found) throw new Error("Item no longer exists.");
      if ((found.status || "unclaimed") !== "unclaimed") throw new Error("This item is not claimable now.");

      // Prevent duplicate pending claim requests by same user for same item
      const existing = myClaims.find((c) => c.found_item_id === foundId && c.status === "pending");
      if (existing) {
        closeClaimModal();
        return;
      }

      // 1) Create claim request
      const claimDoc = {
        found_item_id: foundId,
        found_owner_uid: found.owner_uid || null,
        claimant_uid: currentUser.uid,
        claimant_email: currentUser.email,
        claimant_studentId: studentId,
        claimant_name: studentName,
        claimant_contact_pref: contactPref,
        verification_detail_provided: provided,
        status: "pending",
        created_at: cfi.serverTimestamp(),
      };
      const claimRef = await cfi.db.collection("claim_requests").add(claimDoc);

      // 2) Notify the finder (owner of found item)
      if (found.owner_uid) {
        await cfi.db.collection("notifications").add({
          uid: found.owner_uid,
          message: `New claim request for "${found.item_name || "your item"}". Please wait for admin verification.`,
          read: false,
          created_at: cfi.serverTimestamp(),
          related_claim_request_id: claimRef.id,
        });
      }

      // 3) (Optional) notify claimant that request is submitted
      await cfi.db.collection("notifications").add({
        uid: currentUser.uid,
        message: `Claim request submitted for "${found.item_name || "item"}". Admin verification is pending.`,
        read: false,
        created_at: cfi.serverTimestamp(),
        related_claim_request_id: claimRef.id,
      });

      // 4) Link finder badge section is handled by their notifications listener
      closeClaimModal();
    } catch (err) {
      console.error("Claim submit error:", err);
      alert(err?.message || "Could not submit claim.");
    } finally {
      claimSubmitBtn.disabled = false;
    }
  });

  // ── Rendering ─────────────────────────────────────────────────────────────
  function applyFoundFilters(items) {
    let out = items.slice();

    // Status filter
    if (filters.status !== "all") {
      out = out.filter((it) => (it.status || "unclaimed") === filters.status);
    }

    // Category filter
    if (filters.category !== "all") {
      out = out.filter((it) => (it.category || "other") === filters.category);
    }

    // Location filter
    if (filters.location !== "all") {
      out = out.filter((it) => (it.location_found || "").toLowerCase() === filters.location);
    }

    // Search filter
    if (filters.q) {
      out = out.filter((it) => {
        const hay = `${it.item_name || ""} ${it.category || ""} ${it.location_found || ""}`.toLowerCase();
        return hay.includes(filters.q);
      });
    }

    // Sort newest first
    out.sort((a, b) => (b.created_at_ms || 0) - (a.created_at_ms || 0));
    return out;
  }

  function renderChips() {
    if (!chips) return;
    const chipData = [];
    if (filters.q) chipData.push({ key: "q", label: `Search: "${filters.q}"` });
    if (filters.status !== "all") chipData.push({ key: "status", label: `Status: ${filters.status}` });
    if (filters.category !== "all") chipData.push({ key: "category", label: `Category: ${filters.category}` });
    if (filters.location !== "all") chipData.push({ key: "location", label: `Location: ${filters.location}` });

    if (chipData.length === 0) {
      chips.classList.add("hidden");
      chips.innerHTML = "";
      return;
    }
    chips.classList.remove("hidden");
    chips.innerHTML = "";

    chipData.forEach((c) => {
      const el = document.createElement("button");
      el.type = "button";
      el.className =
        "bg-primary/10 text-primary px-3 py-1.5 rounded text-xs font-bold whitespace-nowrap flex items-center gap-1 border border-primary/20 hover:bg-primary/20 transition-colors";
      el.innerHTML = `${escapeHtml(c.label)} <span class="material-symbols-outlined text-[14px]">close</span>`;
      el.addEventListener("click", () => {
        if (c.key === "q") {
          filters.q = "";
          if (searchInput) searchInput.value = "";
        }
        if (c.key === "status") {
          filters.status = "all";
          if (statusFilter) statusFilter.value = "all";
        }
        if (c.key === "category") {
          filters.category = "all";
          if (categoryFilter) categoryFilter.value = "all";
        }
        if (c.key === "location") {
          filters.location = "all";
          if (locationFilter) locationFilter.value = "all";
        }
        render();
      });
      chips.appendChild(el);
    });
  }

  function render() {
    renderNotifications();
    renderChips();

    // Populate location dropdown from current items
    populateLocationOptions();

    if (activeTab === "my") {
      renderMyReports();
      return;
    }
    renderFoundGrid();
  }

  function renderFoundGrid() {
    const items = applyFoundFilters(foundItems);
    if (items.length === 0) {
      grid.innerHTML = `
        <div class="col-span-full text-center py-16 text-on-surface-variant">
          <span class="material-symbols-outlined text-4xl mb-2 block">inbox</span>
          <p class="text-sm font-semibold">No items match your filters.</p>
        </div>`;
      return;
    }

    grid.innerHTML = "";
    items.forEach((item) => grid.appendChild(renderFoundCard(item)));
  }

  function renderMyReports() {
    // Merge my lost + my found into a single timeline-ish list of cards
    const all = [
      ...myLost.map((x) => ({ ...x, _type: "lost" })),
      ...myFound.map((x) => ({ ...x, _type: "found" })),
    ].sort((a, b) => (b.created_at_ms || 0) - (a.created_at_ms || 0));

    if (all.length === 0) {
      grid.innerHTML = `
        <div class="col-span-full text-center py-16 text-on-surface-variant">
          <span class="material-symbols-outlined text-4xl mb-2 block">assignment</span>
          <p class="text-sm font-semibold">You haven't reported any items yet.</p>
        </div>`;
      return;
    }

    grid.innerHTML = "";
    all.forEach((item) => {
      const card = document.createElement("div");
      card.className = "bg-white rounded-2xl border border-outline-variant/20 shadow-sm overflow-hidden";

      const isLost = item._type === "lost";
      const title = item.item_name || item.name || "Item";
      const status = item.status || (isLost ? "open" : "unclaimed");
      const badge = statusBadge(status);
      const when = item.created_at ? formatTimeAgo(item.created_at) : "Recently";
      const location = isLost ? item.location_lost : item.location_found;
      const dateField = isLost ? item.date_lost : item.date_found;

      const timeline = buildTimelineLines(item);

      card.innerHTML = `
        <div class="p-5 flex items-start justify-between gap-4">
          <div>
            <p class="text-[10px] font-black uppercase tracking-widest ${isLost ? "text-primary" : "text-tertiary"}">
              ${isLost ? "Lost report" : "Found report"}
            </p>
            <h3 class="text-lg font-extrabold mt-1">${escapeHtml(title)}</h3>
            <p class="text-xs text-on-surface-variant mt-1">
              <span class="font-bold">${escapeHtml(location || "Unknown location")}</span> · ${escapeHtml(dateField || "Unknown date")} · ${escapeHtml(when)}
            </p>
          </div>
          <div>${badge}</div>
        </div>
        <div class="px-5 pb-5">
          <div class="bg-surface-container-low rounded-xl p-4 border border-outline-variant/20">
            <p class="text-xs font-black uppercase tracking-widest text-on-surface/60 mb-2">Timeline</p>
            <div class="space-y-2 text-sm">${timeline}</div>
          </div>
        </div>`;
      grid.appendChild(card);
    });
  }

  function renderFoundCard(item) {
    const card = document.createElement("div");
    card.className =
      "bg-white rounded-2xl shadow-sm border border-outline-variant/20 overflow-hidden group hover:shadow-lg transition-all duration-300 flex flex-col";

    const title = item.item_name || "Found item";
    const location = item.location_found || "Unknown location";
    const dateFound = item.date_found || "Unknown date";
    const created = item.created_at ? formatTimeAgo(item.created_at) : "Recently";
    const status = item.status || "unclaimed";

    const badge = statusBadge(status);
    const expiry = expiryBadge(item);

    const imgUrl = item.photo_path || "";
    const icon = getBrowseIcon(item.category || "other");
    const imageSection = imgUrl
      ? `<img alt="${escapeAttr(title)}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" src="${escapeAttr(imgUrl)}"
           onerror="this.style.display='none'; this.nextElementSibling.style.display='flex'"/>
         <div class="items-center justify-center h-full absolute inset-0" style="display:none">
           <span class="material-symbols-outlined text-6xl text-on-surface-variant/30">${icon}</span>
         </div>`
      : `<div class="flex items-center justify-center h-full">
           <span class="material-symbols-outlined text-6xl text-on-surface-variant/30 group-hover:scale-110 transition-transform duration-500">${icon}</span>
         </div>`;

    const canClaim = status === "unclaimed" && currentUser && currentUser.uid;
    const claimBtn = canClaim
      ? `<button data-claim-id="${escapeAttr(item.id)}" class="w-full mt-3 bg-primary text-white font-extrabold py-2.5 rounded-lg hover:bg-primary-container transition-colors text-xs uppercase tracking-widest">
           Claim This Item
         </button>`
      : "";

    card.innerHTML = `
      <div class="aspect-[4/3] bg-surface-container-high relative overflow-hidden">
        ${imageSection}
        <div class="absolute top-3 left-3 flex flex-col gap-1 items-start">
          ${badge}
          ${expiry}
        </div>
        <div class="absolute top-3 right-3">
          <span class="bg-white/90 backdrop-blur-sm text-on-surface text-[10px] font-bold px-2 py-1 rounded shadow-sm">${escapeHtml(created)}</span>
        </div>
      </div>
      <div class="p-5 flex-1 flex flex-col justify-between">
        <div>
          <h3 class="font-extrabold text-lg text-on-surface">${escapeHtml(title)}</h3>
          <p class="text-sm text-on-surface-variant flex items-center gap-1 mt-2">
            <span class="material-symbols-outlined text-[16px]">location_on</span> ${escapeHtml(location)}
          </p>
          <p class="text-xs text-on-surface-variant mt-2">Found on: <span class="font-bold">${escapeHtml(dateFound)}</span></p>
          ${claimBtn}
        </div>
      </div>`;

    // Bind claim button
    const btn = card.querySelector("[data-claim-id]");
    if (btn) {
      btn.addEventListener("click", () => openClaimModal(item));
    }
    return card;
  }

  function populateLocationOptions() {
    if (!locationFilter) return;
    const existing = new Set();
    Array.from(locationFilter.querySelectorAll("option"))
      .slice(1)
      .forEach((o) => existing.add(o.value));

    const locations = new Set(foundItems.map((x) => (x.location_found || "").trim().toLowerCase()).filter(Boolean));

    // Refresh options (keeping first "All Locations")
    locationFilter.innerHTML = `<option value="all">All Locations</option>`;
    Array.from(locations)
      .sort()
      .forEach((loc) => {
        const opt = document.createElement("option");
        opt.value = loc;
        opt.textContent = loc
          .split(" ")
          .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
          .join(" ");
        locationFilter.appendChild(opt);
      });
    // Keep user's selection if still valid
    if (filters.location !== "all") {
      const still = Array.from(locationFilter.options).some((o) => o.value === filters.location);
      if (still) locationFilter.value = filters.location;
      else {
        filters.location = "all";
        locationFilter.value = "all";
      }
    }
  }

  // ── Firestore listeners ───────────────────────────────────────────────────
  function tsToMs(ts) {
    if (!ts) return 0;
    if (ts.toMillis) return ts.toMillis();
    if (ts.toDate) return ts.toDate().getTime();
    const d = new Date(ts);
    return Number.isFinite(d.getTime()) ? d.getTime() : 0;
  }

  // Auth-driven listeners
  cfi.auth.onAuthStateChanged((user) => {
    currentUser = user;
    currentUserProfile = window.currentUserProfile || null;

    // Notifications listener (only when signed in)
    if (user) {
      cfi.db
        .collection("notifications")
        .where("uid", "==", user.uid)
        .orderBy("created_at", "desc")
        .onSnapshot((snap) => {
          notifications = [];
          snap.forEach((d) => {
            const data = d.data() || {};
            notifications.push({
              id: d.id,
              ...data,
              created_at_ms: tsToMs(data.created_at),
            });
          });
          renderNotifications();
        });

      // My claims listener
      cfi.db
        .collection("claim_requests")
        .where("claimant_uid", "==", user.uid)
        .orderBy("created_at", "desc")
        .onSnapshot((snap) => {
          myClaims = [];
          snap.forEach((d) => myClaims.push({ id: d.id, ...(d.data() || {}) }));
        });

      // My reports listeners
      cfi.db
        .collection("lost_items")
        .where("owner_uid", "==", user.uid)
        .orderBy("created_at", "desc")
        .onSnapshot((snap) => {
          myLost = [];
          snap.forEach((d) => {
            const data = d.data() || {};
          myLost.push({
            id: d.id,
            ...data,
            created_at_ms: tsToMs(data.created_at),
            matched_at_ms: tsToMs(data.matched_at),
            returned_at_ms: tsToMs(data.returned_at),
          });
          });
          render();
        });
      cfi.db
        .collection("found_items")
        .where("owner_uid", "==", user.uid)
        .orderBy("created_at", "desc")
        .onSnapshot((snap) => {
          myFound = [];
          snap.forEach((d) => {
            const data = d.data() || {};
          myFound.push({
            id: d.id,
            ...data,
            created_at_ms: tsToMs(data.created_at),
            matched_at_ms: tsToMs(data.matched_at),
            returned_at_ms: tsToMs(data.returned_at),
          });
          });
          render();
        });
    } else {
      notifications = [];
      myLost = [];
      myFound = [];
      myClaims = [];
      renderNotifications();
    }
  });

  // Public found items (browse)
  cfi.db
    .collection("found_items")
    .orderBy("created_at", "desc")
    .onSnapshot((snap) => {
      foundItems = [];
      snap.forEach((d) => {
        const data = d.data() || {};
        foundItems.push({ id: d.id, ...data, created_at_ms: tsToMs(data.created_at) });
      });
      render();
    });

  // ── Small UI helpers ──────────────────────────────────────────────────────
  function statusBadge(status) {
    const s = (status || "unclaimed").toLowerCase();
    if (s === "unclaimed") return `<span class="bg-green-600 text-white text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded shadow-sm">Unclaimed</span>`;
    if (s === "matched") return `<span class="bg-amber-500 text-white text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded shadow-sm">Matched</span>`;
    if (s === "returned") return `<span class="bg-zinc-600 text-white text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded shadow-sm">Returned</span>`;
    return `<span class="bg-zinc-600 text-white text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded shadow-sm">${escapeHtml(s)}</span>`;
  }

  function expiryBadge(item) {
    const status = (item.status || "unclaimed").toLowerCase();
    if (status !== "unclaimed") return "";
    const createdMs = item.created_at_ms || 0;
    if (!createdMs) return "";
    const days = Math.floor((Date.now() - createdMs) / 86400000);
    if (days >= 60) {
      return `<span class="bg-error text-white text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded shadow-sm">Expired</span>`;
    }
    if (days >= 30) {
      return `<span class="bg-orange-500 text-white text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded shadow-sm">Expiring Soon</span>`;
    }
    return "";
  }

  function buildTimelineLines(item) {
    const status = item?.status || "open";
    const s = (status || "open").toLowerCase();
    const lines = [];
    lines.push(
      `<div class="flex items-center gap-2"><span class="material-symbols-outlined text-[16px] text-primary">check_circle</span> Report submitted${item?.created_at_ms ? ` • ${escapeHtml(formatTimeAgo(item.created_at_ms))}` : ""}</div>`
    );
    if (s === "open" || s === "unclaimed") {
      lines.push(
        `<div class="flex items-center gap-2"><span class="material-symbols-outlined text-[16px] text-amber-500">hourglass_top</span> Waiting for match / claim</div>`
      );
    }
    if (s === "matched") {
      lines.push(
        `<div class="flex items-center gap-2"><span class="material-symbols-outlined text-[16px] text-amber-500">handshake</span> Matched by admin${
          item?.matched_at_ms ? ` • ${escapeHtml(formatTimeAgo(item.matched_at_ms))}` : ""
        }</div>`
      );
      lines.push(`<div class="flex items-center gap-2"><span class="material-symbols-outlined text-[16px] text-on-surface-variant">location_on</span> Collect from Admin Office</div>`);
    }
    if (s === "returned") {
      lines.push(
        `<div class="flex items-center gap-2"><span class="material-symbols-outlined text-[16px] text-green-700">task_alt</span> Returned successfully${
          item?.returned_at_ms ? ` • ${escapeHtml(formatTimeAgo(item.returned_at_ms))}` : ""
        }</div>`
      );
    }
    return lines.join("");
  }

  function getBrowseIcon(category) {
    const icons = {
      electronics: "laptop_mac",
      apparel: "checkroom",
      documents: "badge",
      stationary: "draw",
      other: "category",
    };
    return icons[category] || "inventory_2";
  }

  function formatTimeAgo(timestamp) {
    if (!timestamp) return "Recently";
    const ms = tsToMs(timestamp);
    if (!ms) return "Recently";
    const diffMs = Date.now() - ms;
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffDays <= 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays} days ago`;
    return new Date(ms).toLocaleDateString("en-IN", { month: "short", day: "numeric" });
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
});
