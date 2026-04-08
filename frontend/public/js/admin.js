// ─── admin.js ───
// CampusFoundIt Admin Dashboard (serverless, real-time).
//
// Features:
// - 5 tabs (Overview, Lost, Found, Claim Requests, Resolved)
// - Everything updates live via onSnapshot()
// - Claim workflow: approve/reject + mark returned
//
// NOTE:
// - "hidden_detail" is stored in `lost_item_secrets/{lostId}` (admin-only).
// - Anonymous finder identity is stored in `found_item_secrets/{foundId}` (admin-only).

document.addEventListener("DOMContentLoaded", () => {
  const cfi = window.cfi;
  if (!cfi || !cfi.db || !cfi.auth) {
    console.error("CampusFoundIt not initialized.");
    return;
  }

  // ── Tab UI ────────────────────────────────────────────────────────────────
  const tabs = {
    overview: document.getElementById("adminTabOverview"),
    lost: document.getElementById("adminTabLost"),
    found: document.getElementById("adminTabFound"),
    claims: document.getElementById("adminTabClaims"),
    resolved: document.getElementById("adminTabResolved"),
  };
  const panels = {
    overview: document.getElementById("adminPanelOverview"),
    lost: document.getElementById("adminPanelLost"),
    found: document.getElementById("adminPanelFound"),
    claims: document.getElementById("adminPanelClaims"),
    resolved: document.getElementById("adminPanelResolved"),
  };

  function setTab(activeKey) {
    Object.entries(tabs).forEach(([k, el]) => {
      if (!el) return;
      el.className =
        k === activeKey
          ? "px-4 py-2 rounded-lg font-extrabold text-sm bg-primary text-white"
          : "px-4 py-2 rounded-lg font-extrabold text-sm text-on-surface-variant hover:bg-white transition-colors";
    });
    Object.entries(panels).forEach(([k, el]) => {
      if (!el) return;
      el.classList.toggle("hidden", k !== activeKey);
    });
  }
  tabs.overview?.addEventListener("click", () => setTab("overview"));
  tabs.lost?.addEventListener("click", () => setTab("lost"));
  tabs.found?.addEventListener("click", () => setTab("found"));
  tabs.claims?.addEventListener("click", () => setTab("claims"));
  tabs.resolved?.addEventListener("click", () => setTab("resolved"));

  // ── KPI refs ──────────────────────────────────────────────────────────────
  const kpiTotalLost = document.getElementById("kpiTotalLost");
  const kpiTotalFound = document.getElementById("kpiTotalFound");
  const kpiPendingClaims = document.getElementById("kpiPendingClaims");
  const kpiReturnedMonth = document.getElementById("kpiReturnedMonth");
  const kpiRecoveryRate = document.getElementById("kpiRecoveryRate");
  const adminRecentActivity = document.getElementById("adminRecentActivity");

  const lostBody = document.getElementById("adminLostTableBody");
  const foundBody = document.getElementById("adminFoundTableBody");
  const claimsList = document.getElementById("adminClaimsList");
  const resolvedList = document.getElementById("adminResolvedList");
  const migrateBtn = document.getElementById("adminMigrateSecretsBtn");

  // ── State caches (kept updated via onSnapshot) ────────────────────────────
  let lostItems = []; // public docs
  let foundItems = []; // public docs
  let claimRequests = []; // all
  let lostSecretsById = new Map(); // lostId -> { hidden_detail }
  let foundSecretsById = new Map(); // foundId -> { finder_name, finder_email }

  function tsToMs(ts) {
    if (!ts) return 0;
    if (ts.toMillis) return ts.toMillis();
    if (ts.toDate) return ts.toDate().getTime();
    const d = new Date(ts);
    return Number.isFinite(d.getTime()) ? d.getTime() : 0;
  }

  // ── Firestore listeners (REAL-TIME) ───────────────────────────────────────
  cfi.db
    .collection("lost_items")
    .orderBy("created_at", "desc")
    .onSnapshot((snap) => {
      lostItems = [];
      snap.forEach((d) => {
        const data = d.data() || {};
        lostItems.push({
          id: d.id,
          ...data,
          created_at_ms: tsToMs(data.created_at),
          matched_at_ms: tsToMs(data.matched_at),
          returned_at_ms: tsToMs(data.returned_at),
        });
      });
      renderAll();
    });

  cfi.db
    .collection("found_items")
    .orderBy("created_at", "desc")
    .onSnapshot((snap) => {
      foundItems = [];
      snap.forEach((d) => {
        const data = d.data() || {};
        foundItems.push({
          id: d.id,
          ...data,
          created_at_ms: tsToMs(data.created_at),
          matched_at_ms: tsToMs(data.matched_at),
          returned_at_ms: tsToMs(data.returned_at),
        });
      });
      renderAll();
    });

  cfi.db
    .collection("claim_requests")
    .orderBy("created_at", "desc")
    .onSnapshot((snap) => {
      claimRequests = [];
      snap.forEach((d) => claimRequests.push({ id: d.id, ...(d.data() || {}) }));
      renderAll();
    });

  // Secrets (admin-only)
  cfi.db.collection("lost_item_secrets").onSnapshot((snap) => {
    lostSecretsById = new Map();
    snap.forEach((d) => lostSecretsById.set(d.id, d.data() || {}));
    renderAll();
  });
  cfi.db.collection("found_item_secrets").onSnapshot((snap) => {
    foundSecretsById = new Map();
    snap.forEach((d) => foundSecretsById.set(d.id, d.data() || {}));
    renderAll();
  });

  // ── Renderers ─────────────────────────────────────────────────────────────
  function renderAll() {
    renderKPIs();
    renderRecentActivity();
    renderLostTable();
    renderFoundTable();
    renderClaims();
    renderResolved();
  }

  function renderKPIs() {
    if (kpiTotalLost) kpiTotalLost.textContent = String(lostItems.length);
    if (kpiTotalFound) kpiTotalFound.textContent = String(foundItems.length);
    const pending = claimRequests.filter((c) => c.status === "pending").length;
    if (kpiPendingClaims) kpiPendingClaims.textContent = String(pending);

    // Returned this month (based on found_items status=returned + returned_at timestamp)
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const returnedThisMonth = foundItems.filter(
      (f) => (f.status || "") === "returned" && (f.returned_at_ms || 0) >= monthStart
    ).length;
    if (kpiReturnedMonth) kpiReturnedMonth.textContent = String(returnedThisMonth);

    // Overall recovery rate = returned items / total lost reports
    const totalLost = lostItems.length || 0;
    const totalReturned = foundItems.filter((f) => (f.status || "") === "returned").length;
    const rate = totalLost > 0 ? Math.round((totalReturned / totalLost) * 100) : 0;
    if (kpiRecoveryRate) kpiRecoveryRate.textContent = `${rate}%`;
  }

  function renderRecentActivity() {
    if (!adminRecentActivity) return;
    const combined = [
      ...lostItems.map((x) => ({ ...x, _type: "lost" })),
      ...foundItems.map((x) => ({ ...x, _type: "found" })),
    ].sort((a, b) => (b.created_at_ms || 0) - (a.created_at_ms || 0));

    const top = combined.slice(0, 10);
    if (top.length === 0) {
      adminRecentActivity.innerHTML = `<div class="p-6 text-sm text-on-surface-variant">No activity yet.</div>`;
      return;
    }
    adminRecentActivity.innerHTML = "";
    top.forEach((it) => {
      const row = document.createElement("div");
      row.className = "px-6 py-4 flex items-start justify-between gap-4";
      const title = it.item_name || it.name || "Item";
      const typeLabel = it._type === "lost" ? "Lost report" : "Found report";
      const status = it.status || (it._type === "lost" ? "open" : "unclaimed");
      row.innerHTML = `
        <div>
          <p class="text-[10px] font-black uppercase tracking-widest ${it._type === "lost" ? "text-primary" : "text-tertiary"}">${typeLabel}</p>
          <p class="text-sm font-extrabold mt-1">${escapeHtml(title)}</p>
          <p class="text-xs text-on-surface-variant mt-1">${escapeHtml(formatDateTiny(it.created_at_ms))}</p>
        </div>
        <div>${statusBadge(status)}</div>`;
      adminRecentActivity.appendChild(row);
    });
  }

  function renderLostTable() {
    if (!lostBody) return;
    lostBody.innerHTML = "";
    lostItems.forEach((it) => {
      const tr = document.createElement("tr");
      const secret = lostSecretsById.get(it.id);
      const hidden = secret?.hidden_detail ? secret.hidden_detail : "(not migrated yet)";
      tr.innerHTML = `
        <td class="px-4 py-3 font-semibold">${escapeHtml(it.name || "Student")}</td>
        <td class="px-4 py-3 text-on-surface-variant">${escapeHtml(it.email || "")}</td>
        <td class="px-4 py-3 font-semibold">${escapeHtml(it.item_name || "")}</td>
        <td class="px-4 py-3 text-on-surface-variant">${escapeHtml(it.category || "")}</td>
        <td class="px-4 py-3 text-on-surface-variant">${escapeHtml(it.location_lost || "")}</td>
        <td class="px-4 py-3 text-on-surface-variant">${escapeHtml(it.date_lost || "")}</td>
        <td class="px-4 py-3">${statusBadge(it.status || "open")}</td>
        <td class="px-4 py-3 text-on-surface-variant">${escapeHtml(hidden)}</td>
        <td class="px-4 py-3 text-on-surface-variant">—</td>
      `;
      lostBody.appendChild(tr);
    });
  }

  function renderFoundTable() {
    if (!foundBody) return;
    foundBody.innerHTML = "";
    foundItems.forEach((it) => {
      const tr = document.createElement("tr");
      const secret = foundSecretsById.get(it.id);
      const finderName = it.is_anonymous ? secret?.finder_name || "Anonymous (not migrated)" : it.name || "";
      const finderEmail = it.is_anonymous ? secret?.finder_email || "Hidden" : it.email || "";
      const photo = it.photo_path
        ? `<a href="${escapeAttr(it.photo_path)}" target="_blank" rel="noreferrer">
             <img src="${escapeAttr(it.photo_path)}" alt="Photo" class="w-10 h-10 object-cover rounded border border-outline-variant/20" onerror="this.style.display='none'"/>
           </a>`
        : `<span class="text-on-surface-variant">—</span>`;
      tr.innerHTML = `
        <td class="px-4 py-3 font-semibold">${escapeHtml(finderName)}</td>
        <td class="px-4 py-3 text-on-surface-variant">${escapeHtml(finderEmail)}</td>
        <td class="px-4 py-3 font-semibold">${escapeHtml(it.item_name || "")}</td>
        <td class="px-4 py-3 text-on-surface-variant">${escapeHtml(it.category || "")}</td>
        <td class="px-4 py-3 text-on-surface-variant">${escapeHtml(it.location_found || "")}</td>
        <td class="px-4 py-3 text-on-surface-variant">${escapeHtml(it.date_found || "")}</td>
        <td class="px-4 py-3">${photo}</td>
        <td class="px-4 py-3">${statusBadge(it.status || "unclaimed")}</td>
        <td class="px-4 py-3">
          ${
            (it.status || "") === "matched"
              ? `<button class="px-3 py-2 rounded-lg bg-primary text-white text-xs font-extrabold uppercase tracking-widest hover:bg-primary-container transition-colors" data-return="${escapeAttr(
                  it.id
                )}">Mark Returned</button>`
              : `<span class="text-on-surface-variant">—</span>`
          }
        </td>
      `;
      foundBody.appendChild(tr);

      const btn = tr.querySelector(`[data-return="${cssEscape(it.id)}"]`);
      btn?.addEventListener("click", async () => markReturned(it));
    });
  }

  function renderClaims() {
    if (!claimsList) return;
    const pending = claimRequests.filter((c) => c.status === "pending");
    if (pending.length === 0) {
      claimsList.innerHTML = `<div class="col-span-full bg-white rounded-xl border border-outline-variant/20 p-6 text-sm text-on-surface-variant">No pending claim requests.</div>`;
      return;
    }

    claimsList.innerHTML = "";
    pending.forEach((c) => {
      const found = foundItems.find((f) => f.id === c.found_item_id);
      const foundStatus = (found?.status || "unclaimed").toLowerCase();
      const claimantLostOpen = lostItems.filter((l) => l.owner_uid === c.claimant_uid && (l.status || "open") === "open");

      const card = document.createElement("div");
      card.className = "bg-white rounded-2xl border border-outline-variant/20 shadow-sm overflow-hidden";

      const foundTitle = found?.item_name || "Found item (missing)";
      const foundMeta = found ? `${found.category || ""} • ${found.location_found || ""} • ${found.date_found || ""}` : "";

      const optionsHtml =
        claimantLostOpen.length === 0
          ? `<option value="">No open lost report for this claimant</option>`
          : claimantLostOpen
              .map((l) => `<option value="${escapeAttr(l.id)}">${escapeHtml(l.item_name || "Lost item")} — ${escapeHtml(l.date_lost || "")}</option>`)
              .join("");

      card.innerHTML = `
        <div class="p-5 border-b border-outline-variant/10 bg-surface-container-low">
          <p class="text-xs font-black uppercase tracking-widest text-primary/60">Pending claim</p>
          <h3 class="text-lg font-extrabold mt-1">${escapeHtml(foundTitle)}</h3>
          <p class="text-xs text-on-surface-variant mt-1">${escapeHtml(foundMeta)}</p>
        </div>
        <div class="p-5 grid grid-cols-1 gap-4">
          <div class="bg-white rounded-xl border border-outline-variant/20 p-4">
            <p class="text-xs font-black uppercase tracking-widest text-on-surface/60 mb-2">Claimant</p>
            <p class="text-sm font-extrabold">${escapeHtml(c.claimant_name || "Student")}</p>
            <p class="text-xs text-on-surface-variant mt-1">${escapeHtml(c.claimant_email || "")} • ${escapeHtml(c.claimant_studentId || "")}</p>
          </div>

          <div class="bg-white rounded-xl border border-outline-variant/20 p-4">
            <p class="text-xs font-black uppercase tracking-widest text-on-surface/60 mb-2">Verification provided</p>
            <p class="text-sm font-semibold whitespace-pre-wrap">${escapeHtml(c.verification_detail_provided || "")}</p>
          </div>

          <div class="bg-white rounded-xl border border-outline-variant/20 p-4">
            <p class="text-xs font-black uppercase tracking-widest text-on-surface/60 mb-2">Compare against lost report</p>
            <select class="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-lg px-3 py-2 text-sm font-semibold" data-lost-select="${escapeAttr(c.id)}">
              ${optionsHtml}
            </select>
            <div class="mt-3 text-xs text-on-surface-variant" data-expected-wrap="${escapeAttr(c.id)}"></div>
          </div>

          <div class="grid grid-cols-2 gap-3">
            ${
              foundStatus === "matched"
                ? `<button class="bg-zinc-600 text-white font-extrabold py-3 rounded-lg hover:bg-zinc-700 transition-colors uppercase tracking-widest text-xs" data-return="${escapeAttr(
                    c.id
                  )}">
                     Mark as Returned
                   </button>
                   <button class="bg-surface-container text-on-surface font-extrabold py-3 rounded-lg opacity-60 cursor-not-allowed uppercase tracking-widest text-xs" disabled type="button">
                     Approved (waiting return)
                   </button>`
                : `<button class="bg-primary text-white font-extrabold py-3 rounded-lg hover:bg-primary-container transition-colors uppercase tracking-widest text-xs" data-approve="${escapeAttr(
                    c.id
                  )}">
                     Approve Claim
                   </button>
                   <button class="bg-surface-container text-on-surface font-extrabold py-3 rounded-lg hover:bg-surface-container-high transition-colors uppercase tracking-widest text-xs" data-reject="${escapeAttr(
                    c.id
                  )}">
                     Reject Claim
                   </button>`
            }
          </div>
        </div>
      `;

      claimsList.appendChild(card);

      // Bind select -> show expected hidden detail
      const sel = card.querySelector(`[data-lost-select="${cssEscape(c.id)}"]`);
      const expectedWrap = card.querySelector(`[data-expected-wrap="${cssEscape(c.id)}"]`);
      const renderExpected = () => {
        const lostId = sel?.value;
        if (!lostId) {
          if (expectedWrap) expectedWrap.textContent = "Expected: (select a lost report)";
          return;
        }
        const secret = lostSecretsById.get(lostId);
        const expected = secret?.hidden_detail || "(no secret found)";
        if (expectedWrap) expectedWrap.textContent = `Expected: ${expected}`;
      };
      sel?.addEventListener("change", renderExpected);
      renderExpected();

      // Bind approve/reject
      card.querySelector(`[data-reject="${cssEscape(c.id)}"]`)?.addEventListener("click", async () => rejectClaim(c));

      card.querySelector(`[data-approve="${cssEscape(c.id)}"]`)?.addEventListener("click", async () => {
        const lostId = sel?.value || "";
        if (!lostId) {
          alert("Select the claimant's lost report first.");
          return;
        }
        await approveClaim(c, lostId);
      });

      card.querySelector(`[data-return="${cssEscape(c.id)}"]`)?.addEventListener("click", async () => {
        // We can mark returned only if the found item is already matched.
        if (!found) return;
        await markReturned(found);
      });
    });
  }

  function renderResolved() {
    if (!resolvedList) return;
    const returnedFound = foundItems.filter((f) => (f.status || "") === "returned");
    if (returnedFound.length === 0) {
      resolvedList.innerHTML = `<div class="bg-white rounded-xl border border-outline-variant/20 p-6 text-sm text-on-surface-variant">No returned items yet.</div>`;
      return;
    }
    resolvedList.innerHTML = "";
    returnedFound
      .slice()
      .sort((a, b) => (b.created_at_ms || 0) - (a.created_at_ms || 0))
      .forEach((f) => {
        const wrap = document.createElement("div");
        wrap.className = "bg-white rounded-2xl border border-outline-variant/20 p-5";
        wrap.innerHTML = `
          <div class="flex items-start justify-between gap-4">
            <div>
              <p class="text-xs font-black uppercase tracking-widest text-on-surface-variant">Resolved</p>
              <h3 class="text-lg font-extrabold mt-1">${escapeHtml(f.item_name || "")}</h3>
              <p class="text-xs text-on-surface-variant mt-1">${escapeHtml(f.location_found || "")} • ${escapeHtml(f.date_found || "")}</p>
            </div>
            <div>${statusBadge("returned")}</div>
          </div>
          <div class="mt-4 bg-surface-container-low rounded-xl p-4 border border-outline-variant/20">
            <p class="text-xs font-black uppercase tracking-widest text-on-surface/60 mb-2">Timeline</p>
            <div class="space-y-2 text-sm">
              <div class="flex items-center gap-2">
                <span class="material-symbols-outlined text-[16px] text-primary">check_circle</span>
                Found report created${f.created_at_ms ? ` • ${escapeHtml(formatDateTiny(f.created_at_ms))}` : ""}
              </div>
              <div class="flex items-center gap-2">
                <span class="material-symbols-outlined text-[16px] text-amber-500">handshake</span>
                Matched by admin${f.matched_at_ms ? ` • ${escapeHtml(formatDateTiny(f.matched_at_ms))}` : ""}
              </div>
              <div class="flex items-center gap-2">
                <span class="material-symbols-outlined text-[16px] text-green-700">task_alt</span>
                Marked as returned${f.returned_at_ms ? ` • ${escapeHtml(formatDateTiny(f.returned_at_ms))}` : ""}
              </div>
            </div>
          </div>
        `;
        resolvedList.appendChild(wrap);
      });
  }

  // ── Workflow actions ──────────────────────────────────────────────────────
  async function rejectClaim(c) {
    if (!confirm("Reject this claim request?")) return;
    await cfi.db.collection("claim_requests").doc(c.id).update({
      status: "rejected",
      decided_at: cfi.serverTimestamp(),
    });
    await cfi.db.collection("notifications").add({
      uid: c.claimant_uid,
      message: `Your claim request was rejected. If you believe this is a mistake, please contact the admin office.`,
      read: false,
      created_at: cfi.serverTimestamp(),
    });
  }

  async function approveClaim(c, lostId) {
    if (!confirm("Approve this claim and mark both items as matched?")) return;
    const found = foundItems.find((f) => f.id === c.found_item_id);
    if (!found) {
      alert("Found item no longer exists.");
      return;
    }

    // Update docs as an atomic-ish batch
    const batch = cfi.db.batch();
    const claimRef = cfi.db.collection("claim_requests").doc(c.id);
    const foundRef = cfi.db.collection("found_items").doc(found.id);
    const lostRef = cfi.db.collection("lost_items").doc(lostId);

    batch.update(claimRef, {
      // IMPORTANT: keep the request as `pending` until admin marks physical return.
      // This way the card stays in the "Claim Requests" tab as per your spec.
      status: "pending",
      decided_at: cfi.serverTimestamp(),
      related_lost_item_id: lostId,
    });
    batch.update(foundRef, {
      status: "matched",
      matched_claim_request_id: c.id,
      matched_lost_item_id: lostId,
      matched_claimant_uid: c.claimant_uid,
      matched_at: cfi.serverTimestamp(),
    });
    batch.update(lostRef, {
      status: "matched",
      matched_found_item_id: found.id,
      matched_claim_request_id: c.id,
      matched_at: cfi.serverTimestamp(),
    });

    await batch.commit();

    // Notifications
    await cfi.db.collection("notifications").add({
      uid: c.claimant_uid,
      message: `Your claim was approved. Please collect the item from the Admin Office.`,
      read: false,
      created_at: cfi.serverTimestamp(),
    });
    if (found.owner_uid) {
      await cfi.db.collection("notifications").add({
        uid: found.owner_uid,
        message: `Thank you! A verified owner has been approved for "${found.item_name || "your item"}".`,
        read: false,
        created_at: cfi.serverTimestamp(),
      });
    }
  }

  async function markReturned(found) {
    if (!confirm(`Mark "${found.item_name || "item"}" as returned?`)) return;
    const foundRef = cfi.db.collection("found_items").doc(found.id);
    const lostId = found.matched_lost_item_id || null;
    const claimId = found.matched_claim_request_id || null;

    const batch = cfi.db.batch();
    batch.update(foundRef, { status: "returned", returned_at: cfi.serverTimestamp() });
    if (lostId) {
      batch.update(cfi.db.collection("lost_items").doc(lostId), { status: "returned", returned_at: cfi.serverTimestamp() });
    }
    if (claimId) {
      batch.update(cfi.db.collection("claim_requests").doc(claimId), { status: "approved", returned_at: cfi.serverTimestamp() });
    }
    await batch.commit();

    // Notify both sides if we can
    if (found.matched_claimant_uid) {
      await cfi.db.collection("notifications").add({
        uid: found.matched_claimant_uid,
        message: `Item return confirmed. Thank you for using CampusFoundIt.`,
        read: false,
        created_at: cfi.serverTimestamp(),
      });
    }
    if (found.owner_uid) {
      await cfi.db.collection("notifications").add({
        uid: found.owner_uid,
        message: `Return completed for "${found.item_name || "your found item"}". Thank you for helping!`,
        read: false,
        created_at: cfi.serverTimestamp(),
      });
    }
  }

  // Legacy secret migration helper (optional)
  migrateBtn?.addEventListener("click", async () => {
    const proceed = confirm(
      "Migrate legacy `lost_items.hidden_detail` into `lost_item_secrets` and remove it from public docs?\n\nThis improves privacy for older records."
    );
    if (!proceed) return;

    try {
      migrateBtn.disabled = true;
      migrateBtn.textContent = "Migrating...";

      const lostSnap = await cfi.db.collection("lost_items").get();
      let migrated = 0;
      let skippedMissingOwnerUid = 0;
      let removedFromPublic = 0;

      for (const doc of lostSnap.docs) {
        const data = doc.data() || {};
        const legacyHidden = data.hidden_detail;
        if (!legacyHidden) continue;

        let ownerUid = data.owner_uid || null;
        if (!ownerUid && data.email) {
          // Best-effort: find the user uid by matching email
          const userSnap = await cfi.db
            .collection("users")
            .where("email", "==", data.email)
            .limit(1)
            .get();
          ownerUid = userSnap.docs[0]?.id || null;
        }

        if (!ownerUid) {
          skippedMissingOwnerUid++;
          continue;
        }

        // 1) Write secret doc for admin-only reading
        await cfi.db.collection("lost_item_secrets").doc(doc.id).set(
          {
            owner_uid: ownerUid,
            hidden_detail: legacyHidden,
            created_at: data.created_at || cfi.serverTimestamp(),
          },
          { merge: true }
        );
        migrated++;

        // 2) Remove legacy field from public doc
        // Firestore compat delete sentinel
        const deleteSentinel = window.firebase.firestore.FieldValue.delete();
        if (deleteSentinel) {
          await cfi.db.collection("lost_items").doc(doc.id).update({ hidden_detail: deleteSentinel });
          removedFromPublic++;
        }
      }

      alert(
        `Migration finished.\n- Migrated secret docs: ${migrated}\n- Skipped (couldn't find owner_uid): ${skippedMissingOwnerUid}\n- Removed from public docs: ${removedFromPublic}`
      );
    } catch (e) {
      console.error("Migration failed:", e);
      alert(e?.message || "Migration failed.");
    } finally {
      migrateBtn.disabled = false;
      migrateBtn.textContent = "Migrate legacy secrets";
    }
  });

  // ── Helpers ───────────────────────────────────────────────────────────────
  function statusBadge(status) {
    const s = (status || "").toLowerCase();
    if (s === "unclaimed") return `<span class="bg-green-600 text-white text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded shadow-sm">Unclaimed</span>`;
    if (s === "matched") return `<span class="bg-amber-500 text-white text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded shadow-sm">Matched</span>`;
    if (s === "returned") return `<span class="bg-zinc-600 text-white text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded shadow-sm">Returned</span>`;
    if (s === "open") return `<span class="bg-amber-500 text-white text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded shadow-sm">Open</span>`;
    return `<span class="bg-zinc-600 text-white text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded shadow-sm">${escapeHtml(s)}</span>`;
  }

  function formatDateTiny(ms) {
    if (!ms) return "";
    return new Date(ms).toLocaleString("en-IN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
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

  function cssEscape(str) {
    // Minimal escape for querySelector with attribute values
    return String(str || "").replaceAll('"', '\\"');
  }
});
