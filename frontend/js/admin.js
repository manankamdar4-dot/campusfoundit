// ─── admin.js ───
// Core logic for the admin dashboard.
// Handles authentication, switching tabs, fetching all lists,
// taking actions on matches, and rendering tables.

let currentAdminPassword = null;
let currentMatchModalId = null;

document.addEventListener('DOMContentLoaded', () => {
  const loginSection = document.getElementById('loginSection');
  const dashboardSection = document.getElementById('dashboardSection');
  const loginForm = document.getElementById('adminLoginForm');
  const logoutBtn = document.getElementById('logoutBtn');

  // Tab Switching Logic
  const tabs = document.querySelectorAll('.admin-tab');
  const contents = document.querySelectorAll('.tab-content');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      // Remove active from all
      tabs.forEach(t => t.classList.remove('active'));
      contents.forEach(c => c.classList.remove('active'));

      // Add active to clicked
      tab.classList.add('active');
      const targetId = tab.getAttribute('data-target');
      document.getElementById(targetId).classList.add('active');
    });
  });

  // Login handler
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = loginForm.querySelector('button');
      const originalText = btn.textContent;
      btn.classList.add('loading');
      btn.textContent = ' ';
      
      const pwd = document.getElementById('adminPassword').value;
      
      // Attempt to fetch stats to verify password
      try {
        const response = await fetch(`${CONFIG.API_BASE_URL}/api/admin/matches`, {
          headers: {
            'x-admin-password': pwd
          }
        });

        if (response.ok) {
          currentAdminPassword = pwd;
          loginSection.style.display = 'none';
          dashboardSection.style.display = 'block';
          logoutBtn.style.display = 'inline-flex';
          
          if (typeof showToast === 'function') {
            showToast('Authentication successful.', 'success');
          }

          // Initial data fetch
          refreshAllData();
        } else {
          if (typeof showToast === 'function') {
            showToast('Invalid admin credential.', 'error');
          }
          btn.classList.remove('loading');
          btn.textContent = originalText;
        }
      } catch (error) {
        console.error('Login error:', error);
        if (typeof showToast === 'function') {
          showToast('Server connection error.', 'error');
        }
        btn.classList.remove('loading');
        btn.textContent = originalText;
      }
    });
  }

  // Logout handler
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      currentAdminPassword = null;
      document.getElementById('adminPassword').value = '';
      dashboardSection.style.display = 'none';
      logoutBtn.style.display = 'none';
      loginSection.style.display = 'block';
      const btn = loginForm.querySelector('button');
      btn.classList.remove('loading');
      btn.textContent = 'Authenticate';
    });
  }
});

// Central function to fetch all dashboard data
async function refreshAllData() {
  await Promise.all([
    fetchStats(),
    fetchMatches(),
    fetchLostItems(),
    fetchFoundItems()
  ]);
}

// Global fetch wrapper with auth header built in
async function adminFetch(endpoint, method = 'GET', body = null) {
  const options = {
    method,
    headers: {
      'x-admin-password': currentAdminPassword,
      'Content-Type': 'application/json'
    }
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(`${CONFIG.API_BASE_URL}/api/admin${endpoint}`, options);
  return response.json();
}

// ─── Stats Fetch ───
async function fetchStats() {
  try {
    const response = await adminFetch('/lost'); // Used to count open lost
    const foundResp = await adminFetch('/found');
    // Stats calculation based on admin data directly instead of public endpoint structure
    
    if (response.success && foundResp.success) {
      const activeLost = response.data.filter(i => i.status === 'open').length;
      const activeFound = foundResp.data.filter(i => i.status === 'open').length;
      
      document.getElementById('adminTotalLost').textContent = activeLost;
      document.getElementById('adminTotalFound').textContent = activeFound;
    }
  } catch (error) {
    console.error('Failed to parse specific stats.', error);
  }
}

// ─── Matches Fetch and Render ───
let allMatchesData = [];

async function fetchMatches() {
  const container = document.getElementById('suggestedMatchesContainer');
  const confirmedContainer = document.getElementById('confirmedMatchesContainer');
  
  try {
    const data = await adminFetch('/matches');
    
    if (data.success) {
      allMatchesData = data.data; // Store globally for modal access
      
      const suggested = allMatchesData.filter(m => m.confirmed === 0);
      const confirmed = allMatchesData.filter(m => m.confirmed === 1 && m.lost_status !== 'returned');

      // Update pending count stat
      document.getElementById('adminPendingMatches').textContent = suggested.length;

      // Render Suggested
      if (suggested.length === 0) {
        container.innerHTML = '<div class="card text-center text-muted" style="padding: var(--space-10) 0;">No pending algorithmic matches in query.</div>';
      } else {
        container.innerHTML = '';
        suggested.forEach(match => {
          container.innerHTML += buildMatchCard(match, false);
        });
      }

      // Render Confirmed
      if (confirmed.length === 0) {
        confirmedContainer.innerHTML = '<div class="card text-center text-muted" style="padding: var(--space-10) 0;">Zero records awaiting student pickup.</div>';
      } else {
        confirmedContainer.innerHTML = '';
        confirmed.forEach(match => {
          confirmedContainer.innerHTML += buildMatchCard(match, true);
        });
      }
    }
  } catch (error) {
    console.error('Error fetching matches:', error);
  }
}

function buildMatchCard(match, isConfirmed) {
  let scoreColor = 'badge-orange'; // default
  if (match.similarity_score >= 80) scoreColor = 'badge-green';
  if (match.similarity_score < 60) scoreColor = 'badge-gray';

  const dateLost = new Date(match.date_lost).toLocaleDateString('en-GB');
  const dateFound = new Date(match.date_found).toLocaleDateString('en-GB');

  let actionButtons = '';
  if (isConfirmed) {
    actionButtons = `
      <button class="btn btn-navy btn-sm" onclick="markReturned(${match.match_id})" style="background: var(--c-navy-800); color: var(--c-white);">Log as Safely Returned</button>
    `;
  } else {
    actionButtons = `
      <button class="btn btn-ghost btn-sm" onclick="dismissMatch(${match.match_id})">Dismiss Algorithmic Suggestion</button>
      <button class="btn btn-primary btn-sm" onclick="openMatchModal(${match.match_id})">Verify Protocol</button>
    `;
  }

  let hdrBadge = isConfirmed 
    ? `<span class="badge badge-green">AWAITING PICKUP</span>` 
    : `<span class="badge ${scoreColor}">SCORE: ${match.similarity_score}%</span>`;
  
  return `
    <div class="match-panel">
      <div class="match-panel-hdr flex-justify-between">
        <span style="font-weight: 600; font-size: var(--text-sm);">Match Query #${match.match_id}</span>
        ${hdrBadge}
      </div>
      
      <div class="match-panel-body">
        <!-- Lost Sector -->
        <div class="match-side">
          <h4 class="text-sm mb-4" style="color: var(--c-navy-800);">STUDENT: LOST REPORT</h4>
          
          <div class="grid" style="display:grid; grid-template-columns: 100px 1fr; gap:var(--space-2) var(--space-4); font-size: var(--text-sm); margin-bottom: var(--space-4);">
            <div class="text-muted">Item</div><div>${match.lost_item}</div>
            <div class="text-muted">Properties</div><div>${match.lost_color} / ${match.lost_category}</div>
            <div class="text-muted">Location</div><div>${match.location_lost} <span class="text-muted text-xs">(${dateLost})</span></div>
            <div class="text-muted mt-4">Owner</div><div class="mt-4">${match.lost_name} / ${match.lost_phone}</div>
          </div>
          
          <div class="secret-box mt-6">
            <h5 class="text-xs text-orange-600 mb-1" style="text-transform: uppercase;">Private Verification Key</h5>
            <div class="text-sm">"${match.hidden_detail}"</div>
          </div>
        </div>
        
        <!-- Found Sector -->
        <div class="match-side">
          <h4 class="text-sm mb-4" style="color: var(--c-gray-700);">COMMUNITY: FOUND REPORT</h4>
          
          <div class="grid" style="display:grid; grid-template-columns: 100px 1fr; gap:var(--space-2) var(--space-4); font-size: var(--text-sm); margin-bottom: var(--space-4);">
            <div class="text-muted">Item</div><div>${match.found_item}</div>
            <div class="text-muted">Properties</div><div>${match.found_color} / ${match.found_category}</div>
            <div class="text-muted">Location</div><div>${match.location_found} <span class="text-muted text-xs">(${dateFound})</span></div>
            <div class="text-muted mt-4">Finder</div><div class="mt-4">${match.found_name} / ${match.found_phone} / ${match.found_email}</div>
          </div>
          
          <div class="mt-6">
            <h5 class="text-xs text-muted mb-1" style="text-transform: uppercase;">Provided Description</h5>
            <div class="text-sm text-muted">"${match.found_description || 'None provided in database.'}"</div>
          </div>
        </div>
      </div>
      
      <div class="match-panel-ftr">
        ${actionButtons}
      </div>
    </div>
  `;
}

// ─── Actions (Confirm, Dismiss, Mark Returned) ───

window.openMatchModal = function(matchId) {
  const match = allMatchesData.find(m => m.match_id === matchId);
  if (!match) return;
  
  currentMatchModalId = matchId;
  const modalBody = document.getElementById('modalBody');
  
  modalBody.innerHTML = `
    <div class="mb-6">
      <h4 class="text-sm text-navy-800 mb-2">Step 1: Parse Hidden Proof</h4>
      <div class="secret-box text-sm mb-2">
        "${match.hidden_detail}"
      </div>
    </div>
    <div class="mb-6">
      <h4 class="text-sm text-navy-800 mb-2">Step 2: Cross Reference Found Details</h4>
      <div style="background: var(--c-gray-50); padding: var(--space-3); border: 1px solid var(--c-gray-200); border-radius: var(--radius-sm); font-size: var(--text-sm);">
        ${match.found_description || 'No description provided.'}
      </div>
      ${match.found_photo ? `
        <div class="mt-4">
          <img src="${CONFIG.API_BASE_URL}${match.found_photo}" alt="Found Visual" style="max-height: 180px; border-radius: var(--radius-sm); border: 1px solid var(--c-gray-200);">
        </div>
      ` : ''}
    </div>
    <hr style="border: 0; border-top: 1px solid var(--c-gray-200); margin: var(--space-6) 0;">
    <p class="text-sm text-muted">
      Authorizing this match will immediately dispatch system emails via primary SMTP to both <strong>${match.lost_email}</strong> and <strong>${match.found_email}</strong>. This process is fully automated.
    </p>
  `;
  
  document.getElementById('matchModal').classList.add('active');
};

window.closeModal = function() {
  document.getElementById('matchModal').classList.remove('active');
  currentMatchModalId = null;
};

document.getElementById('modalConfirmBtn').addEventListener('click', async () => {
  if (!currentMatchModalId) return;

  const matchId = currentMatchModalId;
  closeModal();

  const overlay = document.getElementById('adminLoading');
  const txt = document.getElementById('adminLoadingText');
  txt.textContent = 'Executing SMTP dispatch protocol...';
  overlay.classList.add('active');

  try {
    const data = await adminFetch('/confirm-match', 'POST', { match_id: matchId });
    if (data.success) {
      if (typeof showToast === 'function') showToast('Match Confirmed. Emails successfully dispatched.', 'success');
      await refreshAllData();
    } else {
      if (typeof showToast === 'function') showToast(data.message || 'Error executing confirmation.', 'error');
    }
  } catch (error) {
    if (typeof showToast === 'function') showToast('Server connection fault.', 'error');
  } finally {
    overlay.classList.remove('active');
  }
});

window.dismissMatch = async function(matchId) {
  if (!confirm('Dismiss this algorithmic suggestion? This action strips it from current view queues forever.')) return;
  
  try {
    const data = await adminFetch('/dismiss-match', 'POST', { match_id: matchId });
    if (data.success) {
      if (typeof showToast === 'function') showToast('Algorithmic suggestion dismissed from queue.', 'success');
      await fetchMatches();
    }
  } catch (error) {
    console.error('Dismiss error', error);
  }
};

window.markReturned = async function(matchId) {
  if (!confirm('Log this physical item as collected by verified owner?')) return;

  try {
    const data = await adminFetch('/mark-returned', 'POST', { match_id: matchId });
    if (data.success) {
      if (typeof showToast === 'function') showToast('Record securely archived as fulfilled.', 'success');
      await refreshAllData();
    }
  } catch (error) {
    console.error('Return error', error);
  }
};

// ─── Datatables Fetch and Render (Lost & Found Tabs) ───

async function fetchLostItems() {
  const tbody = document.getElementById('lostItemsTableBody');
  try {
    const data = await adminFetch('/lost');
    if (data.success) {
      tbody.innerHTML = '';
      data.data.forEach(item => {
        let statusBadge = `<span class="badge badge-gray">OPEN</span>`;
        if (item.status === 'matched') statusBadge = `<span class="badge badge-orange">MATCHED</span>`;
        if (item.status === 'returned') statusBadge = `<span class="badge badge-green">RETURNED</span>`;

        const row = `
          <tr>
            <td>
              <span style="font-weight: 500; display: block; margin-bottom: var(--space-1);">#${item.id}</span>
              ${statusBadge}
            </td>
            <td>
              <span style="font-weight: 500;">${item.name}</span><br>
              <span class="text-sm text-muted">${item.email}<br>${item.phone}</span>
            </td>
            <td>
              <span style="font-weight: 500;">${item.item_name}</span><br>
              <span class="text-sm text-muted">${item.category} / ${item.color}</span>
            </td>
            <td>
              ${item.location_lost}<br>
              <span class="text-sm text-muted">${new Date(item.date_lost).toLocaleDateString('en-GB')}</span>
            </td>
            <td style="max-width: 250px; font-style: italic; color: var(--c-orange-600); padding-right: var(--space-4);">
              "${item.hidden_detail}"
            </td>
          </tr>
        `;
        tbody.innerHTML += row;
      });
    }
  } catch (error) {
    console.error('Error fetching lost master database', error);
  }
}

async function fetchFoundItems() {
  const tbody = document.getElementById('foundItemsTableBody');
  try {
    const data = await adminFetch('/found');
    if (data.success) {
      tbody.innerHTML = '';
      data.data.forEach(item => {
        let statusBadge = `<span class="badge badge-gray">UNCLAIMED</span>`;
        if (item.status === 'matched') statusBadge = `<span class="badge badge-orange">MATCHED</span>`;
        if (item.status === 'returned') statusBadge = `<span class="badge badge-green">RETURNED</span>`;

        const row = `
          <tr>
            <td>
              <span style="font-weight: 500; display: block; margin-bottom: var(--space-1);">#${item.id}</span>
              ${statusBadge}
            </td>
            <td>
              <span style="font-weight: 500;">${item.name}</span><br>
              <span class="text-sm text-muted">${item.email}<br>${item.phone}</span>
            </td>
            <td>
              <span style="font-weight: 500;">${item.item_name}</span><br>
              <span class="text-sm text-muted">${item.category} / ${item.color}</span>
            </td>
            <td>
              ${item.location_found}<br>
              <span class="text-sm text-muted">${new Date(item.date_found).toLocaleDateString('en-GB')}</span>
            </td>
          </tr>
        `;
        tbody.innerHTML += row;
      });
    }
  } catch (error) {
    console.error('Error fetching found master database', error);
  }
}
