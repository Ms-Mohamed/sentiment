/**
 * Velocity Chart Module
 * Renders the Chart.js line chart for sentiment trend velocity.
 */

let velocityChart;
const CHART_COLORS = [
    '#378ADD', '#1D9E75', '#EF9F27', '#E24B4A',
    '#9b59b6', '#00bcd4', '#e67e22', '#7f8c8d'
];

/**
 * Initializes the Chart.js canvas.
 */
function initChart() {
    const ctx = document.getElementById('velocityChart');
    if (!ctx) return;

    // Set height for the canvas container
    ctx.parentElement.style.position = 'relative';
    ctx.parentElement.style.height = '100%';
    ctx.parentElement.style.width = '100%';

    // Make default text colors bright and clean for ultimate dark mode visibility
    Chart.defaults.color = 'rgba(240, 246, 252, 0.85)'; // var(--text-primary) equivalent
    Chart.defaults.font.family = 'var(--font)';
    Chart.defaults.font.size = 11;
    Chart.defaults.font.weight = '500';

    velocityChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [], // Populated dynamically
            datasets: []
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: {
                duration: 1200,
                easing: 'easeInOutQuart'
            },
            scales: {
                y: {
                    // Removed min/max constraints to allow natural autoscaling
                    grid: {
                        color: 'rgba(255, 255, 255, 0.08)', // Brighter grid lines
                        drawTicks: false
                    },
                    ticks: {
                        color: 'rgba(240, 246, 252, 0.85)',
                        padding: 10,
                        callback: function(value) {
                            return (value > 0 ? '+' : '') + value.toFixed(2);
                        }
                    }
                },
                x: {
                    grid: {
                        display: false
                    },
                    ticks: {
                        color: 'rgba(240, 246, 252, 0.85)',
                        padding: 10
                    }
                }
            },
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    backgroundColor: 'rgba(22, 27, 34, 0.95)',
                    titleColor: '#ffffff',
                    bodyColor: '#f0f6fc',
                    borderColor: 'rgba(0, 210, 255, 0.3)',
                    borderWidth: 1,
                    padding: 12,
                    cornerRadius: 8,
                    displayColors: false,
                    callbacks: {
                        label: function(context) {
                            return `Velocity: ${context.parsed.y > 0 ? '+' : ''}${context.parsed.y.toFixed(2)}`;
                        }
                    }
                }
            }
        }
    });

    // Draw animation is handled via the data injection
}

/**
 * Updates the chart data based on new API payload.
 * @param {Array} data - Array of velocity data objects.
 */
function updateVelocityChart(data) {
    if (!velocityChart || !data || data.length === 0) return;

    const datasetName = "National";
    let dataset = velocityChart.data.datasets.find(ds => ds.label === datasetName);
    
    if (!dataset) {
        dataset = {
            label: datasetName,
            data: [],
            borderColor: '#00d2ff', // Super high-contrast bright neon cyan
            backgroundColor: 'rgba(0, 210, 255, 0.12)', // Subtle glowing under-fill
            borderWidth: 3, // Thicker, extremely visible line
            pointRadius: 5, // Larger data points
            pointHoverRadius: 7,
            pointBackgroundColor: '#00d2ff',
            pointBorderColor: '#040508', // Dark background offset for high contrast
            pointBorderWidth: 2,
            fill: true,
            tension: 0.35 // Clean curve
        };
        velocityChart.data.datasets.push(dataset);
    }

    // Extract labels (last 8)
    const recentData = data.slice(-8);
    velocityChart.data.labels = recentData.map(d => d.time.slice(5)); // e.g. "MM-DD"
    
    // Update data points
    dataset.data = recentData.map(d => d.velocity);

    // Highlight fastest changing (if we had multiple regions, we'd loop datasets)
    // For single line, we just ensure smooth update
    
    velocityChart.update('active');

    // Trigger GSAP visual update on canvas wrapper for flair
    const canvasTween = gsap.to(velocityChart.canvas, { duration: 0.3, opacity: 1 });
}

// Initialization and Event Wiring
document.addEventListener('DOMContentLoaded', () => {
    console.log("FIX: 1 — Initializing Velocity Chart");
    initChart();
});

window.addEventListener('ui:animateCharts', () => {
    // Initial draw animation
    if(velocityChart) velocityChart.update();
});

// FIX: 1 — Add missing event listener
window.addEventListener('data:velocity', (e) => {
    console.log("FIX: 1 — Received data:velocity", e.detail);
    window.lastRawVelocityData = e.detail;
    if (typeof window.isFilterActive === 'function' && window.isFilterActive()) {
        if (typeof applyGlobalSearchFilter === 'function') applyGlobalSearchFilter();
    } else {
        updateVelocityChart(e.detail);
    }
});
