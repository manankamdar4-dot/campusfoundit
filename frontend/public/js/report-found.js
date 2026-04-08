// ─── report-found.js ───
// Found report submission (serverless).
//
// Anonymous finder support:
// - Public doc goes to `found_items` (readable by anyone)
// - If user checks "anonymous", the public doc does NOT include name/email
//   and the real identity is stored in `found_item_secrets/{foundId}` (admin-only).

document.addEventListener("DOMContentLoaded", () => {
  const cfi = window.cfi;
  const form = document.getElementById("reportFoundForm");
  const loadingOverlay = document.getElementById("authLoadingScreen") || document.getElementById("loadingOverlay");
  const submitBtn = document.getElementById("submitBtn");

  if (!cfi || !cfi.db || !cfi.auth || !cfi.storage) {
    console.error("CampusFoundIt not initialized.");
    return;
  }
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const requiredFields = form.querySelectorAll("[required]");
    let isValid = true;
    requiredFields.forEach((field) => {
      if (!String(field.value || "").trim()) isValid = false;
    });
    if (!isValid) {
      if (typeof showToast === "function") showToast("Please fill in all required fields.", "error");
      return;
    }

    const user = cfi.auth.currentUser;
    if (!user) {
      window.location.replace("login.html?next=report-found.html");
      return;
    }

    if (loadingOverlay) {
      loadingOverlay.style.opacity = "1";
      loadingOverlay.style.display = "flex";
    }
    if (submitBtn) submitBtn.disabled = true;

    try {
      const itemName = document.getElementById("itemName").value.trim();
      const itemCategory = document.getElementById("itemCategory").value;
      const foundDate = document.getElementById("foundDate").value;
      const foundLocation = document.getElementById("foundLocation").value.trim();
      const currentLocation = document.getElementById("currentLocation").value;
      const addDetails = document.getElementById("addDetails").value.trim();
      const isAnonymous = !!document.getElementById("anonymousFinder")?.checked;

      const itemImageInput = document.getElementById("itemImage");
      let photo_path = null;
      if (itemImageInput && itemImageInput.files && itemImageInput.files.length > 0) {
        const file = itemImageInput.files[0];
        const safeName = `${Date.now()}_${file.name}`.replace(/[^\w.\-]/g, "_");
        const storageRef = cfi.storage.ref(`found_items/${user.uid}/${safeName}`);
        const snapshot = await storageRef.put(file);
        photo_path = await snapshot.ref.getDownloadURL();
      }

      // Public fields
      const finderName = window.currentUserProfile?.name || user.displayName || "Student";
      const finderEmail = user.email || null;

      const foundPublic = {
        owner_uid: user.uid,
        // If anonymous, do not expose identity publicly.
        name: isAnonymous ? "Anonymous Finder" : finderName,
        email: isAnonymous ? null : finderEmail,
        is_anonymous: isAnonymous,

        // Item fields
        item_name: itemName,
        category: itemCategory,
        date_found: foundDate,
        location_found: foundLocation,
        // Visible, non-secret description
        description: addDetails,
        // Where is the item currently secured (helps admin retrieval)
        current_location: currentLocation,

        photo_path,
        status: "unclaimed", // unclaimed -> matched -> returned
        created_at: cfi.serverTimestamp(),
      };

      const foundRef = await cfi.db.collection("found_items").add(foundPublic);

      // If anonymous, store the real identity in admin-only secrets doc.
      if (isAnonymous) {
        await cfi.db.collection("found_item_secrets").doc(foundRef.id).set({
          owner_uid: user.uid,
          finder_name: finderName,
          finder_email: finderEmail,
          created_at: cfi.serverTimestamp(),
        });
      }

      if (typeof showToast === "function") showToast("Found report submitted successfully!", "success");
      window.location.href = "success.html?type=found";
    } catch (error) {
      console.error("Error submitting found report:", error);
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
