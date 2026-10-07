/**
 * DataPoller handles periodic fetching of data from all API endpoints.
 */
class DataPoller {
    constructor(interval = 5000) {
        this.interval = interval;
        this.endpoints = [
            { name: 'feed', url: '/api/feed', panelId: 'feed-panel' },
            { name: 'heatmap', url: '/api/heatmap', panelId: 'heatmap-panel' },
            { name: 'velocity', url: '/api/velocity', panelId: 'velocity-panel' },
            { name: 'alerts', url: '/api/alerts', panelId: 'alerts-panel' },
            { name: 'pipeline', url: '/api/pipeline', panelId: 'pipeline-panel' },
            { name: 'hashtags', url: '/api/hashtags', panelId: 'alerts-panel' }
        ];
        this.lastUpdateTime = Date.now();
        this.timer = null;
        this.pipelineTimer = null;
        this.counterTimer = null;
    }

    /**
     * Starts the polling process and the update counter.
     */
    start() {
        this.pollAll();
        
        // Fast timer for real-time pipeline status (every 1.2 seconds) to match staggered backend MapReduce simulation
        this.pipelineTimer = setInterval(() => this.pollEndpoint('pipeline'), 1200);
        
        // Regular timer for all other endpoints (every 5 seconds)
        this.timer = setInterval(() => this.pollAllExceptPipeline(), this.interval);
        
        const counterEl = document.getElementById('last-update');
        this.counterTimer = setInterval(() => {
            const seconds = Math.floor((Date.now() - this.lastUpdateTime) / 1000);
            counterEl.textContent = `Mis à jour il y a ${seconds}s`;
        }, 1000);
    }

    /**
     * Stops the polling process.
     */
    stop() {
        clearInterval(this.timer);
        clearInterval(this.pipelineTimer);
        clearInterval(this.counterTimer);
    }

    /**
     * Fetches data from all endpoints in parallel.
     */
    async pollAll() {
        const fetches = this.endpoints.map(ep => this.pollEndpoint(ep.name));
        await Promise.all(fetches);
        this.lastUpdateTime = Date.now();
    }

    /**
     * Fetches data from all endpoints EXCEPT pipeline.
     */
    async pollAllExceptPipeline() {
        const fetches = this.endpoints
            .filter(ep => ep.name !== 'pipeline')
            .map(ep => this.pollEndpoint(ep.name));
        await Promise.all(fetches);
        this.lastUpdateTime = Date.now();
    }

    /**
     * Polls a single endpoint and dispatches its CustomEvent.
     * @param {string} name 
     */
    async pollEndpoint(name) {
        const ep = this.endpoints.find(e => e.name === name);
        if (!ep) return;

        try {
            const response = await fetch(ep.url, { cache: 'no-store' });
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const data = await response.json();
            
            // Clear connection lost state
            document.getElementById(ep.panelId)?.classList.remove('connection-lost');
            document.getElementById(ep.panelId)?.classList.add('loaded');

            // Dispatch custom window event
            window.dispatchEvent(new CustomEvent(`data:${ep.name}`, { detail: data }));
        } catch (error) {
            console.warn(`Polling error for ${ep.name}:`, error);
            // Show connection lost state
            document.getElementById(ep.panelId)?.classList.add('connection-lost');
        }
    }

    /**
     * Triggers an immediate re-poll of all endpoints.
     * Useful after a manual scrape.
     */
    async forceRefresh() {
        await new Promise(resolve => setTimeout(resolve, 1500));
        await this.pollAll();
    }
}

/**
 * Global function to trigger a manual scrape via POST request.
 */
async function triggerScrape() {
    const btn = document.getElementById('scrape-btn');
    const originalText = btn.innerHTML;
    
    try {
        btn.disabled = true;
        btn.innerHTML = '<span class="icon">⌛</span> Scraping...';
        
        const response = await fetch('/api/scrape/now', { method: 'POST' });
        const data = await response.json();
        
        if (data.status === 'started') {
            console.log("Scrape triggered successfully");
            // Re-poll after 2s delay
            if (window.poller) {
                await window.poller.forceRefresh();
            }
        }
    } catch (error) {
        console.error("Failed to trigger scrape:", error);
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}
