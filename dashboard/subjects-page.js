// Sujets Hub Interaction Logic
let subjectsChartInstance = null;
let activeSubjectName = null;
let subjectsCache = [];
let lastUpdateTime = Date.now();

// Register Flip plugin
if (typeof gsap !== 'undefined' && typeof Flip !== 'undefined') {
    gsap.registerPlugin(Flip);
}

// Format date relative helper
function getRelativeTime(timestamp) {
    try {
        const diff = Date.now() - new Date(timestamp).getTime();
        const secs = Math.floor(diff / 1000);
        if (secs < 60) return "à l'instant";
        const mins = Math.floor(secs / 60);
        if (mins < 60) return `il y a ${mins}m`;
        const hours = Math.floor(mins / 60);
        return `il y a ${hours}h`;
    } catch (e) {
        return "";
    }
}

// Initializer
async function initSubjectsPage() {
    console.log("Initializing Topic Hub...");
    await fetchSubjectsData();
    
    // Setup polling every 5 seconds
    setInterval(fetchSubjectsData, 5000);
    
    // Setup last sync clock
    setInterval(() => {
        const diff = Math.floor((Date.now() - lastUpdateTime) / 1000);
        document.getElementById("last-update").innerText = `Synced ${diff}s ago`;
    }, 1000);
}

// Fetch subjects and render
async function fetchSubjectsData() {
    try {
        const response = await fetch("/api/subjects");
        if (!response.ok) throw new Error("API Subjects response failed");
        
        const data = await response.json();
        if (!data || data.length === 0) return;
        
        lastUpdateTime = Date.now();
        subjectsCache = data;
        
        // Render dynamic rankings using Flip.js
        renderSubjectsList(data);
        
        // Render or update Chart.js comparative analysis
        renderComparativeChart(data);
        
        // If no active subject is selected yet, choose the first one
        if (!activeSubjectName && data.length > 0) {
            selectSubject(data[0].subject);
        } else if (activeSubjectName) {
            // Keep current details updated if new scrape changes counts/sentiment
            selectSubject(activeSubjectName, true);
        }
    } catch (e) {
        console.error("Error polling subjects:", e);
    }
}

// Render dynamic ranking grid
function renderSubjectsList(subjects) {
    const container = document.getElementById("subjects-rankings-container");
    if (!container) return;

    // Get current elements state for Flip transition
    const cards = container.querySelectorAll(".subject-card");
    const state = Flip.getState(cards);

    // Build fresh content in memory
    container.innerHTML = "";
    
    subjects.forEach((sub, index) => {
        const rank = index + 1;
        const sentimentVal = sub.avg_sentiment;
        
        // Color-coded sentiment tag
        let sentimentColor = "rgba(56, 239, 125, 0.2)";
        let sentimentTextColor = "#38ef7d";
        let sentimentLabel = "Positif";
        
        if (sentimentVal < -0.1) {
            sentimentColor = "rgba(255, 88, 88, 0.2)";
            sentimentTextColor = "#ff5858";
            sentimentLabel = "Négatif";
        } else if (Math.abs(sentimentVal) <= 0.1) {
            sentimentColor = "rgba(255, 179, 0, 0.2)";
            sentimentTextColor = "#ffb300";
            sentimentLabel = "Neutre";
        }

        const isActive = activeSubjectName === sub.subject ? "active" : "";

        // Card HTML
        const cardHTML = `
            <div class="subject-card ${isActive}" data-flip-id="${sub.subject}" onclick="selectSubject('${sub.subject}')" style="display: grid; grid-template-columns: 50px 1fr 100px; align-items: center; background: rgba(30, 41, 59, 0.4); border: 1px solid rgba(255,255,255,0.05); border-radius: var(--radius-md); padding: 1rem; cursor: pointer; transition: all 0.25s; position: relative;">
                <!-- Rank Badge -->
                <div class="rank-badge" style="display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 1.25rem; color: ${rank <= 3 ? 'var(--accent-teal)' : 'var(--text-muted)'};">
                    #${rank}
                </div>
                
                <!-- Main Info -->
                <div class="info" style="display: flex; flex-direction: column; gap: 4px; padding-left: 8px;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="font-size: 1.1rem;">${sub.emoji}</span>
                        <h3 style="font-size: 0.95rem; font-weight: 600; margin: 0; color: var(--text-primary);">${sub.subject}</h3>
                    </div>
                    <span style="font-size: 0.75rem; color: var(--text-muted); display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical; overflow: hidden;">${sub.description}</span>
                </div>
                
                <!-- Stats Pill -->
                <div class="stats-pill" style="display: flex; flex-direction: column; align-items: flex-end; gap: 6px;">
                    <span style="font-size: 0.75rem; font-weight: bold; color: var(--accent-blue); background: rgba(0, 210, 255, 0.08); padding: 0.15rem 0.5rem; border-radius: 4px; border: 1px solid rgba(0, 210, 255, 0.15);">${sub.count} posts</span>
                    <span style="font-size: 0.7rem; font-weight: 700; color: ${sentimentTextColor}; background: ${sentimentColor}; padding: 0.15rem 0.4rem; border-radius: 3px; border: 1px solid rgba(255,255,255,0.02);">${sentimentLabel}</span>
                </div>
            </div>
        `;
        container.insertAdjacentHTML("beforeend", cardHTML);
    });

    // Run Flip.js reordering transition
    Flip.from(state, {
        duration: 0.6,
        ease: "power2.out",
        absolute: true,
        stagger: 0.05
    });
}

// Select a subject for drilldown
function selectSubject(subjectName, isUpdateOnly = false) {
    activeSubjectName = subjectName;
    
    // Update card selection border class in UI
    const container = document.getElementById("subjects-rankings-container");
    if (container) {
        container.querySelectorAll(".subject-card").forEach(card => {
            if (card.getAttribute("data-flip-id") === subjectName) {
                card.classList.add("active");
            } else {
                card.classList.remove("active");
            }
        });
    }

    const sub = subjectsCache.find(x => x.subject === subjectName);
    if (!sub) return;

    // Sidebar update
    document.getElementById("detail-title").innerHTML = `${sub.emoji} ${sub.subject.toUpperCase()}`;
    document.getElementById("detail-desc").innerText = sub.description;
    
    const statsContainer = document.getElementById("detail-stats");
    statsContainer.style.display = "block";
    
    // Sentiment Badge color
    const sentBadge = document.getElementById("detail-sentiment-badge");
    sentBadge.innerText = (sub.avg_sentiment >= 0 ? "+" : "") + sub.avg_sentiment.toFixed(2);
    if (sub.avg_sentiment < -0.1) {
        sentBadge.style.color = "#ff5858";
    } else if (sub.avg_sentiment > 0.1) {
        sentBadge.style.color = "#38ef7d";
    } else {
        sentBadge.style.color = "#ffb300";
    }
    
    // Emotion Badge Color
    const emoBadge = document.getElementById("detail-emotion-badge");
    emoBadge.innerText = sub.primary_emotion;
    if (sub.primary_emotion === "Pride/Joy") emoBadge.style.color = "#38ef7d";
    else if (sub.primary_emotion === "Grievance") emoBadge.style.color = "#ff5858";
    else if (sub.primary_emotion === "Concern") emoBadge.style.color = "#ffb300";
    else if (sub.primary_emotion === "Peace") emoBadge.style.color = "var(--accent-blue)";
    else emoBadge.style.color = "var(--text-muted)";

    // Keyword focus
    const keywordsContainer = document.getElementById("detail-keywords");
    keywordsContainer.innerHTML = "";
    if (sub.top_keywords && sub.top_keywords.length > 0) {
        sub.top_keywords.forEach(kw => {
            const kwBadge = `
                <span class="tag-keyword" style="font-size: 0.75rem; color: var(--text-primary); background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); padding: 0.3rem 0.6rem; border-radius: 20px; transition: all 0.2s;">
                    #${kw}
                </span>
            `;
            keywordsContainer.insertAdjacentHTML("beforeend", kwBadge);
        });
    } else {
        keywordsContainer.innerHTML = `<span style="font-size: 0.75rem; color: var(--text-muted); font-style: italic;">No core keywords extracted.</span>`;
    }

    // Drilldown Conveyor Feed
    const feedContainer = document.getElementById("subject-feed-container");
    feedContainer.innerHTML = "";
    document.getElementById("detail-count-badge").innerText = `${sub.count} posts analysés`;
    
    if (sub.posts && sub.posts.length > 0) {
        sub.posts.forEach(post => {
            const relativeTime = getRelativeTime(post.created_at);
            const score = post.raw_score;
            let scoreColor = "#38ef7d";
            if (score < -0.1) scoreColor = "#ff5858";
            else if (Math.abs(score) <= 0.1) scoreColor = "#ffb300";

            const sourceIcon = post.source === "news" ? "📰" : "👽";
            const emotionLabel = post.emotion || "Neutral";

            const postHTML = `
                <div class="feed-item-card" style="background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.04); border-radius: var(--radius-md); padding: 0.85rem; display: flex; flex-direction: column; gap: 6px; transition: transform 0.2s;">
                    <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.75rem;">
                        <span style="color: var(--text-muted); display: flex; align-items: center; gap: 4px;">
                            <span>${sourceIcon}</span>
                            <strong>${post.source === 'news' ? 'Presse' : 'r/Morocco'}</strong>
                            <span>•</span>
                            <span>${relativeTime}</span>
                            <span>•</span>
                            <span style="background: rgba(255,255,255,0.05); padding: 0.1rem 0.3rem; border-radius: 3px;">${post.region || "National"}</span>
                        </span>
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <span style="color: var(--text-muted); font-size: 0.7rem; background: rgba(0,0,0,0.15); padding: 0.1rem 0.3rem; border-radius: 3px;">${emotionLabel}</span>
                            <span style="color: ${scoreColor}; font-weight: bold;">${score >= 0 ? '+' : ''}${score.toFixed(2)}</span>
                        </div>
                    </div>
                    <p style="font-size: 0.85rem; line-height: 1.5; color: var(--text-primary); margin: 0;">${post.text}</p>
                </div>
            `;
            feedContainer.insertAdjacentHTML("beforeend", postHTML);
        });
    } else {
        feedContainer.innerHTML = `
            <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 2rem 0; color: var(--text-muted);">
                <span>📭 Aucun post n'a encore été associé à ce sujet.</span>
            </div>
        `;
    }
}

// Render Comparison Chart.js
function renderComparativeChart(subjects) {
    const canvas = document.getElementById("subjectsChart");
    if (!canvas) return;
    
    const ctx = canvas.getContext("2d");
    
    const labels = subjects.map(x => x.subject);
    const volumes = subjects.map(x => x.count);
    const sentiments = subjects.map(x => x.avg_sentiment * 100); // Scale to % index

    if (subjectsChartInstance) {
        // Update existing chart to prevent canvas glitching/ghosting
        subjectsChartInstance.data.labels = labels;
        subjectsChartInstance.data.datasets[0].data = volumes;
        subjectsChartInstance.data.datasets[1].data = sentiments;
        subjectsChartInstance.update();
        return;
    }

    subjectsChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Volume de Mentions (Posts)',
                    data: volumes,
                    backgroundColor: 'rgba(0, 210, 255, 0.45)',
                    borderColor: 'rgba(0, 210, 255, 0.95)',
                    borderWidth: 1.5,
                    borderRadius: 4,
                    yAxisID: 'yVolume',
                },
                {
                    label: 'Sentiment Index (%)',
                    data: sentiments,
                    type: 'line',
                    backgroundColor: 'rgba(56, 239, 125, 0.05)',
                    borderColor: function(context) {
                        const chart = context.chart;
                        const {ctx, chartArea} = chart;
                        if (!chartArea) return '#38ef7d'; // Default fallback
                        
                        // Create tight vertical gradient to blend green directly to red without yellow/orange
                        const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
                        gradient.addColorStop(0, '#38ef7d');    // Max positive (+100%): Green
                        gradient.addColorStop(0.48, '#38ef7d'); // Positive boundary: Green
                        gradient.addColorStop(0.52, '#ff5858'); // Negative boundary: Red
                        gradient.addColorStop(1, '#ff5858');    // Max negative (-100%): Red
                        return gradient;
                    },
                    borderWidth: 3,
                    pointBackgroundColor: function(context) {
                        const index = context.dataIndex;
                        if (index === undefined || !context.dataset || !context.dataset.data) return '#38ef7d';
                        const val = context.dataset.data[index];
                        
                        // Strict binary color coding: Green (positive/neutral >= 0) or Red (negative < 0)
                        return val >= 0 ? '#38ef7d' : '#ff5858';
                    },
                    pointBorderColor: '#fff',
                    pointBorderWidth: 1.5,
                    pointRadius: 5,
                    pointHoverRadius: 7,
                    yAxisID: 'ySentiment',
                    tension: 0.3
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'top',
                    labels: {
                        color: 'rgba(255, 255, 255, 0.7)',
                        font: {
                            family: 'Inter',
                            size: 11
                        }
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(15, 23, 42, 0.95)',
                    titleColor: '#fff',
                    bodyColor: '#cbd5e1',
                    borderColor: 'rgba(255,255,255,0.08)',
                    borderWidth: 1,
                    padding: 10,
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) label += ': ';
                            if (context.datasetIndex === 0) {
                                label += context.raw + ' posts';
                            } else {
                                label += (context.raw >= 0 ? '+' : '') + (context.raw / 100).toFixed(2);
                            }
                            return label;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: {
                        color: 'rgba(255, 255, 255, 0.03)'
                    },
                    ticks: {
                        color: 'rgba(255, 255, 255, 0.5)',
                        font: {
                            family: 'Inter',
                            size: 10
                        }
                    }
                },
                yVolume: {
                    type: 'linear',
                    position: 'left',
                    grid: {
                        color: 'rgba(255, 255, 255, 0.03)'
                    },
                    ticks: {
                        color: 'rgba(0, 210, 255, 0.7)',
                        font: {
                            family: 'Inter',
                            size: 10
                        }
                    },
                    title: {
                        display: true,
                        text: 'Volume de Posts',
                        color: 'rgba(0, 210, 255, 0.7)',
                        font: {
                            family: 'Inter',
                            size: 10,
                            weight: 'bold'
                        }
                    }
                },
                ySentiment: {
                    type: 'linear',
                    position: 'right',
                    min: -100,
                    max: 100,
                    grid: {
                        drawOnChartArea: false // prevent grid line overlapping
                    },
                    ticks: {
                        color: function(context) {
                            return context.tick.value >= 0 ? '#38ef7d' : '#ff5858';
                        },
                        font: {
                            family: 'Inter',
                            size: 10
                        },
                        callback: function(value) {
                            return (value >= 0 ? '+' : '') + (value / 100).toFixed(1);
                        }
                    },
                    title: {
                        display: true,
                        text: 'Sentiment Score',
                        color: 'rgba(255, 255, 255, 0.6)',
                        font: {
                            family: 'Inter',
                            size: 10,
                            weight: 'bold'
                        }
                    }
                }
            }
        }
    });
}

// Manual live scrape action trigger
async function triggerScrapeNow() {
    const btn = document.getElementById("scrape-btn");
    if (!btn) return;
    
    // Disable visual state during process
    btn.style.opacity = "0.5";
    btn.style.pointerEvents = "none";
    btn.innerHTML = `<span style="display:inline-block;animation:spin 1s linear infinite;margin-right:6px;">🔄</span> Analyse en cours...`;

    try {
        const response = await fetch("/api/scrape/now", { method: "POST" });
        if (!response.ok) throw new Error("Scrape request failed");
        
        const result = await response.json();
        console.log("Scrape triggered successfully:", result);
        
        // Wait 1.5 seconds for backend processor to complete the scrape cycle
        setTimeout(async () => {
            await fetchSubjectsData();
            
            // Restore button visual state
            btn.style.opacity = "1";
            btn.style.pointerEvents = "auto";
            btn.innerHTML = `<span class="icon" style="color: var(--accent-teal);">⚡</span> Run Live Analysis`;
        }, 1500);
    } catch (e) {
        console.error("Scrape trigger failed:", e);
        btn.style.opacity = "1";
        btn.style.pointerEvents = "auto";
        btn.innerHTML = `<span class="icon" style="color: var(--accent-teal);">⚡</span> Run Live Analysis`;
    }
}
