/**
 * Heatmap Module
 * Renders a Leaflet choropleth map of Morocco's regions with sentiment data.
 */

// Approximate GeoJSON for Morocco's 8 major regions
let MOROCCO_GEOJSON = null;

const CITY_COORDINATES = {
    "Casablanca": [33.5731, -7.5898],
    "Rabat": [34.0209, -6.8416],
    "Marrakech": [31.6295, -7.9811],
    "Fes": [34.0181, -5.0078],
    "Tangier": [35.7595, -5.8340],
    "Agadir": [30.4278, -9.5981],
    "Oujda": [34.6867, -1.9114],
    "Laayoune": [27.1253, -13.1625],
    "Dakhla": [23.6848, -15.9580]
};

const REGION_TO_CITY = {
    "Casablanca-Settat": "Casablanca",
    "Rabat-Salé": "Rabat",
    "Marrakech-Safi": "Marrakech",
    "Fès-Meknès": "Fes",
    "Tanger-Tétouan": "Tangier",
    "Souss-Massa": "Agadir",
    "Oriental": "Oujda",
    "Laâyoune-Sakia El Hamra": "Laayoune",
    "Dakhla-Oued Ed-Dahab": "Dakhla",
    "Béni Mellal-Khénifra": "Marrakech",
    "Drâa-Tafilalet": "Agadir",
    "Guelmim-Oued Noun": "Laayoune"
};

let map;
let markerLayerGroup;
let geojsonLayer;
let currentData = {};
let activeSelectedRegion = null;

// Global deselect listener
window.addEventListener('dashboard:region-deselect', () => {
    activeSelectedRegion = null;
    resetRegionHighlights();
});

/**
 * Initializes the Leaflet map and the GeoJSON layer.
 */
async function initMap() {
    console.log("FIX: 1 — Initializing Leaflet Map");
    map = L.map('map', {
        zoomControl: false,
        attributionControl: false,
        dragging: false,
        scrollWheelZoom: false,
        doubleClickZoom: false
    }).setView([28.3, -10.0], 5);

    // FIX: 1 — Handle container sizing issues
    setTimeout(() => {
        if (map) map.invalidateSize();
    }, 500);

    // Custom dark theme tiles
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png', {
        subdomains: 'abcd',
        maxZoom: 20
    }).addTo(map);

    try {
        const response = await fetch('morocco-regions-fixed.geojson');
        MOROCCO_GEOJSON = await response.json();
    } catch (error) {
        console.error("Failed to load GeoJSON:", error);
        return;
    }

    // Initial GeoJSON render (empty state)
    geojsonLayer = L.geoJSON(MOROCCO_GEOJSON, {
        style: {
            fillColor: '#444441', // Neutral
            weight: 1,
            opacity: 1,
            color: 'var(--border)',
            fillOpacity: 0.8
        },
        onEachFeature: onEachFeature
    }).addTo(map);

    // If data arrived while map was still initializing, apply it now
    if (currentData && Object.keys(currentData).length > 0) {
        updateHeatmap(currentData);
    }

    // Add custom glassmorphic map legend control overlay
    const legend = L.control({ position: 'bottomright' });
    legend.onAdd = function () {
        const div = L.DomUtil.create('div', 'map-legend');
        div.innerHTML = `
            <h4 style="margin: 0 0 8px 0; font-size: 0.75rem; text-transform: uppercase; color: var(--text-muted); letter-spacing: 0.05em; font-weight: bold;">Sentiment Index</h4>
            <div style="display: flex; flex-direction: column; gap: 6px;">
                <div style="display: flex; align-items: center; justify-content: space-between; font-size: 0.7rem; font-weight: bold; margin-bottom: 2px;">
                    <span style="color: #A32D2D;">Doléance</span>
                    <span style="color: #B89334;">Neutre</span>
                    <span style="color: #0F6E56;">Fierté</span>
                </div>
                <div style="width: 100%; height: 8px; background: linear-gradient(90deg, #A32D2D 0%, #B89334 50%, #0F6E56 100%); border-radius: 4px; border: 1px solid rgba(255,255,255,0.08);"></div>
                <div style="display: flex; justify-content: space-between; font-size: 0.65rem; color: var(--text-muted); font-family: monospace;">
                    <span>-1.0</span>
                    <span>0.0</span>
                    <span>+1.0</span>
                </div>
            </div>
        `;
        return div;
    };
    legend.addTo(map);

    // Initialize active marker layer group
    markerLayerGroup = L.layerGroup().addTo(map);

    // Ensure CSS transition on SVG paths
    const paths = document.querySelectorAll('.leaflet-interactive');
    paths.forEach(path => {
        path.style.transition = 'fill 0.6s ease';
    });

    // Map entrance animation
    const mapContainer = document.getElementById('map');
    gsap.fromTo(mapContainer, { opacity: 0 }, { opacity: 1, duration: 0.8, delay: 0.5 });
}

/**
 * Attaches tooltip and hover events to each map region.
 * @param {Object} feature 
 * @param {Object} layer 
 */
function onEachFeature(feature, layer) {
    layer.on({
        mouseover: (e) => {
            const regionName = feature.properties.name;
            const data = currentData[regionName] || { score: 0.0, count: 0 };
            
            const score = data.score;
            const sentimentLabel = data.count === 0 ? 'Aucun Post' : (score > 0.15 ? 'Positif' : (score < -0.15 ? 'Négatif' : 'Neutre'));
            const sentimentColor = data.count === 0 ? 'var(--text-muted)' : (score > 0.15 ? 'var(--accent-teal)' : (score < -0.15 ? 'var(--accent-red)' : 'var(--text-muted)'));
            
            // Premium glassmorphic tooltip layout
            const content = `
                <div style="min-width: 170px;">
                    <div style="font-size: 0.8rem; font-weight: bold; color: var(--accent-blue); margin-bottom: 6px; border-bottom: 1px solid rgba(255,255,255,0.08); padding-bottom: 4px;">
                        📍 ${regionName}
                    </div>
                    <div style="display: flex; justify-content: space-between; font-size: 0.75rem; margin-bottom: 4px;">
                        <span style="color: var(--text-muted);">Volume Posts:</span>
                        <span style="color: white; font-weight: bold;">${data.count}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; font-size: 0.75rem; margin-bottom: 4px;">
                        <span style="color: var(--text-muted);">Sentiment:</span>
                        <span style="color: ${sentimentColor}; font-weight: bold; font-family: monospace;">
                            ${data.count === 0 ? '0.00' : (score > 0 ? '+' : '') + score.toFixed(2)}
                        </span>
                    </div>
                    <div style="display: flex; justify-content: space-between; font-size: 0.75rem;">
                        <span style="color: var(--text-muted);">Tendance:</span>
                        <span style="color: ${sentimentColor}; font-weight: bold; text-transform: uppercase; font-size: 0.65rem; letter-spacing: 0.05em;">
                            ${sentimentLabel}
                        </span>
                    </div>
                </div>
            `;
            
            layer.bindTooltip(content, { sticky: true, className: 'custom-tooltip', opacity: 1 }).openTooltip();
            
            // Animate tooltip container entrance smoothly via GSAP
            const tooltipNode = layer.getTooltip()._container;
            if (tooltipNode) {
                gsap.fromTo(tooltipNode, { opacity: 0, scale: 0.95 }, { opacity: 1, scale: 1, duration: 0.18, ease: 'back.out(1.2)' });
            }
            
            // Polygon layer neon glow on hover (if not currently locked by selection)
            if (activeSelectedRegion !== regionName) {
                layer.setStyle({
                    weight: 2.5,
                    color: '#00d2ff', // Neon Cyan glow outline
                    fillOpacity: 0.95
                });
                if (!L.Browser.ie && !L.Browser.opera && !L.Browser.edge) {
                    layer.bringToFront();
                }
            }
        },
        mouseout: (e) => {
            layer.closeTooltip();
            
            // Restore default styled polygon (if not selected)
            const regionName = feature.properties.name;
            if (activeSelectedRegion !== regionName) {
                const data = currentData[regionName];
                const color = data ? getColorForScore(data.score !== undefined ? data.score : 0.0) : '#444441';
                layer.setStyle({
                    weight: 1,
                    color: 'var(--border)',
                    fillColor: color,
                    fillOpacity: 0.8
                });
            }
        },
        click: (e) => {
            const regionName = feature.properties.name;
            if (activeSelectedRegion === regionName) {
                activeSelectedRegion = null;
                resetRegionHighlights();
                window.dispatchEvent(new CustomEvent('dashboard:region-select', { detail: { region: null } }));
            } else {
                activeSelectedRegion = regionName;
                highlightRegion(layer);
                window.dispatchEvent(new CustomEvent('dashboard:region-select', { detail: { region: regionName } }));
            }
        }
    });
}

/**
 * Calculates color based on sentiment score using gsap.utils.mapRange and interpolate.
 * We use mapRange to safely normalize the [-1, 1] sentiment domain into a [0, 1] percentage,
 * which is then used by interpolate to find the exact HEX color between our defined stops.
 * @param {number} score The sentiment score between -1.0 and 1.0.
 * @returns {string} HEX color code.
 */
function getColorForScore(score) {
    // Map score (-1 to 1) to progress (0 to 1)
    const progress = gsap.utils.mapRange(-1, 1, 0, 1, score);

    
    // Interpolate between colors
    if (progress < 0.5) {
        // -1 to 0: Dark Red to Amber (Neutral)
        return gsap.utils.interpolate('#A32D2D', '#B89334', progress * 2);
    } else {
        // 0 to 1: Amber (Neutral) to Dark Teal
        return gsap.utils.interpolate('#B89334', '#0F6E56', (progress - 0.5) * 2);
    }
}

/**
 * Animates the initial filling of regions.
 */
function animateInitialFill() {
    const paths = document.querySelectorAll('.leaflet-interactive');
    paths.forEach((path, index) => {
        setTimeout(() => {
            path.style.fillOpacity = 0.8;
        }, index * 100);
    });
}

/**
 * Updates the heatmap with new data.
 * @param {Object} data 
 */
function updateHeatmap(data) {
    currentData = data;
    
    if (!geojsonLayer) return;
    
    geojsonLayer.eachLayer(layer => {
        const regionName = layer.feature.properties.name;
        const regionData = data[regionName];
        
        let newColor = '#444441'; // Default neutral
        if (regionData !== undefined) {
            newColor = getColorForScore(regionData.score);
        }

        layer.setStyle({
            fillColor: newColor
        });
    });
}

function highlightRegion(targetLayer) {
    resetRegionHighlights();
    targetLayer.setStyle({
        weight: 3,
        color: '#00d2ff', // Neon Cyan highlight border!
        fillOpacity: 0.95
    });
    if (!L.Browser.ie && !L.Browser.opera && !L.Browser.edge) {
        targetLayer.bringToFront();
    }
}

function resetRegionHighlights() {
    if (!geojsonLayer) return;
    geojsonLayer.eachLayer(layer => {
        const regionName = layer.feature.properties.name;
        const data = currentData[regionName];
        const color = data ? getColorForScore(data.score !== undefined ? data.score : 0.0) : '#444441';
        layer.setStyle({
            weight: 1,
            color: 'var(--border)',
            fillColor: color,
            fillOpacity: 0.8
        });
    });
}

// Initialization and Event Listeners
document.addEventListener('DOMContentLoaded', initMap);
window.addEventListener('ui:animateHeatmap', animateInitialFill);
window.addEventListener('data:heatmap', (e) => {
    // Cache baseline if timeline is at direct live state
    const slider = document.getElementById('timeline-slider');
    if (slider && parseInt(slider.value) !== 24) {
        // Ignore background updates during simulated history travel!
        return;
    }
    if (!window.currentRawHeatmapData || (slider && parseInt(slider.value) === 24)) {
        window.currentRawHeatmapData = e.detail;
    }
    if (typeof window.isFilterActive === 'function' && window.isFilterActive()) {
        if (typeof applyGlobalSearchFilter === 'function') applyGlobalSearchFilter();
    } else {
        updateHeatmap(e.detail);
    }
});

window.addEventListener('data:heatmap_internal', (e) => {
    if (typeof window.isFilterActive === 'function' && window.isFilterActive()) {
        if (typeof applyGlobalSearchFilter === 'function') applyGlobalSearchFilter();
    } else {
        updateHeatmap(e.detail);
        
        // If a region is actively focused, dispatch event to refresh drawer metrics live!
        if (typeof activeSelectedRegion !== 'undefined' && activeSelectedRegion) {
            window.dispatchEvent(new CustomEvent('data:heatmap', { detail: e.detail }));
        }
    }
});

/**
 * Places geolocated pulsating markers on the map for active feed posts.
 * @param {Array} posts 
 */
function updatePostMarkers(posts) {
    if (!markerLayerGroup) return;
    
    // Clear existing markers
    markerLayerGroup.clearLayers();
    
    if (!posts || posts.length === 0) return;
    
    // Limit to top 5 posts to keep the interface clean and gorgeous
    posts.slice(0, 5).forEach(post => {
        const city = REGION_TO_CITY[post.region];
        if (!city) return;
        
        const coords = CITY_COORDINATES[city];
        if (!coords) return;
        
        // Define color based on sentiment polarity
        const score = post.raw_score;
        const color = score > 0 ? 'var(--accent-teal)' : (score < 0 ? 'var(--accent-red)' : 'var(--text-muted)');
        
        // Create custom pulsating neon icon
        const pulseIcon = L.divIcon({
            className: 'pulsating-map-marker',
            html: `
                <div class="pulse-ring" style="border-color: ${color};"></div>
                <div class="pulse-dot" style="background: ${color}; box-shadow: 0 0 10px ${color};"></div>
            `,
            iconSize: [20, 20],
            iconAnchor: [10, 10]
        });
        
        // Slightly jitter coordinates by a tiny random amount so multiple posts in the same city don't completely overlap
        const jitteredCoords = [
            coords[0] + (Math.random() - 0.5) * 0.15,
            coords[1] + (Math.random() - 0.5) * 0.15
        ];
        
        const marker = L.marker(jitteredCoords, { icon: pulseIcon });
        
        // Build premium glassmorphic popup
        const popupContent = `
            <div class="glass-popup" style="font-family: var(--font); color: white; background: rgba(13, 17, 23, 0.95); backdrop-filter: blur(8px); border: 1px solid var(--border-glow); padding: 10px; border-radius: var(--radius-md); min-width: 180px; box-shadow: 0 4px 15px rgba(0,0,0,0.5);">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; border-bottom: 1px solid rgba(255,255,255,0.08); padding-bottom: 4px;">
                    <span style="font-size: 0.75rem; font-weight: bold; color: var(--accent-blue);">${post.username}</span>
                    <span style="font-size: 0.65rem; color: var(--text-muted); font-weight: bold;">📍 ${city}</span>
                </div>
                <div style="font-size: 0.75rem; margin-bottom: 8px; line-height: 1.4; font-style: italic; color: var(--text-primary);">"${post.text}"</div>
                <div style="display: flex; justify-content: space-between; font-size: 0.7rem; font-weight: bold; align-items: center;">
                    <span style="color: var(--text-muted);">Sentiment:</span>
                    <span style="color: ${color}; font-family: monospace; font-size: 0.8rem;">
                        ${score > 0 ? '+' : ''}${score.toFixed(1)}
                    </span>
                </div>
            </div>
        `;
        
        marker.bindPopup(popupContent, { 
            closeButton: false, 
            className: 'custom-leaflet-popup'
        });
        
        markerLayerGroup.addLayer(marker);
    });
}

// Bind live post updates to geolocated map markers
window.addEventListener('data:feed', (e) => {
    const slider = document.getElementById('timeline-slider');
    if (slider && parseInt(slider.value) !== 24) return;
    updatePostMarkers(e.detail);
});
window.addEventListener('data:feed_internal', (e) => updatePostMarkers(e.detail));
