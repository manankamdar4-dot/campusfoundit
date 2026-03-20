// ─── report-found.js ───
// Form submission logic for the report-found.html page.

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('reportFoundForm');
  const loadingOverlay = document.getElementById('loadingOverlay');
  const submitBtn = document.getElementById('submitBtn');

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      // Basic client-side validation
      const requiredFields = form.querySelectorAll('[required]');
      let isValid = true;
      
      requiredFields.forEach(field => {
        if (!field.value.trim()) {
          isValid = false;
          field.parentElement.classList.add('error');
        } else {
          field.parentElement.classList.remove('error');
        }
      });

      if (!isValid) {
        if (typeof showToast === 'function') {
          showToast('Please fill in all required fields.', 'error');
        }
        return;
      }

      // Prepare data for submission
      const formData = new FormData(form);

      // Show loading
      loadingOverlay.classList.add('active');
      submitBtn.disabled = true;

      try {
        const response = await fetch(`${CONFIG.API_BASE_URL}/api/found`, {
          method: 'POST',
          body: formData
        });

        const data = await response.json();

        // Hide loading
        loadingOverlay.classList.remove('active');
        submitBtn.disabled = false;

        if (data.success) {
          if (typeof showToast === 'function') {
            showToast('Found report submitted successfully!', 'success');
          }
          
          // Redirect to success page
          window.location.href = 'success.html?type=found';
        } else {
          if (typeof showToast === 'function') {
            showToast(data.message || 'Submission failed. Please try again.', 'error');
          }
        }
      } catch (error) {
        console.error('Error submitting found report:', error);
        
        // Hide loading and show error
        loadingOverlay.classList.remove('active');
        submitBtn.disabled = false;
        
        if (typeof showToast === 'function') {
          showToast('Server error. Could not connect to the backend.', 'error');
        }
      }
    });
  }
});
