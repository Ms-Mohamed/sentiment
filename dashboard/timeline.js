/**
 * Replay slider.
 * Shows what the dashboard WOULD have displayed N hours ago, computed by the backend from the
 * posts that had actually been published by then (GET /api/replay?hours=N). No data is invented.
 */

let originalHeatmapData = null;
let originalFeedPosts = null;
let replayTimer = null;

// Keep the live baseline while the slider sits on "Direct".
window.addEventListener('data:heatmap', (e) => {
    const slider = document.getElementById('timeline-slider');
    if (slider && parseInt(slider.value) === 24) originalHeatmapData = JSON.parse(JSON.stringify(e.detail));
});
window.addEventListener('data:feed', (e) => {
    const slider = document.getElementById('timeline-slider');
    if (slider && parseInt(slider.value) === 24) originalFeedPosts = JSON.parse(JSON.stringify(e.detail));
});

document.addEventListener('DOMContentLoaded', () => {
    const slider = document.getElementById('timeline-slider');
    const label = document.getElementById('timeline-slider-label');
    if (!slider || !label) return;

    slider.addEventListener('input', (e) => {
        const val = parseInt(e.target.value);

        if (val === 24) {
            label.innerText = 'Direct';
            label.style.color = 'var(--accent-teal)';
            if (originalHeatmapData) window.dispatchEvent(new CustomEvent('data:heatmap_internal', { detail: originalHeatmapData }));
            if (originalFeedPosts) window.dispatchEvent(new CustomEvent('data:feed_internal', { detail: originalFeedPosts }));
            return;
        }

        const hours = 24 - val;
        label.innerText = `-${hours}h (historique réel)`;
        label.style.color = '#ffb199';

        clearTimeout(replayTimer);              // debounce while dragging
        replayTimer = setTimeout(async () => {
            try {
                const res = await fetch(`/api/replay?hours=${hours}`, { cache: 'no-store' });
                if (!res.ok) throw new Error(res.status);
                const data = await res.json();
                window.dispatchEvent(new CustomEvent('data:heatmap_internal', { detail: data.heatmap }));
                window.dispatchEvent(new CustomEvent('data:feed_internal', { detail: data.feed }));
                label.innerText = `-${hours}h (${data.posts_considered} posts)`;
            } catch (err) {
                label.innerText = `-${hours}h (indisponible)`;
            }
        }, 150);
    });
});
