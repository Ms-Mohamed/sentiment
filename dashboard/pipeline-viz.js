/**
 * Pipeline Visualization Module
 * Handles the rendering and animation of the MapReduce pipeline nodes.
 */

const PIPELINE_STAGES = [
    { id: 1, name: "Nettoyage" },
    { id: 2, name: "NLP Sentiment" },
    { id: 3, name: "Hashtags" },
    { id: 4, name: "Anomalies" },
    { id: 5, name: "Vélocité ★" }
];

/**
 * Renders the pipeline structure in the DOM.
 */
function renderPipelineStructure() {
    console.log("FIX: 2 — Rendering Pipeline Structure");
    const container = document.getElementById('pipeline-viz-container');
    if (!container) {
        console.error("Pipeline container not found!");
        return;
    }

    container.innerHTML = '';
    
    PIPELINE_STAGES.forEach((stage, index) => {
        // Node
        const node = document.createElement('div');
        node.className = 'pipeline-node';
        node.id = `node-${stage.id}`;
        // FIX: 2 — Improve node positioning and label visibility
        node.style.position = 'relative';
        node.innerHTML = `<strong>${index + 1}</strong><div class="node-label" style="position:absolute; bottom:-30px; left:50%; transform:translateX(-50%); font-size:0.75rem; font-weight:600; color:var(--text-muted); white-space:nowrap;">${stage.name}</div>`;
        node.style.opacity = '0.4'; // Default pending
        node.style.cursor = 'pointer';
        node.style.willChange = 'opacity, transform';
        
        // Drawer
        const drawer = document.createElement('div');
        drawer.className = 'node-drawer';
        drawer.id = `drawer-${stage.id}`;
        drawer.innerHTML = `
            Records In: <span class="in">0</span><br>
            Out: <span class="out">0</span><br>
            Time: <span class="time">0</span>ms<br>
            <a href="#" class="view-code-btn" style="color: var(--accent-blue); text-decoration: none; font-size: 0.7rem; font-weight: bold; margin-top: 4px; display: inline-block; text-transform: uppercase; letter-spacing: 0.05em;">&lt;/&gt; Code Source</a>
        `;
        node.appendChild(drawer);

        // Code button click
        const codeBtn = drawer.querySelector('.view-code-btn');
        codeBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            openCodeViewer(stage.id, stage.name);
        });

        // Click interaction
        node.addEventListener('click', (e) => {
            e.stopPropagation();
            
            // Premium Single-Drawer Mode: Close other open drawers first
            document.querySelectorAll('.node-drawer').forEach(d => {
                if (d !== drawer) d.classList.remove('open');
            });
            
            drawer.classList.toggle('open');
        });

        container.appendChild(node);

        // Connector (except for last node)
        if (index < PIPELINE_STAGES.length - 1) {
            const connectorWrapper = document.createElement('div');
            connectorWrapper.className = `pipeline-connector connector-${stage.id}`;
            connectorWrapper.style.flex = '1';
            connectorWrapper.style.height = '3px';
            connectorWrapper.style.background = 'rgba(255, 255, 255, 0.08)';
            connectorWrapper.style.position = 'relative';
            connectorWrapper.style.margin = '0 10px';
            connectorWrapper.style.minWidth = '20px';
            connectorWrapper.style.borderRadius = '2px';
            connectorWrapper.style.overflow = 'hidden';
            connectorWrapper.style.transition = 'all 0.4s ease';

            // Add sliding laser light pulse beam inside the connector wrapper!
            const pulseBeam = document.createElement('div');
            pulseBeam.className = 'pulse-beam';
            connectorWrapper.appendChild(pulseBeam);

            container.appendChild(connectorWrapper);
        }
    });
}

/**
 * Updates the pipeline visualization based on incoming data.
 * @param {Array} pipelineData Array of pipeline status objects.
 */
function updatePipelineViz(pipelineData) {
    const statusText = document.getElementById('pipeline-status');
    let anyRunning = false;

    pipelineData.forEach(data => {
        const node = document.getElementById(`node-${data.job}`);
        if (!node) return;

        const drawer = document.getElementById(`drawer-${data.job}`);
        if (drawer) {
            drawer.querySelector('.in').innerText = data.records_in || 0;
            drawer.querySelector('.out').innerText = data.records_out || 0;
            drawer.querySelector('.time').innerText = data.duration_ms || 0;
        }

        // Reset active classes
        node.classList.remove('active');
        node.style.borderColor = 'var(--border)';

        const nextConnector = document.querySelector(`.connector-${data.job}`);

        if (data.status === 'pending') {
            gsap.to(node, { opacity: 0.4, duration: 0.3 });
            if (nextConnector) {
                nextConnector.className = `pipeline-connector connector-${data.job}`;
            }
        } else if (data.status === 'running') {
            anyRunning = true;
            node.classList.add('active');
            gsap.to(node, { opacity: 1, duration: 0.3 });
            if (nextConnector) {
                nextConnector.className = `pipeline-connector connector-${data.job} connector-line-active`;
            }
        } else if (data.status === 'done') {
            gsap.to(node, { opacity: 1, duration: 0.3 });
            node.style.borderColor = 'var(--accent-teal)';
            if (nextConnector) {
                nextConnector.className = `pipeline-connector connector-${data.job} connector-line-active`;
            }
            
            // Trigger spark particle burst ONLY on transition from running to done
            if (node.dataset.lastStatus === 'running') {
                popComplete(node);
                triggerSparkBurst(node);
            }
        } else if (data.status === 'error') {
            gsap.to(node, { opacity: 1, duration: 0.3 });
            node.style.borderColor = 'var(--accent-red)';
            if (nextConnector) {
                nextConnector.className = `pipeline-connector connector-${data.job} connector-line-error`;
            }
            if (node.dataset.lastStatus !== 'error') {
                shakeElement(node);
            }
        }

        node.dataset.lastStatus = data.status;
    });

    const hasRunning = pipelineData.some(d => d.status === 'running');
    if (statusText) {
        statusText.innerText = hasRunning ? "Processing..." : "Idle";
        statusText.style.color = hasRunning ? "var(--accent-teal)" : "var(--text-muted)";
    }
}

// MapReduce Academic Source Codes Map
const MAPREDUCE_CODES = {
    1: `# --- cleaning_mapper.py ---
import sys
import json
import re

# RegEx for cleaning French contractions & special characters
CONTRACTIONS = re.compile(r"\\b(j|l|d|s|c|m|t|qu)'", re.IGNORECASE)

def clean_text(text):
    # Split French contractions
    text = CONTRACTIONS.sub(r"\\1 ", text)
    # Remove URLs
    text = re.sub(r"https?://\\S+", "", text)
    # Normalize whitespaces
    return " ".join(text.split())

for line in sys.stdin:
    try:
        post = json.loads(line.strip())
        text = post.get("text", "")
        cleaned = clean_text(text)
        post["text"] = cleaned
        
        # Emit region and cleaned post JSON
        print(f"{post.get('region', 'National')}\\t{json.dumps(post)}")
    except Exception:
        continue`,
    2: `# --- sentiment_mapper.py ---
import sys
import json

# French stemming protection for specific homonyms
STEM_PROTECT = {"pays", "temps", "cours"}

def get_lexicon_score(word):
    # Lexicon mapping (French + Arabic Dialect Darija support)
    if word in {"bien", "bon", "zween", "adore", "dima", "top"}:
        return 3.0
    elif word in {"mauvais", "khayb", "nul", "glitch", "walo"}:
        return -3.0
    return 0.0

for line in sys.stdin:
    region, post_str = line.strip().split("\\t", 1)
    post = json.loads(post_str)
    
    words = post.get("text", "").lower().split()
    score = 0.0
    for word in words:
        if word not in STEM_PROTECT:
            score += get_lexicon_score(word)
            
    post["raw_score"] = score
    print(f"{region}\\t{json.dumps(post)}")`,
    3: `# --- hashtag_reducer.py ---
import sys
from collections import Counter

hashtag_counts = Counter()

for line in sys.stdin:
    # Key-Value Pair from Mapper
    tag, count_str = line.strip().split("\\t", 1)
    hashtag_counts[tag] += int(count_str)

# Emit Top 10 global hashtags
for tag, count in hashtag_counts.most_common(10):
    print(f"{tag}\\t{count}")`,
    4: `# --- anomaly_detector.py ---
import sys
import math

class RunningStats:
    def __init__(self):
        self.n = 0
        self.mean = 0.0
        self.M2 = 0.0

    def push(self, x):
        self.n += 1
        delta = x - self.mean
        self.mean += delta / self.n
        self.M2 += delta * (x - self.mean)

    @property
    def variance(self):
        return self.M2 / self.n if self.n > 1 else 0.0

    @property
    def stddev(self):
        return math.sqrt(self.variance)

# Streaming Anomaly Detection Worker
stats = RunningStats()
for line in sys.stdin:
    timestamp, count = line.strip().split("\\t", 1)
    count = int(count)
    
    if stats.n > 30:
        threshold = stats.mean + 3 * stats.stddev
        if count > threshold:
            print(f"ANOMALY\\t{timestamp}\\t{count}\\t(baseline: {stats.mean:.1f})")
            
    stats.push(count)`,
    5: `# --- velocity_mapper.py ---
import sys
import json

# Calculates derivative slope (dy/dt) of regional sentiments
for line in sys.stdin:
    region, post_data = line.strip().split("\\t", 1)
    post = json.loads(post_data)
    
    # Emit composite score based on timing intervals
    t = float(post.get("timestamp_epoch", 0.0))
    s = float(post.get("raw_score", 0.0))
    
    print(f"{region}\\t{t}\\t{s}")`
};

let codeViewerModal = null;

function createCodeViewerElement() {
    codeViewerModal = document.createElement('div');
    codeViewerModal.className = 'code-viewer-modal';
    codeViewerModal.id = 'code-viewer-modal';
    codeViewerModal.innerHTML = `
        <div class="code-viewer-content">
            <div class="code-viewer-header">
                <h3 class="code-viewer-title">
                    <span style="font-size: 1.25rem;">💻</span>
                    <span class="code-viewer-title-text">Script Source MapReduce</span>
                </h3>
                <button class="code-viewer-close">&times;</button>
            </div>
            <div class="code-viewer-body">
                <pre class="code-viewer-pre"><code class="python-code"></code></pre>
            </div>
        </div>
    `;
    document.body.appendChild(codeViewerModal);
    
    // Close events
    const closeBtn = codeViewerModal.querySelector('.code-viewer-close');
    closeBtn.addEventListener('click', closeCodeViewer);
    codeViewerModal.addEventListener('click', (e) => {
        if (e.target === codeViewerModal) closeCodeViewer();
    });
}

function highlightPythonCode(code) {
    // Escape HTML first
    let escaped = code
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
        
    // Format Comments
    escaped = escaped.replace(/(#.*)/g, '<span class="code-comment">$1</span>');
    
    // Format Strings (double and single quote)
    escaped = escaped.replace(/(".*?")/g, '<span class="code-string">$1</span>');
    escaped = escaped.replace(/('.*?')/g, '<span class="code-string">$1</span>');
    
    // Format Keywords
    const keywords = ['import', 'from', 'def', 'class', 'for', 'in', 'if', 'else', 'try', 'except', 'return', 'print', 'and', 'or', 'not', 'as'];
    keywords.forEach(keyword => {
        const re = new RegExp(`\\b${keyword}\\b`, 'g');
        escaped = escaped.replace(re, `<span class="code-keyword">${keyword}</span>`);
    });
    
    // Format Definitions
    escaped = escaped.replace(/\b(def|class)\s+(\w+)/g, '$1 <span class="code-def">$2</span>');
    
    // Format Numbers
    escaped = escaped.replace(/\b(\d+(?:\.\d+)?)\b/g, '<span class="code-number">$1</span>');
    
    return escaped;
}

function openCodeViewer(stageId, stageName) {
    if (!codeViewerModal) {
        createCodeViewerElement();
    }
    
    // Set Title
    const titleText = codeViewerModal.querySelector('.code-viewer-title-text');
    titleText.innerText = `Script MapReduce — Etape ${stageId} : ${stageName}`;
    
    // Get Code
    const rawCode = MAPREDUCE_CODES[stageId] || "# Code non disponible";
    const highlighted = highlightPythonCode(rawCode);
    
    const codeContainer = codeViewerModal.querySelector('.python-code');
    codeContainer.innerHTML = highlighted;
    
    // Open Animation
    codeViewerModal.style.display = 'flex';
    gsap.fromTo(codeViewerModal, 
        { opacity: 0 }, 
        { opacity: 1, duration: 0.3, ease: 'power2.out' }
    );
    gsap.fromTo(codeViewerModal.querySelector('.code-viewer-content'), 
        { scale: 0.9, opacity: 0 }, 
        { scale: 1, opacity: 1, duration: 0.4, ease: 'back.out(1.2)' }
    );
}

function closeCodeViewer() {
    if (!codeViewerModal) return;
    
    gsap.to(codeViewerModal.querySelector('.code-viewer-content'), {
        scale: 0.9,
        opacity: 0,
        duration: 0.3,
        ease: 'power2.in'
    });
    gsap.to(codeViewerModal, {
        opacity: 0,
        duration: 0.3,
        ease: 'power2.in',
        onComplete: () => {
            codeViewerModal.style.display = 'none';
        }
    });
}

/**
 * Triggers a beautiful glowing neon emerald particle burst from the completed node center.
 * @param {HTMLElement} node The completed pipeline node element.
 */
function triggerSparkBurst(node) {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    
    const rect = node.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    
    // Create 8 tiny glowing spark divs
    for (let i = 0; i < 8; i++) {
        const spark = document.createElement('div');
        spark.style.position = 'fixed';
        spark.style.left = `${x}px`;
        spark.style.top = `${y}px`;
        spark.style.width = '6px';
        spark.style.height = '6px';
        spark.style.borderRadius = '50%';
        spark.style.background = 'var(--accent-teal)';
        spark.style.boxShadow = '0 0 10px var(--accent-teal), 0 0 20px var(--accent-teal)';
        spark.style.pointerEvents = 'none';
        spark.style.zIndex = '99999';
        spark.style.transform = 'translate(-50%, -50%)';
        spark.style.willChange = 'transform, opacity';
        
        document.body.appendChild(spark);
        
        // Distribute sparks symmetrically in all directions with slight random variance
        const angle = (i * (360 / 8) + (Math.random() - 0.5) * 15) * (Math.PI / 180);
        const distance = 45 + Math.random() * 25; // absolute pixels travel
        const tx = Math.cos(angle) * distance;
        const ty = Math.sin(angle) * distance;
        
        gsap.to(spark, {
            x: tx,
            y: ty,
            opacity: 0,
            scale: 0.25,
            duration: 0.85,
            ease: 'power3.out',
            onComplete: () => spark.remove()
        });
    }
}

// Initialization
document.addEventListener('DOMContentLoaded', renderPipelineStructure);
window.addEventListener('data:pipeline', (e) => updatePipelineViz(e.detail));
