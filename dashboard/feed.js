/**
 * Feed Module
 * Handles the animated conveyor belt of live social media posts.
 */

let maxVisibleCards = 100;
let activeRegionFilter = null;

/**
 * Creates the DOM element for a feed card.
 * @param {Object} post The post data.
 * @returns {HTMLElement} The constructed feed card element.
 */
function createFeedCard(post) {
    const card = document.createElement('div');
    card.className = 'feed-card';
    card.dataset.region = post.region || 'National';
    card.style.willChange = 'transform, opacity';
    
    // Determine polarity
    if (post.raw_score > 0) card.classList.add('positive');
    else if (post.raw_score < 0) card.classList.add('negative');
    else card.style.borderLeftColor = 'var(--text-muted)'; // Neutral

    const sourceIcon = post.source === 'news' ? '📰' : '👽';
    
    // Format timestamp
    const date = new Date(post.created_at);
    const timeStr = `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;

    // Get emotion badge
    const emotionEmojis = {
        "Pride/Joy": "🇲🇦 Fierté",
        "Grievance": "⚠️ Grief",
        "Concern": "🔍 Souci",
        "Peace": "🕊️ Calme",
        "Neutral": "📊 Neutre"
    };
    const emotionBadge = emotionEmojis[post.emotion] || "📊 Neutre";

    card.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
            <div class="feed-meta" style="font-size: 0.8rem; color: var(--text-muted); display: flex; align-items: center; gap: 8px;">
                <span class="feed-source-badge">${sourceIcon}</span>
                <span>${post.region || 'National'} • ${timeStr}</span>
                <span class="emotion-tag" style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); padding: 0.15rem 0.4rem; border-radius: 4px; font-size: 0.7rem; color: var(--text-muted); letter-spacing: 0.02em;">${emotionBadge}</span>
            </div>
            <div class="feed-score" style="font-weight: bold; font-size: 1.1rem; color: ${post.raw_score > 0 ? 'var(--accent-teal)' : (post.raw_score < 0 ? 'var(--accent-red)' : 'var(--text-muted)')};">
                <span class="score-val">0.0</span>
            </div>
        </div>
        <div class="feed-text" style="font-size: 0.9rem; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; text-overflow: ellipsis;">
            ${post.text}
        </div>
    `;

    return card;
}

/**
 * Updates the feed with new posts, animating them in.
 * @param {Array} posts Array of new post objects.
 */
function updateFeed(posts) {
    const container = document.getElementById('feed-container');
    if (!container || !posts || posts.length === 0) return;

    // We only process the top 5 to avoid overwhelming the animation
    const newPosts = posts.slice(0, 5).reverse(); 

    newPosts.forEach((post, index) => {
        // Prevent duplicate rendering (simple check by ID)
        if (document.getElementById(`post-${post.post_id}`)) return;

        const card = createFeedCard(post);
        card.id = `post-${post.post_id}`;
        
        // Setup initial collapsed state
        const isMatch = !activeRegionFilter || (post.region || 'National') === activeRegionFilter;
        gsap.set(card, {
            opacity: 0,
            height: 0,
            marginBottom: 0,
            paddingTop: 0,
            paddingBottom: 0,
            overflow: "hidden",
            borderTopWidth: 0,
            borderBottomWidth: 0,
            display: isMatch ? "block" : "none"
        });
        card.dataset.hiddenState = isMatch ? "false" : "true";
        
        // Prepend to container
        container.insertBefore(card, container.firstChild);

        if (isMatch) {
            // Animate new card entrance by expanding height and fading in (perfect browser-reflow slide)
            gsap.to(card, {
                opacity: 1,
                height: "auto",
                marginBottom: "1.0rem",
                paddingTop: "1.2rem",
                paddingBottom: "1.2rem",
                duration: 0.6,
                ease: "power2.out",
                delay: index * 0.15,
                clearProps: "height,paddingTop,paddingBottom,marginBottom,overflow,borderTopWidth,borderBottomWidth"
            });
        }

        // Animate the score number
        const scoreEl = card.querySelector('.score-val');
        if (scoreEl && typeof animateNumber === 'function') {
            animateNumber(scoreEl, 0, post.raw_score, 2);
        }

        // Cleanup oldest cards (smooth collapse at the bottom of the belt)
        const allCards = Array.from(container.children);
        if (allCards.length > maxVisibleCards) {
            const extraCards = allCards.slice(maxVisibleCards);
            extraCards.forEach(oldCard => {
                if (oldCard.dataset.animatingOut === "true") return;
                oldCard.dataset.animatingOut = "true";

                gsap.to(oldCard, {
                    opacity: 0,
                    height: 0,
                    marginBottom: 0,
                    paddingTop: 0,
                    paddingBottom: 0,
                    borderTopWidth: 0,
                    borderBottomWidth: 0,
                    overflow: "hidden",
                    duration: 0.5,
                    ease: "power2.inOut",
                    onComplete: () => {
                        oldCard.remove();
                    }
                });
            });
        }
    });
}

// Hover interaction to pause polling
document.addEventListener('DOMContentLoaded', () => {
    const container = document.getElementById('feed-container');
    if (container) {
        container.addEventListener('mouseenter', () => {
            if (window.poller) {
                console.log("Pausing polling (feed hover)");
                window.poller.stop();
            }
        });
        container.addEventListener('mouseleave', () => {
            if (window.poller) {
                console.log("Resuming polling");
                window.poller.start();
            }
        });
    }
});

// Self-listen to feed data updates
window.addEventListener('data:feed', (e) => {
    const slider = document.getElementById('timeline-slider');
    if (slider && parseInt(slider.value) !== 24) {
        // Ignore background updates during simulated history travel!
        return;
    }
    window.lastRawPostsData = e.detail;
    if (typeof window.isFilterActive === 'function' && window.isFilterActive()) {
        if (typeof applyGlobalSearchFilter === 'function') applyGlobalSearchFilter();
    } else {
        updateFeed(e.detail);
    }
});

window.addEventListener('data:feed_internal', (e) => {
    window.lastRawPostsData = e.detail;
    if (typeof window.isFilterActive === 'function' && window.isFilterActive()) {
        if (typeof applyGlobalSearchFilter === 'function') applyGlobalSearchFilter();
    } else {
        const container = document.getElementById('feed-container');
        if (!container || !e.detail) return;
        
        // Clear feed container for instant time-travel swap
        container.innerHTML = '';
        
        e.detail.forEach(post => {
            const card = createFeedCard(post);
            card.id = `post-${post.post_id}`;
            card.dataset.hiddenState = "false";
            container.appendChild(card);
            
            // Set the final score instantly
            const scoreEl = card.querySelector('.score-val');
            if (scoreEl) {
                scoreEl.innerText = `${post.raw_score > 0 ? '+' : ''}${post.raw_score.toFixed(1)}`;
            }
        });
        
        // Apply active filter if one exists
        filterFeedCards();
    }
});

// Region selection filter routing
window.addEventListener('dashboard:region-select', (e) => {
    activeRegionFilter = e.detail.region;
    filterFeedCards();
});

window.filterFeedCards = filterFeedCards;
function filterFeedCards() {
    const container = document.getElementById('feed-container');
    if (!container) return;
    
    const allCards = Array.from(container.children);
    allCards.forEach(card => {
        const isMatch = !activeRegionFilter || card.dataset.region === activeRegionFilter;
        
        if (isMatch) {
            // Fade in and expand
            if (card.dataset.hiddenState === "true") {
                card.dataset.hiddenState = "false";
                card.style.display = "block";
                gsap.killTweensOf(card);
                gsap.fromTo(card, 
                    { opacity: 0, height: 0, marginBottom: 0, paddingTop: 0, paddingBottom: 0 },
                    { 
                        opacity: 1, 
                        height: "auto", 
                        marginBottom: "1.0rem", 
                        paddingTop: "1.2rem", 
                        paddingBottom: "1.2rem",
                        duration: 0.4, 
                        ease: "power2.out",
                        clearProps: "height,paddingTop,paddingBottom,marginBottom,overflow,borderTopWidth,borderBottomWidth"
                    }
                );
            }
        } else {
            // Collapse and fade out
            if (card.dataset.hiddenState !== "true") {
                card.dataset.hiddenState = "true";
                gsap.killTweensOf(card);
                gsap.to(card, {
                    opacity: 0,
                    height: 0,
                    marginBottom: 0,
                    paddingTop: 0,
                    paddingBottom: 0,
                    overflow: "hidden",
                    duration: 0.4,
                    ease: "power2.inOut",
                    onComplete: () => {
                        card.style.display = "none";
                    }
                });
            }
        }
    });
}
