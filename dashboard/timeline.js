/**
 * Timeline Slider Module
 * Handles historical replay simulations (Time-Travel / Rejeu).
 */

let originalHeatmapData = null;
let originalFeedPosts = null;

// Catch incoming real-time data updates to keep the baseline updated!
window.addEventListener('data:heatmap', (e) => {
    // Only cache if we are currently at the "Direct" (24h) live state!
    const slider = document.getElementById('timeline-slider');
    if (slider && parseInt(slider.value) === 24) {
        originalHeatmapData = JSON.parse(JSON.stringify(e.detail));
    }
});

window.addEventListener('data:feed', (e) => {
    const slider = document.getElementById('timeline-slider');
    if (slider && parseInt(slider.value) === 24) {
        originalFeedPosts = JSON.parse(JSON.stringify(e.detail));
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const slider = document.getElementById('timeline-slider');
    const label = document.getElementById('timeline-slider-label');
    
    if (!slider || !label) return;
    
    slider.addEventListener('input', (e) => {
        const val = parseInt(e.target.value);
        
        if (val === 24) {
            label.innerText = 'Direct (24h)';
            label.style.color = 'var(--accent-teal)';
            
            // Restore actual live data
            if (originalHeatmapData) {
                window.dispatchEvent(new CustomEvent('data:heatmap_internal', { detail: originalHeatmapData }));
            }
            if (originalFeedPosts) {
                window.dispatchEvent(new CustomEvent('data:feed_internal', { detail: originalFeedPosts }));
            }
            return;
        }
        
        // Simulating historical hours
        const diff = 24 - val;
        label.innerText = `-${diff}h (Simulé)`;
        label.style.color = '#ffb199'; // Shift color slightly warning/orange
        
        // Generate simulated regional shift
        if (originalHeatmapData) {
            const simulatedHeatmap = JSON.parse(JSON.stringify(originalHeatmapData));
            Object.keys(simulatedHeatmap).forEach(region => {
                // Apply a wave function shift based on the hour and region name hash
                const hash = region.charCodeAt(0) + region.charCodeAt(region.length - 1);
                const shift = Math.sin((val + hash) / 2.5) * 0.45; // shift sentiment by up to 0.45 points
                
                let newScore = simulatedHeatmap[region].score + shift;
                newScore = Math.max(-1.0, Math.min(1.0, newScore));
                simulatedHeatmap[region].score = newScore;
                
                // Shuffle emotion counts a bit for visual dynamics inside the sidebar
                if (simulatedHeatmap[region].emotions) {
                    const emotions = simulatedHeatmap[region].emotions;
                    Object.keys(emotions).forEach(emo => {
                        const shiftEmo = Math.round(Math.sin((val + emo.charCodeAt(0)) / 1.5) * 2);
                        emotions[emo] = Math.max(0, emotions[emo] + shiftEmo);
                    });
                }
            });
            // Update map and sidebar instantly by calling our custom internal triggers
            window.dispatchEvent(new CustomEvent('data:heatmap_internal', { detail: simulatedHeatmap }));
        }
        
        // Replay feed card shifts - simulate post ordering / contents changing over time
        if (originalFeedPosts) {
            const simulatedFeed = JSON.parse(JSON.stringify(originalFeedPosts));
            // Rotate list elements based on hours back to simulate historical feeds
            const rotateCount = diff % simulatedFeed.length;
            const shiftedFeed = [...simulatedFeed.slice(rotateCount), ...simulatedFeed.slice(0, rotateCount)];
            window.dispatchEvent(new CustomEvent('data:feed_internal', { detail: shiftedFeed }));
        }
    });
});
