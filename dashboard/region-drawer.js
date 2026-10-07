/**
 * Region Drawer Module
 * Renders the sliding regional drill-down analytics panel on region select.
 */

let activeRegion = null;
let drawerElement = null;

// Listen for region selection
window.addEventListener('dashboard:region-select', (e) => {
    const region = e.detail.region;
    activeRegion = region;
    
    if (region) {
        showRegionDrawer(region);
    } else {
        hideRegionDrawer();
    }
});

// Update drawer if new heatmap data arrives
window.addEventListener('data:heatmap', (e) => {
    if (activeRegion) {
        updateDrawerStats(e.detail[activeRegion] || { score: 0, count: 0 });
    }
});

function showRegionDrawer(region) {
    if (!drawerElement) {
        createDrawerElement();
    }
    
    // Set title
    const titleEl = drawerElement.querySelector('.region-drawer-title');
    titleEl.innerText = region;
    
    // Get stats from current heatmap data
    const stats = (window.currentData && window.currentData[region]) || { score: 0, count: 0 };
    updateDrawerStats(stats);
    
    // Populate dynamic hashtags for this region
    populateRegionalHashtags(region);
    
    // Slide in
    drawerElement.style.display = 'flex';
    gsap.killTweensOf(drawerElement);
    gsap.fromTo(drawerElement, 
        { x: '-110%', opacity: 0 }, 
        { x: '0%', opacity: 1, duration: 0.5, ease: 'power3.out' }
    );
}

function hideRegionDrawer() {
    if (!drawerElement) return;
    
    gsap.killTweensOf(drawerElement);
    gsap.to(drawerElement, {
        x: '-110%',
        opacity: 0,
        duration: 0.4,
        ease: 'power3.in',
        onComplete: () => {
            drawerElement.style.display = 'none';
        }
    });
}

function createDrawerElement() {
    drawerElement = document.createElement('div');
    drawerElement.id = 'region-drawer';
    drawerElement.className = 'region-drawer';
    drawerElement.innerHTML = `
        <button class="region-drawer-close">&times;</button>
        <div class="region-drawer-header">
            <span class="region-drawer-subtitle">Zoom Régional</span>
            <h2 class="region-drawer-title">Casablanca-Settat</h2>
        </div>
        <div class="region-drawer-body" style="display: flex; flex-direction: column; height: 100%; overflow-y: auto; padding-right: 4px;">
            <div class="region-stat-grid">
                <div class="region-stat-card">
                    <span class="stat-label">Volume Posts</span>
                    <h3 class="stat-value" id="region-post-count">0</h3>
                </div>
                <div class="region-stat-card">
                    <span class="stat-label">Index Sentiment</span>
                    <h3 class="stat-value" id="region-sentiment-score">0.0</h3>
                </div>
            </div>
            
            <div class="region-emotions-section" style="margin-bottom: 2rem;">
                <h4 style="font-size: 0.85rem; text-transform: uppercase; color: var(--text-muted); margin: 0 0 0.8rem 0; letter-spacing: 0.08em;">Distribution Émotionnelle</h4>
                <div id="region-emotions-bars" style="display: flex; flex-direction: column; gap: 0.7rem;">
                    <!-- Dynamic emotion progress bars -->
                </div>
            </div>
            
            <div class="region-hashtags-section" style="margin-bottom: 2rem;">
                <h4>Tendances Locales</h4>
                <div class="region-hashtags-cloud" id="region-hashtags-cloud">
                    <!-- Hashtags populated dynamically -->
                </div>
            </div>
            
            <div class="region-action-section" style="margin-top: auto; padding-top: 1.5rem;">
                <p style="font-size: 0.8rem; color: var(--text-muted); line-height: 1.4;">
                    * Le flux de messages en direct à droite est filtré pour n'afficher que les rapports provenant de cette région administrative.
                </p>
            </div>
        </div>
    `;
    
    document.body.appendChild(drawerElement);
    
    // Bind close button
    const closeBtn = drawerElement.querySelector('.region-drawer-close');
    closeBtn.style.zIndex = '100'; // Ensure it's clickable
    closeBtn.addEventListener('click', () => {
        window.dispatchEvent(new CustomEvent('dashboard:region-deselect'));
        hideRegionDrawer();
    });
}

function updateDrawerStats(stats) {
    if (!drawerElement) return;
    
    const countEl = drawerElement.querySelector('#region-post-count');
    const scoreEl = drawerElement.querySelector('#region-sentiment-score');
    
    countEl.innerText = stats.count.toLocaleString();
    
    const score = stats.score || 0;
    scoreEl.innerText = `${score > 0 ? '+' : ''}${score.toFixed(2)}`;
    
    // Color sentiment score
    if (score > 0) {
        scoreEl.style.color = 'var(--accent-teal)';
    } else if (score < 0) {
        scoreEl.style.color = 'var(--accent-red)';
    } else {
        scoreEl.style.color = 'var(--text-muted)';
    }
    
    // Render emotion meters
    const emotionsContainer = drawerElement.querySelector('#region-emotions-bars');
    if (emotionsContainer) {
        emotionsContainer.innerHTML = '';
        const emotions = stats.emotions || { "Pride/Joy": 0, "Grievance": 0, "Concern": 0, "Peace": 0, "Neutral": 0 };
        const total = Object.values(emotions).reduce((a, b) => a + b, 0) || 1;
        
        const emotionColors = {
            "Pride/Joy": "linear-gradient(90deg, #00d2ff 0%, #00f2fe 100%)",
            "Grievance": "linear-gradient(90deg, #ff0844 0%, #ffb199 100%)",
            "Concern": "linear-gradient(90deg, #f39c12 0%, #f1c40f 100%)",
            "Peace": "linear-gradient(90deg, #11998e 0%, #38ef7d 100%)",
            "Neutral": "linear-gradient(90deg, #bdc3c7 0%, #7f8c8d 100%)"
        };
        const emotionLabels = {
            "Pride/Joy": "🇲🇦 Fierté / Joie",
            "Grievance": "⚠️ Griefs",
            "Concern": "🔍 Soucis",
            "Peace": "🕊️ Paix / Calme",
            "Neutral": "📊 Neutre"
        };
        
        // Render each emotion row sorted alphabetically for UI consistency
        const sortedEmotions = Object.entries(emotions).sort((a, b) => a[0].localeCompare(b[0]));
        sortedEmotions.forEach(([emo, count]) => {
            const pct = ((count / total) * 100).toFixed(0);
            const row = document.createElement('div');
            row.style.display = 'flex';
            row.style.flexDirection = 'column';
            row.style.gap = '0.3rem';
            row.innerHTML = `
                <div style="display: flex; justify-content: space-between; font-size: 0.75rem; color: var(--text-muted);">
                    <span style="font-weight: 500;">${emotionLabels[emo] || emo}</span>
                    <span style="font-weight: bold; color: var(--text-primary);">${pct}% (${count})</span>
                </div>
                <div style="width: 100%; height: 6px; background: rgba(255,255,255,0.03); border-radius: 10px; overflow: hidden; border: 1px solid rgba(255,255,255,0.05); position: relative;">
                    <div style="width: ${pct}%; height: 100%; background: ${emotionColors[emo] || '#fff'}; border-radius: 10px; transition: width 0.4s ease-out;"></div>
                </div>
            `;
            emotionsContainer.appendChild(row);
        });
    }
}

function populateRegionalHashtags(region) {
    if (!drawerElement) return;
    
    const cloud = drawerElement.querySelector('#region-hashtags-cloud');
    cloud.innerHTML = '';
    
    // Scan all loaded feed cards to collect hashtags specific to this region!
    const feedContainer = document.getElementById('feed-container');
    if (!feedContainer) return;
    
    const hashtagsCount = {};
    const cards = Array.from(feedContainer.children);
    
    cards.forEach(card => {
        if (card.dataset.region === region) {
            // Find hashtags in post text
            const textEl = card.querySelector('.feed-text');
            if (textEl) {
                const words = textEl.innerText.split(/\s+/);
                words.forEach(word => {
                    if (word.startsWith('#')) {
                        const tag = word.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g,"");
                        if (tag.length > 1) {
                            hashtagsCount[tag] = (hashtagsCount[tag] || 0) + 1;
                        }
                    }
                });
            }
        }
    });
    
    // If no hashtags found in loaded cards, fall back to region name keywords
    let topTags = Object.entries(hashtagsCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(entry => entry[0]);
        
    if (topTags.length === 0) {
        // Fallback trending regional topics
        const cleanedRegion = region.replace(/\s+/g, '');
        topTags = [`#${cleanedRegion}`, '#Maroc', '#Sentiment', '#BigData', '#LiveAnalytics'];
    }
    
    // Render tag chips
    topTags.forEach(tag => {
        const chip = document.createElement('span');
        chip.className = 'region-hashtag-chip';
        chip.innerText = tag;
        cloud.appendChild(chip);
    });
}
