/**
 * Main application entry point and animation orchestrator.
 */

// FIX: 5 — Explicitly register all plugins before any animation logic
try {
    gsap.registerPlugin(ScrollTrigger, Flip, MotionPathPlugin);
    console.log("FIX: 5 — GSAP Plugins registered");
} catch (e) {
    console.error("FIX: 5 — Failed to register GSAP plugins:", e);
}

let poller;

/**
 * Initializes the entire dashboard, starts polling, and runs entrance animations.
 */
function initDashboard() {
    console.log("FIX: 5 — Initializing Dashboard");
    
    // Initialize Data Poller
    if (!poller) {
        poller = new DataPoller();
        window.poller = poller; 
        poller.start();
    }

    // Setup Master Timeline
    const masterTL = gsap.timeline();

    // Handle prefers-reduced-motion via matchMedia
    const mm = gsap.matchMedia();

    mm.add("(prefers-reduced-motion: no-preference)", () => {
        // Entrance Animations
        const headerTween = gsap.fromTo(".app-header", 
            { opacity: 0, y: -50 }, 
            { opacity: 1, y: 0, duration: 0.8, ease: "power3.out" }
        );
        masterTL.add(headerTween, 0.0);

        const pipelineTween = gsap.fromTo(".pipeline-node", 
            { opacity: 0, scale: 0 }, 
            { opacity: 1, scale: 1, duration: 0.5, stagger: 0.15, ease: "back.out(1.7)" }
        );
        masterTL.add(pipelineTween, 0.3);

        const heatmapTween = gsap.fromTo(".heatmap-panel", 
            { opacity: 0, x: -30 }, 
            { opacity: 1, x: 0, duration: 1, ease: "power3.out" }
        );
        masterTL.add(heatmapTween, 0.8);

        const rightColumnTween = gsap.fromTo(".feed-panel, .velocity-panel, .alerts-panel", 
            { opacity: 0, x: 30 }, 
            { opacity: 1, x: 0, duration: 1, stagger: 0.2, ease: "power3.out" }
        );
        masterTL.add(rightColumnTween, 0.8);

        // Delayed triggers for specific module animations
        masterTL.add(() => {
            // Trigger heatmap region fill sequence
            window.dispatchEvent(new CustomEvent('ui:animateHeatmap'));
        }, 1.2);

        masterTL.add(() => {
            // Trigger Chart.js draw animation
            window.dispatchEvent(new CustomEvent('ui:animateCharts'));
        }, 1.5);

        masterTL.add(() => {
            // Stagger feed cards if they exist
            const feedTween = gsap.from(".feed-card", {
                opacity: 0,
                y: 20,
                stagger: 0.1,
                duration: 0.5,
                ease: "power2.out"
            });
        }, 1.8);
    });

    mm.add("(prefers-reduced-motion: reduce)", () => {
        // Simple opacity fade for reduced motion
        const reducedTween = gsap.to(".app-header, .panel, .pipeline-node", { 
            opacity: 1, 
            duration: 0.5, 
            stagger: 0.05 
        });
    });
}

// FIX: 5 — Add fallback listener in case body onload fails
window.addEventListener('DOMContentLoaded', initDashboard);

// Chaos Monkey Simulation Triggers
async function triggerChaosMonkey() {
    console.log("💥 Triggering Chaos Monkey...");
    try {
        const res = await fetch('/api/pipeline/crash', { method: 'POST' });
        const data = await res.json();
        console.log("Chaos Response:", data);
        
        // Hide crash button, show restore button
        document.getElementById('chaos-btn').style.display = 'none';
        document.getElementById('restore-btn').style.display = 'inline-block';
        
        // Trigger manual poll immediately to update the UI instantly
        if (window.poller) {
            window.poller.pollAll();
        }
    } catch (e) {
        console.error("Failed to trigger Chaos Monkey:", e);
    }
}

async function triggerChaosRestore() {
    console.log("🛠️ Restoring pipeline...");
    try {
        const res = await fetch('/api/pipeline/restore', { method: 'POST' });
        const data = await res.json();
        console.log("Restore Response:", data);
        
        // Hide restore button, show crash button
        document.getElementById('restore-btn').style.display = 'none';
        document.getElementById('chaos-btn').style.display = 'inline-block';
        
        // Trigger manual poll immediately to update the UI instantly
        if (window.poller) {
            window.poller.pollAll();
        }
    } catch (e) {
        console.error("Failed to restore pipeline:", e);
    }
}

// Initial Chaos Button Sync Check
document.addEventListener('DOMContentLoaded', async () => {
    try {
        const res = await fetch('/api/pipeline');
        const stages = await res.json();
        const hasError = stages.some(stage => stage.status === 'error');
        if (hasError) {
            document.getElementById('chaos-btn').style.display = 'none';
            document.getElementById('restore-btn').style.display = 'inline-block';
        } else {
            document.getElementById('chaos-btn').style.display = 'inline-block';
            document.getElementById('restore-btn').style.display = 'none';
        }
    } catch (e) {
        console.error("Failed to fetch initial pipeline status:", e);
    }

    // Initialize Interactive Post Feed Zooming
    setupFeedZoom();
});

/**
 * Binds click listeners and creates a visual toggle button in the header of the post feed
 * so users can zoom/expand the whole field to full screen using a premium Flip transition.
 */
function setupFeedZoom() {
    const feedPanel = document.getElementById("feed-panel");
    if (!feedPanel) return;

    feedPanel.classList.add("zoomable");

    // Inject dedicated zoom button into the panel header
    const header = feedPanel.querySelector(".panel-header");
    if (header) {
        const zoomBtn = document.createElement("button");
        zoomBtn.className = "zoom-btn";
        zoomBtn.id = "feed-zoom-btn";
        zoomBtn.innerHTML = "⛶ Maximize";
        zoomBtn.style.marginLeft = "auto";
        header.appendChild(zoomBtn);

        zoomBtn.addEventListener("click", (e) => {
            e.stopPropagation(); // Prevent double-toggle
            togglePanelZoom(feedPanel);
        });
    }

    // Zoom when clicking on the border or background directly
    feedPanel.addEventListener("click", (e) => {
        // Toggle only if clicked on the border/empty space/header rather than internal active post elements
        if (e.target === feedPanel || e.target.classList.contains("panel-header") || e.target.tagName === "H2") {
            togglePanelZoom(feedPanel);
        }
    });
}

/**
 * Maximizes/zooms a panel cleanly utilizing a gorgeous GSAP Flip animation transition.
 */
function togglePanelZoom(panel) {
    if (typeof Flip === 'undefined') {
        // Fallback in case Flip.js is not loaded
        panel.classList.toggle("maximized");
        document.body.classList.toggle("panel-maximized");
        const btn = document.getElementById("feed-zoom-btn");
        if (btn) {
            btn.innerHTML = panel.classList.contains("maximized") ? "✕ Close" : "⛶ Maximize";
        }
        return;
    }

    const state = Flip.getState(panel);
    const isMaximized = panel.classList.contains("maximized");

    if (isMaximized) {
        panel.classList.remove("maximized");
        document.body.classList.remove("panel-maximized");
        const btn = document.getElementById("feed-zoom-btn");
        if (btn) btn.innerHTML = "⛶ Maximize";
    } else {
        panel.classList.add("maximized");
        document.body.classList.add("panel-maximized");
        const btn = document.getElementById("feed-zoom-btn");
        if (btn) btn.innerHTML = "✕ Close";
    }

    // Animate smoothly between states
    Flip.from(state, {
        duration: 0.5,
        ease: "power2.out",
        absolute: true
    });
}

// Moroccan Subjects and keywords for live filtering matching subjects.json
const TOPIC_KEYWORDS = {
    "Transport & Infrastructures": ["transport", "traffic", "route", "autoroute", "tramway", "tgv", "oncf", "train", "voyageur", "gare", "accident", "routes", "circulation", "bus"],
    "Football & Sports": ["foot", "football", "match", "stade", "botola", "caf", "champions", "victoire", "équipe", "equipe", "qualification", "joueur", "coupe", "score", "maghrib", "dima"],
    "Services Publics & Tech": ["internet", "wifi", "connexion", "électricité", "electricite", "panne", "eau", "coupure", "app", "application", "glitch", "technologie", "réseau", "reseau", "walo", "walou"],
    "Tourisme & Culture": ["tourisme", "touriste", "coucher de soleil", "corniche", "médina", "medina", "plage", "surf", "festival", "mawazine", "atay", "thé", "the", "chebakia", "couscous", "vague", "cascades", "marrakech", "tanger", "fes", "agadir", "dakhla", "vacances"],
    "Économie & Pouvoir d'Achat": ["carburant", "prix", "inflation", "chômage", "chomage", "rentrée", "rentree", "scolaire", "coût", "cout", "vie", "location", "loger", "argent", "économie", "economie", "légumes", "legumes", "achat"]
};

// Helper to check if any dropdown select filter is active
function isFilterActive() {
    const topicSelect = document.getElementById("filter-topic-select");
    const hashtagSelect = document.getElementById("filter-hashtag-select");
    const activeTopic = topicSelect ? topicSelect.value : "";
    const activeHashtag = hashtagSelect ? hashtagSelect.value : "";
    return !!(activeTopic || activeHashtag);
}
window.isFilterActive = isFilterActive;

// Binds dropdown select change listeners
document.addEventListener('DOMContentLoaded', () => {
    const topicSelect = document.getElementById("filter-topic-select");
    const hashtagSelect = document.getElementById("filter-hashtag-select");
    
    if (topicSelect) {
        topicSelect.addEventListener("change", (e) => {
            // Pick one clears the other to prevent zero-results intersections
            if (e.target.value && hashtagSelect) {
                hashtagSelect.value = "";
            }
            applyGlobalSearchFilter();
        });
    }
    
    if (hashtagSelect) {
        hashtagSelect.addEventListener("change", (e) => {
            // Pick one clears the other to prevent zero-results intersections
            if (e.target.value && topicSelect) {
                topicSelect.value = "";
            }
            applyGlobalSearchFilter();
        });
    }
});

/**
 * Resets both dropdown select filters and restores baseline metrics globally.
 */
function clearGlobalSearch() {
    const topicSelect = document.getElementById("filter-topic-select");
    const hashtagSelect = document.getElementById("filter-hashtag-select");
    if (topicSelect) topicSelect.value = "";
    if (hashtagSelect) hashtagSelect.value = "";
    applyGlobalSearchFilter();
}
window.clearGlobalSearch = clearGlobalSearch;

/**
 * Centrally orchestrates and applies dropdown filters across ALL page widgets:
 * 1. Live Post Feed: Filter text content by active topic keywords or hashtag.
 * 2. Sentiment Heatmap: Re-aggregate regional sentiment indices dynamically based ONLY on matching posts.
 * 3. Geolocation Markers: Pulsate markers strictly for matching geolocated posts.
 * 4. Trend Velocity Chart: Dynamically re-estimate average velocities for filtered segments.
 * 5. Anomaly Alerts: Filter warning logs that match the active topic keywords or hashtag.
 * 6. Top Hashtags: Filter list of hashtags matching selected filters.
 */
function applyGlobalSearchFilter() {
    const topicSelect = document.getElementById("filter-topic-select");
    const hashtagSelect = document.getElementById("filter-hashtag-select");
    const activeTopic = topicSelect ? topicSelect.value : "";
    const activeHashtag = hashtagSelect ? hashtagSelect.value : "";

    // 1. FILTER POST FEED & GEOLOCATED PULSATING MARKERS
    if (window.lastRawPostsData) {
        const filteredPosts = window.lastRawPostsData.filter(post => {
            if (!activeTopic && !activeHashtag) return true;
            
            const postText = post.text ? post.text.toLowerCase() : "";
            
            // Topic matching: check if text contains any topic keywords
            const matchesTopic = !activeTopic || (TOPIC_KEYWORDS[activeTopic] && TOPIC_KEYWORDS[activeTopic].some(kw => postText.includes(kw.toLowerCase())));
            
            // Hashtag matching: check if text contains hashtag
            const matchesHashtag = !activeHashtag || postText.includes(activeHashtag.toLowerCase());
            
            return matchesTopic && matchesHashtag;
        });
        
        // Re-inject matching post cards into feed
        const container = document.getElementById('feed-container');
        if (container) {
            container.innerHTML = '';
            filteredPosts.forEach(post => {
                const card = createFeedCard(post);
                card.id = `post-${post.post_id}`;
                card.dataset.hiddenState = "false";
                container.appendChild(card);
                
                const scoreEl = card.querySelector('.score-val');
                if (scoreEl) {
                    scoreEl.innerText = `${post.raw_score > 0 ? '+' : ''}${post.raw_score.toFixed(1)}`;
                }
            });
            if (typeof window.filterFeedCards === 'function') {
                window.filterFeedCards();
            }
        }
        
        // Update Geolocation pulsating markers
        if (typeof updatePostMarkers === 'function') {
            updatePostMarkers(filteredPosts);
        }
        
        // 2. FILTER SENTIMENT HEATMAP REGIONAL AVERAGES
        if (typeof updateHeatmap === 'function') {
            if (!activeTopic && !activeHashtag) {
                // Restore baseline
                if (window.currentRawHeatmapData) {
                    updateHeatmap(window.currentRawHeatmapData);
                }
            } else {
                // Compute regional aggregates dynamically from filtered posts
                const regions = [
                    "Casablanca-Settat", "Rabat-Salé", "Marrakech-Safi", "Fès-Meknès", 
                    "Tanger-Tétouan", "Souss-Massa", "Oriental", "Laâyoune-Sakia El Hamra", 
                    "Dakhla-Oued Ed-Dahab", "Béni Mellal-Khénifra", "Drâa-Tafilalet", "Guelmim-Oued Noun"
                ];
                const aggregates = {};
                regions.forEach(r => {
                    aggregates[r] = { sum: 0, count: 0 };
                });
                
                filteredPosts.forEach(post => {
                    const r = post.region;
                    if (r && aggregates[r]) {
                        aggregates[r].sum += post.raw_score || 0;
                        aggregates[r].count += 1;
                    }
                });
                
                const slider = document.getElementById('timeline-slider');
                const sliderVal = slider ? parseInt(slider.value) : 24;

                const filteredHeatmap = {};
                regions.forEach(r => {
                    const agg = aggregates[r];
                    let score = agg.count > 0 ? (agg.sum / agg.count) : 0.0;

                    // Apply timeline wave function shift if not in live 24h state!
                    if (sliderVal !== 24) {
                        const hash = r.charCodeAt(0) + r.charCodeAt(r.length - 1);
                        const shift = Math.sin((sliderVal + hash) / 2.5) * 0.45; // shift sentiment by up to 0.45 points
                        score = Math.max(-1.0, Math.min(1.0, score + shift));
                    }

                    filteredHeatmap[r] = {
                        score: score,
                        count: agg.count
                    };
                });
                updateHeatmap(filteredHeatmap);
            }
        }
    }
    
    // 3. FILTER TREND VELOCITY CHART
    if (window.lastRawVelocityData && typeof updateVelocityChart === 'function') {
        if (!activeTopic && !activeHashtag) {
            updateVelocityChart(window.lastRawVelocityData);
        } else {
            const recentData = window.lastRawVelocityData.slice(-8);
            const filteredVelocity = recentData.map(d => {
                const timePart = d.time ? d.time.split(' ')[1] : null;
                const hour = timePart ? parseInt(timePart.split(':')[0]) : null;
                
                const matchingInBin = (window.lastRawPostsData || []).filter(post => {
                    const postText = post.text ? post.text.toLowerCase() : "";
                    const matchesTopic = !activeTopic || (TOPIC_KEYWORDS[activeTopic] && TOPIC_KEYWORDS[activeTopic].some(kw => postText.includes(kw.toLowerCase())));
                    const matchesHashtag = !activeHashtag || postText.includes(activeHashtag.toLowerCase());
                    const matchesQuery = matchesTopic && matchesHashtag;
                    if (!matchesQuery) return false;
                    
                    if (hour !== null && post.created_at) {
                        const postHour = new Date(post.created_at).getHours();
                        return Math.abs(postHour - hour) <= 2;
                    }
                    return true;
                });
                
                if (matchingInBin.length === 0) return { ...d, velocity: 0.0 };
                const sum = matchingInBin.reduce((acc, p) => acc + (p.raw_score || 0), 0);
                return {
                    ...d,
                    velocity: sum / matchingInBin.length
                };
            });
            updateVelocityChart(filteredVelocity);
        }
    }
    
    // 4. FILTER ANOMALY ALERTS LOGS
    if (window.lastRawAlertsData) {
        const alertsContainer = document.getElementById('alerts-container');
        if (alertsContainer) {
            alertsContainer.innerHTML = '';
            const filteredAlerts = window.lastRawAlertsData.filter(alert => {
                if (!activeTopic && !activeHashtag) return true;
                const message = alert.message ? alert.message.toLowerCase() : "";
                const type = alert.type ? alert.type.toLowerCase() : "";
                
                if (activeTopic) {
                    const kws = TOPIC_KEYWORDS[activeTopic] || [];
                    return kws.some(kw => message.includes(kw.toLowerCase()) || type.includes(kw.toLowerCase()));
                }
                
                if (activeHashtag) {
                    return message.includes(activeHashtag.toLowerCase()) || type.includes(activeHashtag.toLowerCase());
                }
                return true;
            });
            
            // Re-render filtered alerts
            filteredAlerts.forEach(alert => {
                const row = document.createElement('div');
                row.className = 'alert-row';
                row.id = `alert-${alert.id}`;
                const isCritical = alert.message && alert.message.includes('200%');
                const icon = isCritical ? '<span class="warning-rotate" style="display:inline-block">⚠️</span>' : '⚠️';
                row.innerHTML = `
                    <strong>${icon} ${alert.type || 'Alert'}</strong>
                    <div style="font-size: 0.8rem; margin-top: 4px; color: var(--text-primary);">${alert.message || ''}</div>
                `;
                alertsContainer.appendChild(row);
            });
        }
    }
    
    // 5. FILTER TRENDING HASHTAGS
    if (window.lastRawHashtagsData && typeof updateHashtags === 'function') {
        if (!activeTopic && !activeHashtag) {
            updateHashtags(window.lastRawHashtagsData);
        } else {
            const filteredHashtags = window.lastRawHashtagsData.filter(h => {
                const tag = h.tag ? h.tag.toLowerCase() : "";
                
                if (activeHashtag) {
                    return tag.includes(activeHashtag.toLowerCase());
                }
                
                if (activeTopic) {
                    const kws = TOPIC_KEYWORDS[activeTopic] || [];
                    return kws.some(kw => tag.includes(kw.toLowerCase()));
                }
                return true;
            });
            updateHashtags(filteredHashtags);
        }
    }
}
window.applyGlobalSearchFilter = applyGlobalSearchFilter;

// --- NLP Testing Modal Functions ---
function openNlpModal() {
    document.getElementById('nlp-modal').style.display = 'flex';
    document.getElementById('nlp-input').value = '';
    document.getElementById('nlp-result').style.display = 'none';
}

function closeNlpModal() {
    document.getElementById('nlp-modal').style.display = 'none';
}

async function testNlpScore() {
    const text = document.getElementById('nlp-input').value;
    if (!text.trim()) return;
    
    try {
        const res = await fetch('/api/test-nlp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text })
        });
        const data = await res.json();
        
        document.getElementById('nlp-score-val').innerText = data.score.toFixed(2);
        document.getElementById('nlp-emotion-val').innerText = data.emotion;
        
        const resultDiv = document.getElementById('nlp-result');
        resultDiv.style.display = 'block';
        
        // Color coding based on score
        if (data.score > 0.1) {
            resultDiv.style.borderLeftColor = '#38ef7d'; // Green
            document.getElementById('nlp-score-val').style.color = '#38ef7d';
        } else if (data.score < -0.1) {
            resultDiv.style.borderLeftColor = '#ff5858'; // Red
            document.getElementById('nlp-score-val').style.color = '#ff5858';
        } else {
            resultDiv.style.borderLeftColor = '#a0aec0'; // Gray
            document.getElementById('nlp-score-val').style.color = '#a0aec0';
        }
    } catch (e) {
        console.error("Erreur lors du test NLP:", e);
        alert("Erreur lors de la communication avec l'API NLP.");
    }
}
window.openNlpModal = openNlpModal;
window.closeNlpModal = closeNlpModal;
window.testNlpScore = testNlpScore;
