// ─── report-lost.js ───
// Lost report submission (serverless).
//
// Security model:
// - Public doc goes to `lost_items` (readable by anyone)
// - Private verification detail goes to `lost_item_secrets/{lostId}` (admin-only)
//
// Why?
// - Firestore rules cannot hide one field inside a readable document.
// - This keeps "hidden_detail" truly private.

document.addEventListener("DOMContentLoaded", () => {
  const cfi = window.cfi;
  const form = document.getElementById("reportLostForm");
  const loadingOverlay = document.getElementById("authLoadingScreen") || document.getElementById("loadingOverlay");
  const submitBtn = document.getElementById("submitBtn");

  if (!cfi || !cfi.db || !cfi.auth || !cfi.storage) {
    console.error("CampusFoundIt not initialized.");
    return;
  }
  if (!form) return;

  // Pre-fill email from the authenticated user (rules require it matches auth email).
  cfi.auth.onAuthStateChanged((user) => {
    const emailEl = document.getElementById("studentEmail");
    if (emailEl && user && user.email) {
      emailEl.value = user.email;
      emailEl.readOnly = true;
    }

    const nameEl = document.getElementById("studentName");
    if (nameEl && user && (user.displayName || window.currentUserProfile?.name)) {
      nameEl.value = window.currentUserProfile?.name || user.displayName;
    }
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    // Simple validation: check required fields
    const requiredFields = form.querySelectorAll("[required]");
    let isValid = true;
    requiredFields.forEach((field) => {
      if (field.type === "checkbox") {
        if (!field.checked) isValid = false;
      } else {
        if (!String(field.value || "").trim()) isValid = false;
      }
    });
    if (!isValid) {
      if (typeof showToast === "function") showToast("Please fill in all required fields.", "error");
      return;
    }

    const user = cfi.auth.currentUser;
    if (!user) {
      window.location.replace("login.html?next=report-lost.html");
      return;
    }

    // Loading UI
    if (loadingOverlay) {
      loadingOverlay.style.opacity = "1";
      loadingOverlay.style.display = "flex";
    }
    if (submitBtn) submitBtn.disabled = true;

    try {
      const studentName = document.getElementById("studentName").value.trim();
      const studentId = document.getElementById("studentId").value.trim();
      const studentEmail = user.email; // enforce auth email

      const itemName = document.getElementById("itemName").value.trim();
      const itemCategory = document.getElementById("itemCategory").value;
      const lastSeenDate = document.getElementById("lastSeenDate").value;
      const lastSeenLocation = document.getElementById("lastSeenLocation").value.trim();
      const secretDetails = document.getElementById("secretDetails").value.trim();

      const itemImageInput = document.getElementById("itemImage");

      // Upload image (optional)
      let photo_path = null;
      if (itemImageInput && itemImageInput.files && itemImageInput.files.length > 0) {
        const file = itemImageInput.files[0];
        const safeName = `${Date.now()}_${file.name}`.replace(/[^\w.\-]/g, "_");
        const storageRef = cfi.storage.ref(`lost_items/${user.uid}/${safeName}`);
        const snapshot = await storageRef.put(file);
        photo_path = await snapshot.ref.getDownloadURL();
      }

      // 1) Create public lost item doc
      const lostPublic = {
        owner_uid: user.uid,
        name: studentName,
        category: itemCategory,
        date_lost: lastSeenDate,
        location_lost: lastSeenLocation,
        photo_path,
        email: studentEmail,
        studentId,
        status: "open", // open -> matched -> returned
        created_at: cfi.serverTimestamp(),
      };

      const lostRef = await cfi.db.collection("lost_items").add(lostPublic);

      // 2) Create private secrets doc (admin-only)
      await cfi.db.collection("lost_item_secrets").doc(lostRef.id).set({
        owner_uid: user.uid,
        hidden_detail: secretDetails,
        created_at: cfi.serverTimestamp(),
      });

      if (typeof showToast === "function") showToast("Lost report submitted successfully!", "success");
      window.location.href = "success.html?type=lost";
    } catch (error) {
      console.error("Error submitting lost report:", error);
      if (typeof showToast === "function") showToast(error?.message || "Could not submit report.", "error");
    } finally {
      if (loadingOverlay) {
        loadingOverlay.style.opacity = "0";
        setTimeout(() => {
          if (loadingOverlay) loadingOverlay.style.display = "none";
        }, 300);
      }
      if (submitBtn) submitBtn.disabled = false;
    }
  });
});
