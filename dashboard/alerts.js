/**
 * Alerts and Trends Module
 * Handles anomaly alerts (left column) and trending hashtags/regions (right column).
 */

let maxAlerts = 5;

/**
 * Updates the alert log with new anomalies.
 * @param {Array} alertsData Array of alert objects.
 */
function updateAlerts(alertsData) {
    const container = document.getElementById('alerts-container');
    if (!container || !alertsData) return;

    alertsData.reverse().forEach(alert => {
        // Prevent duplicate rendering
        if (document.getElementById(`alert-${alert.id}`)) return;

        const row = document.createElement('div');
        row.className = 'alert-row';
        row.id = `alert-${alert.id}`;
        
        const isCritical = alert.message.includes('200%');
        const icon = isCritical ? '<span class="warning-rotate" style="display:inline-block">⚠️</span>' : '⚠️';

        row.innerHTML = `
            <strong>${icon} ${alert.type}</strong>
            <div style="font-size: 0.8rem; margin-top: 4px; color: var(--text-primary);">${alert.message}</div>
        `;

        // Prepend new alert
        container.insertBefore(row, container.firstChild);

        // Entrance animation
        const entranceTween = gsap.fromTo(row, { x: -30, opacity: 0 }, { x: 0, opacity: 1, duration: 0.5, ease: "power2.out" });
        if (typeof flashBackground === 'function') {
            flashBackground(row, 'rgba(226,75,74,0.15)', 0.8);
        }

        // Cleanup oldest
        if (container.children.length > maxAlerts) {
            const oldRow = container.lastElementChild;
            const removeTween = gsap.to(oldRow, { opacity: 0, scaleY: 0, transformOrigin: 'top', duration: 0.3, onComplete: () => oldRow.remove() });
        }
    });
}

/**
 * Updates the trending hashtags using Flip for reordering animations.
 * @param {Array} hashtagsData Array of hashtag objects.
 */
function updateHashtags(hashtagsData) {
    const container = document.getElementById('hashtags-container');
    if (!container || !hashtagsData) return;

    // FIX: 4 — Ensure title exists
    if (!container.querySelector('h3')) {
        const title = document.createElement('h3');
        title.innerText = "Top Hashtags";
        title.style.fontSize = "0.75rem";
        title.style.color = "var(--text-muted)";
        title.style.textTransform = "uppercase";
        title.style.marginBottom = "0.8rem";
        title.style.letterSpacing = "0.05em";
        container.appendChild(title);
    }
    // MANUAL FLIP PATTERN: We use Flip to reorder DOM elements without hardcoding position logic.
    // By getting the bounding boxes of `.hashtag-card`s before mutation, 
    // we can calculate the delta in X/Y space after sorting the DOM,
    // and seamlessly animate them from their old absolute positions to the new flow positions.
    const state = Flip.getState(".hashtag-card");

    // We'll map existing elements by tag
    const existingCards = Array.from(container.querySelectorAll('.hashtag-card'));
    const cardsMap = new Map();
    existingCards.forEach(c => cardsMap.set(c.dataset.tag, c));

    hashtagsData.slice(0, 5).forEach((item, index) => {
        let card = cardsMap.get(item.tag);
        
        if (!card) {
            // Create new
            card = document.createElement('div');
            card.className = 'hashtag-card';
            card.dataset.tag = item.tag;
            card.style.willChange = 'transform, opacity';
            card.style.background = 'var(--bg-elevated)';
            card.style.padding = '0.5rem';
            card.style.borderRadius = '6px';
            card.style.marginBottom = '0.5rem';
            card.style.display = 'flex';
            card.style.justifyContent = 'space-between';
            card.style.alignItems = 'center';
            
            card.innerHTML = `
                <div>
                    <span style="color: var(--text-muted); font-size: 0.8rem; width: 15px; display: inline-block;">${index + 1}</span>
                    <strong style="color: var(--accent-blue);">${item.tag}</strong>
                </div>
                <div style="font-size: 0.8rem;">
                    <span class="count-val">${item.count}</span> posts
                </div>
            `;
            container.appendChild(card);
        } else {
            // Update existing
            card.querySelector('.count-val').innerText = item.count;
            // Ensure order in DOM
            container.appendChild(card); 
            cardsMap.delete(item.tag);
        }
    });

    // Remove cards that are no longer in top 5
    cardsMap.forEach(card => card.remove());

    // Animate the reordering
    const flipTween = Flip.from(state, {
        duration: 0.6,
        ease: "power2.inOut",
        absolute: true, // Use absolute positioning during flip
        onEnter: elements => gsap.fromTo(elements, {opacity: 0, scale: 0.9}, {opacity: 1, scale: 1, duration: 0.4}),
        onLeave: elements => gsap.to(elements, {opacity: 0, scale: 0.9, duration: 0.4})
    });
}

// Event Listeners
window.addEventListener('data:alerts', (e) => {
    window.lastRawAlertsData = e.detail;
    if (typeof window.isFilterActive === 'function' && window.isFilterActive()) {
        if (typeof applyGlobalSearchFilter === 'function') applyGlobalSearchFilter();
    } else {
        updateAlerts(e.detail);
    }
});
window.addEventListener('data:hashtags', (e) => {
    window.lastRawHashtagsData = e.detail;
    
    // Dynamic Dropdown Option Population
    const hashtagSelect = document.getElementById('filter-hashtag-select');
    if (hashtagSelect && e.detail) {
        const currentValue = hashtagSelect.value;
        hashtagSelect.innerHTML = '<option value="">Tous les Hashtags</option>';
        e.detail.forEach(h => {
            const option = document.createElement('option');
            option.value = h.tag;
            option.innerText = `# ${h.tag.replace('#', '')}`;
            hashtagSelect.appendChild(option);
        });
        hashtagSelect.value = currentValue; // preserve selection
    }

    if (typeof window.isFilterActive === 'function' && window.isFilterActive()) {
        if (typeof applyGlobalSearchFilter === 'function') applyGlobalSearchFilter();
    } else {
        updateHashtags(e.detail);
    }
});
