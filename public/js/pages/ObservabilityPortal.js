import { h } from 'https://esm.sh/preact';
import { useState, useEffect, useRef } from 'https://esm.sh/preact/hooks';
import htm from 'https://esm.sh/htm';
import { authState } from '../context/AuthContext.js';

const html = htm.bind(h);

export function ObservabilityPortal() {
  // Guard access
  if (!authState.token || (authState.user && authState.user.role !== 'ADMIN')) {
    return html`
      <div class="container" style="text-align: center; padding: 100px 0;">
        <span style="font-size: 48px; display: block; margin-bottom: 20px;">🛡️</span>
        <h2 style="color: var(--color-danger)">Access Denied</h2>
        <p style="color: var(--text-secondary); margin-top: 12px;">Only administrators have access to this portal.</p>
        <button class="btn btn-success" onClick=${() => window.location.hash = '#/'} style="margin-top: 20px;">
          Return to Dashboard
        </button>
      </div>
    `;
  }

  const [metrics, setMetrics] = useState({
    memory: { rss: 0, heapUsed: 0, heapTotal: 0 },
    uptime: 0,
    requestCount: 0,
    errorCount: 0,
    recentResponseTimes: [],
    dbStats: { totalUsers: 0, totalAuctions: 0, totalBids: 0 }
  });
  
  const [logs, setLogs] = useState([]);
  const terminalEndRef = useRef(null);
  const sseRef = useRef(null);

  useEffect(() => {
    // 1. Fetch initial statistics
    fetchStats();

    // 2. Open Server-Sent Events stream for metrics updates and live logs
    const sseUrl = `/api/observability/stream?token=${authState.token}`;
    const es = new EventSource(sseUrl);
    sseRef.current = es;

    es.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === 'metrics') {
          setMetrics((prev) => ({
            ...prev,
            ...payload.metrics
          }));
        } 
        else if (payload.type === 'log') {
          setLogs((prevLogs) => {
            const nextLogs = [...prevLogs, payload.log];
            // Keep last 150 log entries to prevent memory overflow
            if (nextLogs.length > 150) nextLogs.shift();
            return nextLogs;
          });
        }
      } catch (err) {
        console.error("Error parsing observability SSE packet:", err);
      }
    };

    es.onerror = (err) => {
      console.error("Observability SSE stream disconnected. Retrying...", err);
    };

    return () => {
      if (sseRef.current) {
        sseRef.current.close();
      }
    };
  }, []);

  // Auto-scroll logs terminal window on new logs
  useEffect(() => {
    if (terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  const fetchStats = async () => {
    try {
      const res = await fetch('/api/observability/metrics', {
        headers: { 'Authorization': `Bearer ${authState.token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setMetrics(data);
      }
    } catch (err) {
      console.error("Failed to query initial metrics:", err);
    }
  };

  const simulateActivity = async () => {
    // Simulates dynamic request latency for visualization
    try {
      await fetch('/api/auctions');
      fetchStats();
    } catch (err) {}
  };

  // ==========================================
  // RENDER DYNAMIC LATENCY GRAPH
  // ==========================================
  const renderLatencyChart = () => {
    const readings = metrics.recentResponseTimes || [];
    if (readings.length === 0) {
      return html`
        <div style="text-align: center; color: var(--text-muted); padding: 40px 0; font-size: 14px;">
          No response time metrics recorded yet. Trigger api requests to view graph.
        </div>
      `;
    }

    const latencies = readings.map(r => r.latency);
    const maxLat = Math.max(...latencies, 20);
    const minLat = Math.min(...latencies, 0);
    const range = maxLat - minLat;

    const width = 800;
    const height = 150;
    const padding = 20;

    const stepX = (width - padding * 2) / (readings.length > 1 ? (readings.length - 1) : 1);
    const points = [];

    readings.forEach((r, idx) => {
      const x = padding + idx * stepX;
      const y = height - padding - ((r.latency - minLat) / range) * (height - padding * 2);
      points.push({ x, y, ...r });
    });

    const polylinePath = points.map(p => `${p.x},${p.y}`).join(' ');

    return html`
      <svg class="chart-svg" viewBox="0 0 800 150" style="width: 100%; height: 180px;">
        <defs>
          <linearGradient id="latencyGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="var(--color-accent)" stop-opacity="0.25" />
            <stop offset="100%" stop-color="var(--color-accent)" stop-opacity="0" />
          </linearGradient>
        </defs>

        <!-- Horizontal guidelines -->
        <line x1=${padding} y1=${padding} x2=${width - padding} y2=${padding} stroke="var(--border-color)" stroke-dasharray="3" />
        <line x1=${padding} y1=${height / 2} x2=${width - padding} y2=${height / 2} stroke="var(--border-color)" stroke-dasharray="3" />
        <line x1=${padding} y1=${height - padding} x2=${width - padding} y2=${height - padding} stroke="var(--border-color)" />

        <!-- Line paths -->
        <polyline
          fill="none"
          stroke="var(--color-accent)"
          stroke-width="2.5"
          points=${polylinePath}
        />
        
        <polygon
          fill="url(#latencyGrad)"
          points="${padding},${height - padding} ${polylinePath} ${width - padding},${height - padding}"
        />

        <!-- Circle nodes -->
        ${points.map((p, idx) => html`
          <circle
            key=${idx}
            cx=${p.x}
            cy=${p.y}
            r="3"
            fill="var(--bg-main)"
            stroke=${p.status >= 400 ? 'var(--color-danger)' : 'var(--color-success)'}
            stroke-width="1.5"
            style="cursor: pointer;"
          >
            <title>[${p.method}] ${p.path} - ${p.status} (${p.latency}ms)</title>
          </circle>
        `)}
      </svg>
    `;
  };

  const formatUptime = (sec) => {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return `${h}h ${m}m ${s}s`;
  };

  return html`
    <div class="container">
      <div class="obs-dashboard">
        
        <!-- Header -->
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <div>
            <h2 style="font-size: 32px; font-weight: 800; display: flex; align-items: center; gap: 12px;">
              📊 Observability Dashboard
            </h2>
            <p style="color: var(--text-secondary); margin-top: 4px;">Real-time server resource tracking, telemetry charts, and structured logging feed.</p>
          </div>
          <button class="btn btn-success" onClick=${simulateActivity}>
            🔌 Test API Call
          </button>
        </div>

        <!-- Metrics Grid -->
        <div class="obs-metrics-grid">
          <div class="metric-card">
            <div class="metric-header">Uptime ⏱️</div>
            <div class="metric-nums" style="font-size: 24px;">${formatUptime(metrics.uptime)}</div>
            <div class="metric-subtext">Time since backend startup</div>
          </div>
          
          <div class="metric-card success">
            <div class="metric-header">Total Requests 🌐</div>
            <div class="metric-nums">${metrics.requestCount}</div>
            <div class="metric-subtext">Instrumented API calls</div>
          </div>

          <div class="metric-card danger">
            <div class="metric-header">Errors Logged 🚨</div>
            <div class="metric-nums" style=${metrics.errorCount > 0 ? 'color: var(--color-danger);' : ''}>
              ${metrics.errorCount}
            </div>
            <div class="metric-subtext">Total HTTP 4xx/5xx errors</div>
          </div>

          <div class="metric-card warning">
            <div class="metric-header">RAM Allocation 💾</div>
            <div class="metric-nums">${metrics.memory.heapUsed} <span style="font-size: 16px; color: var(--text-secondary);">MB</span></div>
            <div class="metric-subtext">Total heap RSS: ${metrics.memory.rss} MB</div>
          </div>
        </div>

        <!-- Latency Timeline -->
        <div class="chart-container">
          <div class="price-label" style="margin-bottom: 12px; display: flex; justify-content: space-between;">
            <span>📈 Recent API Request Latencies (milliseconds)</span>
            <span style="color: var(--color-accent);">Node.js Event-Loop Telemetry</span>
          </div>
          ${renderLatencyChart()}
        </div>

        <!-- Live Server Log Terminal Feed -->
        <div class="terminal-panel">
          <div class="terminal-header">
            <div class="terminal-title">
              📟 Live Structured Logs Streaming Console
            </div>
            <div class="terminal-dots">
              <div class="dot dot-red"></div>
              <div class="dot dot-yellow"></div>
              <div class="dot dot-green"></div>
            </div>
          </div>
          
          <div class="terminal-body">
            ${logs.length === 0 ? html`
              <div style="color: var(--text-muted); font-style: italic; padding: 20px 0;">
                System listening... logs will stream here as requests hit the backend.
              </div>
            ` : logs.map((log) => html`
              <div class="log-line log-${log.level.toLowerCase()}" key=${log.id}>
                [${new Date(log.timestamp).toLocaleTimeString()}] ${log.level}: ${log.message} ${log.details ? `\n  └─ Metadata: ${log.details}` : ''}
              </div>
            `)}
            <div ref=${terminalEndRef}></div>
          </div>
        </div>

        <!-- Database Stats Summary -->
        <div class="admin-list-card" style="padding: 20px;">
          <h4 style="font-size: 14px; text-transform: uppercase; color: var(--text-muted); margin-bottom: 16px;">📂 Relational Database Registry State</h4>
          <div style="display: flex; gap: 40px;">
            <div>
              <span style="font-size: 13px; color: var(--text-secondary);">Registered Users:</span>
              <strong style="margin-left: 6px; font-size: 16px;">${metrics.dbStats ? metrics.dbStats.totalUsers : 0}</strong>
            </div>
            <div>
              <span style="font-size: 13px; color: var(--text-secondary);">Auctions Hosted:</span>
              <strong style="margin-left: 6px; font-size: 16px;">${metrics.dbStats ? metrics.dbStats.totalAuctions : 0}</strong>
            </div>
            <div>
              <span style="font-size: 13px; color: var(--text-secondary);">Bids Recorded:</span>
              <strong style="margin-left: 6px; font-size: 16px;">${metrics.dbStats ? metrics.dbStats.totalBids : 0}</strong>
            </div>
          </div>
        </div>

      </div>
    </div>
  `;
}
