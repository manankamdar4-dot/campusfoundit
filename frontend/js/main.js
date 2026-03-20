// ─── main.js ───
// Central configuration and global scripts for CampusFoundIt.

document.addEventListener('DOMContentLoaded', () => {
  // Mobile Navbar Toggle (If added later)
  const navToggle = document.getElementById('navToggle');
  const navLinks = document.getElementById('navLinks');
  if (navToggle && navLinks) {
    navToggle.addEventListener('click', () => {
      navLinks.classList.toggle('active');
    });
  }

  // Homepage Specifics
  const statsReported = document.getElementById('stat-reported');
  const recentItemsContainer = document.getElementById('recent-items-container');

  if (statsReported) {
    fetchStats();
  }

  if (recentItemsContainer) {
    fetchRecentFoundItems();
  }
});

// Fetch stats and replace skeletons
async function fetchStats() {
  try {
    const response = await fetch(`${CONFIG.API_BASE_URL}/api/stats`);
    const data = await response.json();

    if (data.success) {
      document.getElementById('stat-reported').innerHTML = data.data.totalLost + data.data.totalFound;
      document.getElementById('stat-matched').innerHTML = data.data.totalMatched;
      document.getElementById('stat-returned').innerHTML = data.data.totalReturned;
    }
  } catch (error) {
    console.error('Failed to fetch stats:', error);
    document.getElementById('stat-reported').innerHTML = '-';
    document.getElementById('stat-matched').innerHTML = '-';
    document.getElementById('stat-returned').innerHTML = '-';
  }
}

// Fetch 6 recent found items and replace skeletons
async function fetchRecentFoundItems() {
  const container = document.getElementById('recent-items-container');
  
  try {
    const response = await fetch(`${CONFIG.API_BASE_URL}/api/found/recent`);
    const data = await response.json();

    if (data.success) {
      container.innerHTML = ''; // Clear skeletons

      if (data.data.length === 0) {
        container.innerHTML = `
          <div class="empty-state text-center" style="grid-column: 1 / -1; padding: var(--space-12) 0;">
            <p class="text-muted text-lg">No items have been reported found yet.</p>
          </div>
        `;
        return;
      }

      data.data.forEach(item => {
        const card = document.createElement('div');
        card.className = 'item-card';
        
        const imgHtml = item.photo_path 
          ? `<img src="${CONFIG.API_BASE_URL}${item.photo_path}" alt="${item.item_name}" class="item-card-img" loading="lazy">`
          : `<div class="item-card-placeholder"></div>`;

        const dateObj = new Date(item.date_found);
        const formattedDate = dateObj.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
        
        let statusClass = 'badge-gray';
        let statusText = 'UNCLAIMED';
        if (item.status === 'matched') {
          statusClass = 'badge-orange';
          statusText = 'MATCHED';
        }
        if (item.status === 'returned') {
          statusClass = 'badge-green';
          statusText = 'RETURNED';
        }

        card.innerHTML = `
          ${imgHtml}
          <div class="item-card-content">
            <h3 class="item-card-title">${item.item_name}</h3>
            <div class="item-card-badges">
              <span class="badge badge-navy">${item.category}</span>
              <span class="badge ${statusClass}">${statusText}</span>
            </div>
            <div class="item-card-details">
              <span><strong>Color:</strong> ${item.color}</span>
              <span><strong>Found at:</strong> ${item.location_found}</span>
              <span><strong>Date:</strong> ${formattedDate}</span>
            </div>
          </div>
        `;
        
        container.appendChild(card);
      });
    }
  } catch (error) {
    console.error('Failed to fetch recent found items:', error);
    container.innerHTML = `<div class="text-center" style="grid-column: 1 / -1;"><p class="text-error">Failed to load recent items. Please verify the backend API is running.</p></div>`;
  }
}

// Global Toast Utility
window.showToast = function(message, type = 'success') {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;

  container.appendChild(toast);

  // Auto remove
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(100%)';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
};
