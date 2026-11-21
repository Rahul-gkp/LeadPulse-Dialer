(() => {
  const STORAGE_KEY_LEADS = 'leadpulse_leads_v1';
  const STORAGE_KEY_FILENAME = 'leadpulse_filename_v1';
  const STORAGE_KEY_WEBHOOK = 'leadpulse_webhook_v1';

  let leads = [];
  let filteredIndices = [];
  let activeLeadIndex = 0; // Index inside the main `leads` array
  let currentFilter = 'All';
  let searchQuery = '';
  let currentFileName = window.DEFAULT_CSV_FILENAME || 'leads.csv';
  let webhookUrl = localStorage.getItem(STORAGE_KEY_WEBHOOK) || '';

  // DOM Elements
  const elFileName = document.getElementById('activeFileName');
  const elCsvInput = document.getElementById('csvFileInput');
  const elExportBtn = document.getElementById('btnExportCsv');
  const elSearchInput = document.getElementById('searchInput');
  const elFilterPills = document.getElementById('filterPills');
  const elLeadList = document.getElementById('leadList');

  const elEmptyState = document.getElementById('emptyState');
  const elActiveCard = document.getElementById('activeLeadCard');
  const elLeadCounter = document.getElementById('leadCounter');
  const elLeadName = document.getElementById('leadName');
  const elLeadSubtext = document.getElementById('leadSubtext');
  const elLeadCategoryBadge = document.getElementById('leadCategoryBadge');
  const elLeadRatingBadge = document.getElementById('leadRatingBadge');
  const elLeadStatusBadge = document.getElementById('leadStatusBadge');
  const elBtnCallNow = document.getElementById('btnCallNow');
  const elCallBtnText = document.getElementById('callBtnText');
  const elBtnWhatsApp = document.getElementById('btnWhatsApp');
  const elDynamicDetailsGrid = document.getElementById('dynamicDetailsGrid');

  const elStatusSelector = document.getElementById('statusSelector');
  const elRemarksTextarea = document.getElementById('remarksTextarea');
  const elSaveIndicator = document.getElementById('saveIndicator');
  const elBtnSaveOnly = document.getElementById('btnSaveOnly');
  const elBtnSaveAndNext = document.getElementById('btnSaveAndNext');
  const elBtnPrevLead = document.getElementById('btnPrevLead');
  const elBtnNextLead = document.getElementById('btnNextLead');

  // Stats Elements
  const elStatTotal = document.getElementById('statTotal');
  const elStatPending = document.getElementById('statPending');
  const elStatInterested = document.getElementById('statInterested');
  const elStatFollowup = document.getElementById('statFollowup');
  const elStatClosed = document.getElementById('statClosed');

  // Modal Elements
  const elSyncModal = document.getElementById('syncModal');
  const elBtnGoogleSyncModal = document.getElementById('btnGoogleSyncModal');
  const elBtnCloseModal = document.getElementById('btnCloseModal');
  const elWebhookInput = document.getElementById('webhookUrlInput');
  const elBtnSaveWebhook = document.getElementById('btnSaveWebhook');
  const elBtnClearWebhook = document.getElementById('btnClearWebhook');
  const elSyncDot = document.getElementById('syncDot');
  const elToast = document.getElementById('toast');

  // Smart column finder: works for ANY CSV column naming convention!
  function findColumnKey(row, candidates) {
    const keys = Object.keys(row);
    for (const candidate of candidates) {
      const exact = keys.find(k => k.trim().toLowerCase() === candidate.toLowerCase());
      if (exact) return exact;
    }
    for (const candidate of candidates) {
      const partial = keys.find(k => k.trim().toLowerCase().includes(candidate.toLowerCase()));
      if (partial) return partial;
    }
    return null;
  }

  function getLeadField(row, type) {
    if (!row) return '';
    switch (type) {
      case 'name': {
        const key = findColumnKey(row, ['Name', 'Business Name', 'Title', 'Company', 'Lead', 'Full Name', 'Client']);
        return key ? String(row[key] || '').trim() : Object.values(row)[0] || 'Unnamed Lead';
      }
      case 'phone': {
        const key = findColumnKey(row, ['Phone', 'Mobile', 'Contact', 'Phone Number', 'Tel', 'WhatsApp', 'Number']);
        return key ? String(row[key] || '').trim() : '';
      }
      case 'category': {
        // Notice in Google Maps scrapers sometimes Address holds specialty ("Dental clinic") and Category holds rating ("4.9")
        const addrKey = findColumnKey(row, ['Address', 'Specialty', 'Category', 'Type', 'Industry', 'Department']);
        const catKey = findColumnKey(row, ['Category', 'Type', 'Specialty']);
        const addrVal = addrKey ? String(row[addrKey] || '').trim() : '';
        const catVal = catKey ? String(row[catKey] || '').trim() : '';
        if (catVal && isNaN(Number(catVal)) && catVal.toLowerCase() !== 'no reviews') return catVal;
        if (addrVal) return addrVal;
        return 'General Lead';
      }
      case 'rating': {
        const key = findColumnKey(row, ['Rating', 'Stars', 'Score']);
        return key ? String(row[key] || '').trim() : '';
      }
      case 'reviews': {
        const key = findColumnKey(row, ['Reviews', 'Review Count', 'Total Reviews']);
        return key ? String(row[key] || '').trim() : '';
      }
      case 'website': {
        const key = findColumnKey(row, ['Website', 'Web', 'URL', 'Site', 'Link']);
        const val = key ? String(row[key] || '').trim() : '';
        if (val.startsWith('https://www.google.com/aclk')) return '';
        return val;
      }
      case 'maps': {
        const key = findColumnKey(row, ['Maps URL', 'Google Maps', 'Map', 'Location URL']);
        return key ? String(row[key] || '').trim() : '';
      }
      default:
        return '';
    }
  }

  function normalizeRows(rawRows) {
    return rawRows
      .filter(row => Object.values(row).some(v => String(v || '').trim() !== ''))
      .map(row => {
        const cleanRow = { ...row };
        // Ensure Status and Remarks columns always exist on every row
        const statusKey = findColumnKey(cleanRow, ['Status', 'Call Status', 'Outcome']) || 'Status';
        const remarksKey = findColumnKey(cleanRow, ['Remarks', 'Remark', 'Notes', 'Comment', 'Feedback']) || 'Remarks';

        if (!cleanRow[statusKey] || String(cleanRow[statusKey]).trim() === '') {
          cleanRow[statusKey] = 'Pending';
        }
        if (cleanRow[remarksKey] === undefined || cleanRow[remarksKey] === null) {
          cleanRow[remarksKey] = '';
        }

        // Standardize internal access keys while keeping all original columns intact for export
        if (statusKey !== 'Status') {
          cleanRow['Status'] = cleanRow[statusKey];
        }
        if (remarksKey !== 'Remarks') {
          cleanRow['Remarks'] = cleanRow[remarksKey];
        }
        return cleanRow;
      });
  }

  function init() {
    const savedLeads = localStorage.getItem(STORAGE_KEY_LEADS);
    const savedName = localStorage.getItem(STORAGE_KEY_FILENAME);

    if (savedLeads) {
      try {
        leads = JSON.parse(savedLeads);
        currentFileName = savedName || currentFileName;
      } catch (e) {
        leads = normalizeRows(window.DEFAULT_LEADS || []);
      }
    } else {
      leads = normalizeRows(window.DEFAULT_LEADS || []);
    }

    elFileName.textContent = currentFileName;
    updateSyncDot();
    applyFilters();
    bindEvents();
  }

  function saveToLocalStorage() {
    localStorage.setItem(STORAGE_KEY_LEADS, JSON.stringify(leads));
    localStorage.setItem(STORAGE_KEY_FILENAME, currentFileName);
  }

  function showToast(msg) {
    elToast.textContent = msg;
    elToast.classList.remove('hidden');
    clearTimeout(window._toastTimer);
    window._toastTimer = setTimeout(() => {
      elToast.classList.add('hidden');
    }, 2600);
  }

  function updateStats() {
    const total = leads.length;
    let pending = 0;
    let interested = 0;
    let followup = 0;
    let closed = 0;

    leads.forEach(l => {
      const s = (l.Status || 'Pending').toLowerCase();
      if (s === 'interested') interested++;
      else if (s === 'follow-up') followup++;
      else if (s === 'not interested' || s === 'no answer') closed++;
      else pending++;
    });

    elStatTotal.textContent = total;
    elStatPending.textContent = pending;
    elStatInterested.textContent = interested;
    elStatFollowup.textContent = followup;
    elStatClosed.textContent = closed;
  }

  function applyFilters() {
    const q = searchQuery.toLowerCase().trim();
    filteredIndices = [];

    leads.forEach((lead, idx) => {
      const status = lead.Status || 'Pending';
      const matchesFilter = currentFilter === 'All' || status.toLowerCase() === currentFilter.toLowerCase();

      if (!matchesFilter) return;

      if (!q) {
        filteredIndices.push(idx);
        return;
      }

      const combinedText = Object.values(lead).join(' ').toLowerCase();
      if (combinedText.includes(q)) {
        filteredIndices.push(idx);
      }
    });

    updateStats();
    renderLeadList();

    if (filteredIndices.length === 0) {
      elEmptyState.classList.remove('hidden');
      elActiveCard.classList.add('hidden');
    } else {
      elEmptyState.classList.add('hidden');
      elActiveCard.classList.remove('hidden');
      if (!filteredIndices.includes(activeLeadIndex)) {
        activeLeadIndex = filteredIndices[0];
      }
      renderActiveLead();
    }
  }

  function getStatusClass(status) {
    const s = (status || 'Pending').toLowerCase();
    if (s === 'interested') return 'status-interested';
    if (s === 'follow-up') return 'status-follow-up';
    if (s === 'not interested') return 'status-not-interested';
    if (s === 'no answer') return 'status-no-answer';
    return 'status-pending';
  }

  function renderLeadList() {
    elLeadList.innerHTML = '';
    const fragment = document.createDocumentFragment();

    filteredIndices.forEach(idx => {
      const lead = leads[idx];
      const name = getLeadField(lead, 'name');
      const phone = getLeadField(lead, 'phone') || 'No phone';
      const category = getLeadField(lead, 'category');
      const status = lead.Status || 'Pending';
      const remark = (lead.Remarks || '').trim();

      const item = document.createElement('div');
      item.className = `lead-item ${idx === activeLeadIndex ? 'active' : ''}`;
      item.dataset.index = idx;

      item.innerHTML = `
        <div class="lead-item-top">
          <span class="lead-item-name">${escapeHtml(name)}</span>
          <span class="badge badge-status ${getStatusClass(status)}">${escapeHtml(status)}</span>
        </div>
        <div class="lead-item-meta">
          <span>${escapeHtml(phone)}</span>
          <span>${escapeHtml(category)}</span>
        </div>
        ${remark ? `<div class="lead-item-remark">📝 ${escapeHtml(remark)}</div>` : ''}
      `;

      item.addEventListener('click', () => {
        activeLeadIndex = idx;
        renderLeadList();
        renderActiveLead();
      });

      fragment.appendChild(item);
    });

    elLeadList.appendChild(fragment);
  }

  function formatCleanIndianPhone(rawPhone) {
    const digits = rawPhone.replace(/\D/g, '');
    if (!digits) return '';
    if (digits.length === 10) return '91' + digits;
    if (digits.length === 11 && digits.startsWith('0')) return '91' + digits.slice(1);
    return digits;
  }

  function renderActiveLead() {
    const lead = leads[activeLeadIndex];
    if (!lead) return;

    const posInFiltered = filteredIndices.indexOf(activeLeadIndex) + 1;
    elLeadCounter.textContent = `Lead ${posInFiltered} of ${filteredIndices.length} (Sheet Row #${activeLeadIndex + 1})`;

    const name = getLeadField(lead, 'name');
    const phone = getLeadField(lead, 'phone');
    const category = getLeadField(lead, 'category');
    const rating = getLeadField(lead, 'rating');
    const reviews = getLeadField(lead, 'reviews');
    const status = lead.Status || 'Pending';

    elLeadName.textContent = name;
    elLeadSubtext.textContent = `Sheet Row #${activeLeadIndex + 1}`;
    elLeadCategoryBadge.textContent = category;

    if (rating && !isNaN(Number(rating))) {
      elLeadRatingBadge.classList.remove('hidden');
      elLeadRatingBadge.textContent = `★ ${rating}${reviews ? ` (${reviews} reviews)` : ''}`;
    } else {
      elLeadRatingBadge.classList.add('hidden');
    }

    elLeadStatusBadge.textContent = status;
    elLeadStatusBadge.className = `badge badge-status ${getStatusClass(status)}`;

    // Call & WhatsApp buttons
    if (phone) {
      const dialNumber = phone.replace(/[^+\d]/g, '');
      elBtnCallNow.href = `tel:${dialNumber}`;
      elCallBtnText.textContent = `Call ${phone}`;
      elBtnCallNow.classList.remove('disabled');

      const waDigits = formatCleanIndianPhone(phone);
      const waMsg = encodeURIComponent(`Hello ${name}, I reached out regarding your online presence and digital growth.`);
      elBtnWhatsApp.href = `https://wa.me/${waDigits}?text=${waMsg}`;
      elBtnWhatsApp.classList.remove('disabled');
    } else {
      elBtnCallNow.href = '#';
      elCallBtnText.textContent = 'No Phone Number';
      elBtnCallNow.classList.add('disabled');
      elBtnWhatsApp.href = '#';
      elBtnWhatsApp.classList.add('disabled');
    }

    // Render all sheet columns dynamically so any CSV structure shows cleanly
    elDynamicDetailsGrid.innerHTML = '';
    const skipKeys = new Set(['Status', 'Remarks', 'Scanned At']);

    Object.entries(lead).forEach(([key, val]) => {
      if (skipKeys.has(key)) return;
      const strVal = String(val || '').trim();
      if (!strVal) return;
      if (key.toLowerCase() === 'category' && !isNaN(Number(strVal))) return; // Already shown in rating badge

      const box = document.createElement('div');
      box.className = 'detail-box';

      let valueHtml = escapeHtml(strVal);
      if (strVal.startsWith('http://') || strVal.startsWith('https://')) {
        const label = key.toLowerCase().includes('map') ? 'Open Google Maps ↗' : 'Visit Link ↗';
        valueHtml = `<a href="${escapeHtml(strVal)}" target="_blank" rel="noopener noreferrer">${label}</a>`;
      }

      box.innerHTML = `
        <div class="detail-key">${escapeHtml(key)}</div>
        <div class="detail-val">${valueHtml}</div>
      `;
      elDynamicDetailsGrid.appendChild(box);
    });

    // Update Status Selector buttons
    document.querySelectorAll('.status-btn').forEach(btn => {
      btn.classList.toggle('selected', btn.dataset.status.toLowerCase() === status.toLowerCase());
    });

    // Update Remarks textarea
    elRemarksTextarea.value = lead.Remarks || '';
    elSaveIndicator.textContent = 'Synced locally';
  }

  async function saveCurrentLead(moveNext = false) {
    const lead = leads[activeLeadIndex];
    if (!lead) return;

    const selectedBtn = document.querySelector('.status-btn.selected');
    const newStatus = selectedBtn ? selectedBtn.dataset.status : (lead.Status || 'Pending');
    const newRemarks = elRemarksTextarea.value.trim();

    lead.Status = newStatus;
    lead.Remarks = newRemarks;

    saveToLocalStorage();
    updateStats();
    renderLeadList();
    renderActiveLead();

    elSaveIndicator.textContent = 'Saved ✓';
    showToast(`Updated "${getLeadField(lead, 'name')}" (${newStatus})`);

    // Optional live sync to Google Sheets via Apps Script Webhook
    if (webhookUrl) {
      elSaveIndicator.textContent = 'Syncing to Google Sheet...';
      try {
        await fetch(webhookUrl, {
          method: 'POST',
          mode: 'no-cors',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            rowIndex: activeLeadIndex,
            name: getLeadField(lead, 'name'),
            phone: getLeadField(lead, 'phone'),
            status: newStatus,
            remarks: newRemarks
          })
        });
        elSaveIndicator.textContent = 'Synced to Google Sheet ✓';
      } catch (err) {
        elSaveIndicator.textContent = 'Saved locally (Sheet offline)';
      }
    }

    if (moveNext) {
      goToNextLead();
    }
  }

  function goToNextLead() {
    const pos = filteredIndices.indexOf(activeLeadIndex);
    if (pos !== -1 && pos < filteredIndices.length - 1) {
      activeLeadIndex = filteredIndices[pos + 1];
      renderLeadList();
      renderActiveLead();
    } else if (filteredIndices.length > 0) {
      activeLeadIndex = filteredIndices[0];
      renderLeadList();
      renderActiveLead();
      showToast('Reached end of list — looped back to #1');
    }
  }

  function goToPrevLead() {
    const pos = filteredIndices.indexOf(activeLeadIndex);
    if (pos > 0) {
      activeLeadIndex = filteredIndices[pos - 1];
      renderLeadList();
      renderActiveLead();
    }
  }

  function handleCsvUpload(file) {
    if (!file) return;
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (!results.data || results.data.length === 0) {
          showToast('Uploaded CSV appears empty!');
          return;
        }
        leads = normalizeRows(results.data);
        currentFileName = file.name;
        activeLeadIndex = 0;
        currentFilter = 'All';
        searchQuery = '';
        elSearchInput.value = '';
        document.querySelectorAll('.pill').forEach(p => p.classList.toggle('active', p.dataset.filter === 'All'));

        elFileName.textContent = currentFileName;
        saveToLocalStorage();
        applyFilters();
        showToast(`Loaded ${leads.length} leads from ${file.name}`);
      },
      error: (err) => {
        showToast('Error reading CSV: ' + err.message);
      }
    });
  }

  function exportUpdatedCsv() {
    if (!leads.length) return;
    const csvString = Papa.unparse(leads);
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const baseName = currentFileName.replace(/\.csv$/i, '');
    link.href = url;
    link.download = `${baseName}_updated_remarks.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast('Exported updated CSV with Remarks!');
  }

  function updateSyncDot() {
    elSyncDot.classList.toggle('connected', Boolean(webhookUrl));
    elWebhookInput.value = webhookUrl;
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function bindEvents() {
    // CSV File Upload
    elCsvInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      handleCsvUpload(file);
      e.target.value = '';
    });

    // Export CSV
    elExportBtn.addEventListener('click', exportUpdatedCsv);

    // Search
    elSearchInput.addEventListener('input', (e) => {
      searchQuery = e.target.value;
      applyFilters();
    });

    // Filter Pills
    elFilterPills.addEventListener('click', (e) => {
      const pill = e.target.closest('.pill');
      if (!pill) return;
      document.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      currentFilter = pill.dataset.filter;
      applyFilters();
    });

    // Status Buttons
    elStatusSelector.addEventListener('click', (e) => {
      const btn = e.target.closest('.status-btn');
      if (!btn) return;
      document.querySelectorAll('.status-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      elSaveIndicator.textContent = 'Unsaved changes...';
    });

    // Quick Remark Chips
    document.querySelectorAll('.chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const current = elRemarksTextarea.value.trim();
        const addition = chip.dataset.text;
        elRemarksTextarea.value = current ? `${current} | ${addition}` : addition;
        elSaveIndicator.textContent = 'Unsaved changes...';
      });
    });

    // Remarks Input typing indicator
    elRemarksTextarea.addEventListener('input', () => {
      elSaveIndicator.textContent = 'Unsaved changes...';
    });

    // Save Buttons
    elBtnSaveOnly.addEventListener('click', () => saveCurrentLead(false));
    elBtnSaveAndNext.addEventListener('click', () => saveCurrentLead(true));

    // Prev / Next Navigation
    elBtnPrevLead.addEventListener('click', goToPrevLead);
    elBtnNextLead.addEventListener('click', goToNextLead);

    // Modal controls
    elBtnGoogleSyncModal.addEventListener('click', () => {
      elSyncModal.classList.remove('hidden');
    });
    elBtnCloseModal.addEventListener('click', () => {
      elSyncModal.classList.add('hidden');
    });
    elBtnSaveWebhook.addEventListener('click', () => {
      webhookUrl = elWebhookInput.value.trim();
      localStorage.setItem(STORAGE_KEY_WEBHOOK, webhookUrl);
      updateSyncDot();
      elSyncModal.classList.add('hidden');
      showToast(webhookUrl ? 'Google Sheet Sync connected!' : 'Webhook cleared');
    });
    elBtnClearWebhook.addEventListener('click', () => {
      webhookUrl = '';
      localStorage.removeItem(STORAGE_KEY_WEBHOOK);
      updateSyncDot();
      elSyncModal.classList.add('hidden');
      showToast('Disconnected Google Sheet Sync');
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
