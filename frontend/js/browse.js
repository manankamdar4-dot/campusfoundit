// ─── browse.js ───
// Logic for fetching, displaying, and filtering all found items securely.

document.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('foundItemsContainer');
  const emptyState = document.getElementById('emptyStateContainer');

  const searchInput = document.getElementById('searchInput');
  const filterCategory = document.getElementById('filterCategory');
  const filterLocation = document.getElementById('filterLocation');
  const filterStatus = document.getElementById('filterStatus');

  let allItems = [];

  // Fetch all found items
  async function fetchAllItems() {
    try {
      const response = await fetch(`${CONFIG.API_BASE_URL}/api/found`);
      const data = await response.json();

      if (data.success) {
        allItems = data.data;
        renderItems(allItems);
      }
    } catch (error) {
      console.error('Failed to fetch found items:', error);
      
      // Remove loaders and show error
      container.innerHTML = `<div style="grid-column: 1 / -1; padding: var(--space-12) 0; text-align: center;">
        <p class="text-error" style="color: var(--c-error-600);">Failed to load items. Please try again later.</p>
      </div>`;
    }
  }

  // Render items
  function renderItems(items) {
    if (items.length === 0) {
      container.style.display = 'none';
      emptyState.style.display = 'block';
      return;
    }

    container.style.display = 'grid'; // Ensure grid is active
    emptyState.style.display = 'none';
    container.innerHTML = ''; // Clear loaders or previous items

    items.forEach(item => {
      const card = document.createElement('div');
      card.className = 'item-card';

      const imgHtml = item.photo_path 
        ? `<img src="${CONFIG.API_BASE_URL}${item.photo_path}" alt="${item.item_name}" class="item-card-img" loading="lazy">`
        : `<div class="item-card-placeholder"></div>`;

      // Date logic
      const dateObj = new Date(item.date_found);
      const formattedDate = dateObj.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
      
      // Status formatting
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

      let desc = item.description || 'No additional description provided.';
      if (desc.length > 80) desc = desc.substring(0, 80) + '...';

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
            <span><strong>Brand:</strong> ${item.brand || 'N/A'}</span>
            <span><strong>Location:</strong> ${item.location_found}</span>
            <span><strong>Date:</strong> ${formattedDate}</span>
          </div>
          <p class="text-sm text-muted mt-8" style="font-style: italic;">"${desc}"</p>
        </div>
      `;
      
      container.appendChild(card);
    });
  }

  // Live filter function
  function applyFilters() {
    const searchTerm = searchInput.value.toLowerCase();
    const category = filterCategory.value;
    const location = filterLocation.value;
    const status = filterStatus.value;

    const filtered = allItems.filter(item => {
      const searchableText = `${item.item_name} ${item.color} ${item.brand || ''} ${item.description || ''}`.toLowerCase();
      const matchesSearch = searchableText.includes(searchTerm);
      const matchesCategory = category === 'all' || item.category === category;
      const matchesLocation = location === 'all' || item.location_found === location;
      const matchesStatus = status === 'all' || item.status === status;

      return matchesSearch && matchesCategory && matchesLocation && matchesStatus;
    });

    renderItems(filtered);
  }

  if (searchInput) {
    searchInput.addEventListener('input', applyFilters);
    filterCategory.addEventListener('change', applyFilters);
    filterLocation.addEventListener('change', applyFilters);
    filterStatus.addEventListener('change', applyFilters);
  }

  window.resetFilters = function() {
    searchInput.value = '';
    filterCategory.value = 'all';
    filterLocation.value = 'all';
    filterStatus.value = 'all';
    renderItems(allItems);
  };

  // Run fetch on load
  if (container) fetchAllItems();
});
