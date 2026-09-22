/* ═══════════════════════════════════════════════════════
   Shortest Path Visualizer — App Logic
   Graph editor, canvas rendering, Dijkstra animation
   ═══════════════════════════════════════════════════════ */

(function () {
    'use strict';

    /* ── State ── */
    const state = {
        nodes: [],       // { id, x, y, label }
        edges: [],       // { from, to, weight }
        source: null,
        destination: null,
        tool: 'addNode', // addNode | addEdge | setSource | setDest | delete
        edgeStart: null,
        animating: false,
        visitedSet: new Set(),
        pathSet: new Set(),
        pathEdges: new Set(),
        hoverNode: null,
        hoverEdge: null,
        dragNode: null,
        dragOffsetX: 0,
        dragOffsetY: 0,
    };

    let nextId = 0;
    const NODE_RADIUS = 22;

    /* ── DOM refs ── */
    const canvas = document.getElementById('graphCanvas');
    const ctx = canvas.getContext('2d');
    const hint = document.getElementById('canvasHint');
    const statusBadge = document.getElementById('statusBadge');
    const speedSlider = document.getElementById('speedSlider');
    const speedValue = document.getElementById('speedValue');
    const weightModal = document.getElementById('weightModal');
    const weightInput = document.getElementById('weightInput');
    const resultCard = document.getElementById('resultCard');
    const distTableWrap = document.getElementById('distanceTableWrapper');
    const logContainer = document.getElementById('logContainer');

    const toolBtns = {
        addNode: document.getElementById('btnAddNode'),
        addEdge: document.getElementById('btnAddEdge'),
        setSource: document.getElementById('btnSetSource'),
        setDest: document.getElementById('btnSetDest'),
        delete: document.getElementById('btnDelete'),
    };

    /* ── Particles ── */
    (function initParticles() {
        const container = document.getElementById('bgParticles');
        for (let i = 0; i < 30; i++) {
            const p = document.createElement('div');
            p.className = 'particle';
            const size = Math.random() * 4 + 2;
            p.style.width = size + 'px';
            p.style.height = size + 'px';
            p.style.left = Math.random() * 100 + '%';
            p.style.animationDuration = (Math.random() * 15 + 10) + 's';
            p.style.animationDelay = (Math.random() * 10) + 's';
            container.appendChild(p);
        }
    })();

    /* ── Canvas resize ── */
    function resizeCanvas() {
        const rect = canvas.parentElement.getBoundingClientRect();
        canvas.width = rect.width * devicePixelRatio;
        canvas.height = rect.height * devicePixelRatio;
        canvas.style.width = rect.width + 'px';
        canvas.style.height = rect.height + 'px';
        ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
        draw();
    }
    window.addEventListener('resize', resizeCanvas);
    setTimeout(resizeCanvas, 50);

    /* ── Tool selection ── */
    const hints = {
        addNode: 'Click canvas to add a node',
        addEdge: 'Click a node, then another to connect',
        setSource: 'Click a node to set as source (green)',
        setDest: 'Click a node to set as destination (red)',
        delete: 'Click a node or edge to delete it',
    };

    function setTool(tool) {
        state.tool = tool;
        state.edgeStart = null;
        Object.values(toolBtns).forEach(b => b.classList.remove('active'));
        toolBtns[tool].classList.add('active');
        hint.textContent = hints[tool];
        hint.classList.remove('hidden');
        canvas.style.cursor = tool === 'delete' ? 'not-allowed' : 'crosshair';
    }

    Object.keys(toolBtns).forEach(t => {
        toolBtns[t].addEventListener('click', () => setTool(t));
    });

    /* ── Helpers ── */
    function getCanvasPos(e) {
        const r = canvas.getBoundingClientRect();
        return { x: e.clientX - r.left, y: e.clientY - r.top };
    }

    function findNode(x, y) {
        for (let i = state.nodes.length - 1; i >= 0; i--) {
            const n = state.nodes[i];
            if (Math.hypot(n.x - x, n.y - y) <= NODE_RADIUS + 4) return n;
        }
        return null;
    }

    function findEdge(x, y) {
        for (const e of state.edges) {
            const a = state.nodes.find(n => n.id === e.from);
            const b = state.nodes.find(n => n.id === e.to);
            if (!a || !b) continue;
            const dist = pointToSegDist(x, y, a.x, a.y, b.x, b.y);
            if (dist < 10) return e;
        }
        return null;
    }

    function pointToSegDist(px, py, ax, ay, bx, by) {
        const dx = bx - ax, dy = by - ay;
        const lenSq = dx * dx + dy * dy;
        if (lenSq === 0) return Math.hypot(px - ax, py - ay);
        let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
        t = Math.max(0, Math.min(1, t));
        return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
    }

    function nodeIndex(id) {
        return state.nodes.findIndex(n => n.id === id);
    }

    function edgeKey(i, j) { return Math.min(i, j) + '-' + Math.max(i, j); }

    function updateInfo() {
        document.getElementById('infoNodes').textContent = state.nodes.length;
        document.getElementById('infoEdges').textContent = state.edges.length;
        document.getElementById('infoSource').textContent = state.source !== null ? state.source : '—';
        document.getElementById('infoDest').textContent = state.destination !== null ? state.destination : '—';
    }

    /* ── Drawing ── */
    function draw() {
        const w = canvas.width / devicePixelRatio;
        const h = canvas.height / devicePixelRatio;
        ctx.clearRect(0, 0, w, h);

        // Grid dots
        ctx.fillStyle = 'rgba(255,255,255,0.03)';
        for (let gx = 20; gx < w; gx += 40) {
            for (let gy = 20; gy < h; gy += 40) {
                ctx.beginPath();
                ctx.arc(gx, gy, 1, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        // Edges
        for (const e of state.edges) {
            const a = state.nodes.find(n => n.id === e.from);
            const b = state.nodes.find(n => n.id === e.to);
            if (!a || !b) continue;
            const ai = nodeIndex(e.from), bi = nodeIndex(e.to);
            const ek = edgeKey(ai, bi);
            const isPath = state.pathEdges.has(ek);
            const isHover = state.hoverEdge === e;

            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.strokeStyle = isPath ? '#06b6d4' : isHover ? '#94a3b8' : '#334155';
            ctx.lineWidth = isPath ? 3.5 : isHover ? 2.5 : 1.8;
            if (isPath) {
                ctx.shadowColor = 'rgba(6,182,212,0.5)';
                ctx.shadowBlur = 12;
            }
            ctx.stroke();
            ctx.shadowColor = 'transparent';
            ctx.shadowBlur = 0;

            // Weight label
            const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
            ctx.font = '600 12px Inter, sans-serif';
            ctx.fillStyle = isPath ? '#06b6d4' : '#94a3b8';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            const angle = Math.atan2(b.y - a.y, b.x - a.x);
            const ox = Math.sin(angle) * 14;
            const oy = -Math.cos(angle) * 14;
            ctx.fillText(e.weight, mx + ox, my + oy);
        }

        // Nodes
        for (const n of state.nodes) {
            const idx = nodeIndex(n.id);
            const isSource = idx === state.source;
            const isDest = idx === state.destination;
            const isVisited = state.visitedSet.has(idx);
            const isOnPath = state.pathSet.has(idx);
            const isHover = state.hoverNode === n;
            const isEdgeStart = state.edgeStart === n;

            let color = '#3b82f6';
            let glow = 'rgba(59,130,246,0.3)';
            if (isOnPath) { color = '#06b6d4'; glow = 'rgba(6,182,212,0.5)'; }
            else if (isVisited) { color = '#f59e0b'; glow = 'rgba(245,158,11,0.4)'; }
            if (isSource) { color = '#10b981'; glow = 'rgba(16,185,129,0.5)'; }
            if (isDest) { color = '#ef4444'; glow = 'rgba(239,68,68,0.5)'; }
            if (isEdgeStart) { color = '#8b5cf6'; glow = 'rgba(139,92,246,0.5)'; }

            // Shadow glow
            ctx.beginPath();
            ctx.arc(n.x, n.y, NODE_RADIUS, 0, Math.PI * 2);
            ctx.shadowColor = glow;
            ctx.shadowBlur = isHover || isOnPath ? 20 : 10;
            ctx.fillStyle = color;
            ctx.fill();
            ctx.shadowColor = 'transparent';
            ctx.shadowBlur = 0;

            // Border
            ctx.beginPath();
            ctx.arc(n.x, n.y, NODE_RADIUS, 0, Math.PI * 2);
            ctx.strokeStyle = isHover ? '#fff' : 'rgba(255,255,255,0.2)';
            ctx.lineWidth = isHover ? 2.5 : 1.5;
            ctx.stroke();

            // Label
            ctx.font = '700 13px Inter, sans-serif';
            ctx.fillStyle = '#fff';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(n.label, n.x, n.y);
        }
    }

    /* ── Canvas Events ── */
    let pendingEdgeResolve = null;

    canvas.addEventListener('mousedown', (e) => {
        if (state.animating) return;
        const pos = getCanvasPos(e);
        const node = findNode(pos.x, pos.y);

        if (node && state.tool !== 'delete') {
            // Start drag
            state.dragNode = node;
            state.dragOffsetX = pos.x - node.x;
            state.dragOffsetY = pos.y - node.y;
        }
    });

    canvas.addEventListener('mousemove', (e) => {
        const pos = getCanvasPos(e);
        if (state.dragNode) {
            state.dragNode.x = pos.x - state.dragOffsetX;
            state.dragNode.y = pos.y - state.dragOffsetY;
            draw();
            return;
        }
        const prev = state.hoverNode;
        state.hoverNode = findNode(pos.x, pos.y);
        state.hoverEdge = state.hoverNode ? null : findEdge(pos.x, pos.y);
        if (state.hoverNode !== prev || state.hoverEdge) draw();
    });

    canvas.addEventListener('mouseup', (e) => {
        if (state.dragNode) {
            state.dragNode = null;
            return;
        }
    });

    canvas.addEventListener('click', (e) => {
        if (state.animating || state.dragNode) return;
        const pos = getCanvasPos(e);
        const node = findNode(pos.x, pos.y);
        const edge = node ? null : findEdge(pos.x, pos.y);

        switch (state.tool) {
            case 'addNode':
                if (!node) {
                    state.nodes.push({ id: nextId++, x: pos.x, y: pos.y, label: String(state.nodes.length) });
                    updateInfo(); draw();
                }
                break;

            case 'addEdge':
                if (node) {
                    if (!state.edgeStart) {
                        state.edgeStart = node;
                        draw();
                    } else if (node !== state.edgeStart) {
                        const from = state.edgeStart, to = node;
                        state.edgeStart = null;
                        showWeightModal().then(w => {
                            if (w !== null) {
                                const exists = state.edges.find(e =>
                                    (e.from === from.id && e.to === to.id) ||
                                    (e.from === to.id && e.to === from.id));
                                if (!exists) {
                                    state.edges.push({ from: from.id, to: to.id, weight: w });
                                    updateInfo(); draw();
                                }
                            }
                        });
                    }
                }
                break;

            case 'setSource':
                if (node) { state.source = nodeIndex(node.id); updateInfo(); draw(); }
                break;

            case 'setDest':
                if (node) { state.destination = nodeIndex(node.id); updateInfo(); draw(); }
                break;

            case 'delete':
                if (node) {
                    const idx = nodeIndex(node.id);
                    if (state.source === idx) state.source = null;
                    else if (state.source > idx) state.source--;
                    if (state.destination === idx) state.destination = null;
                    else if (state.destination > idx) state.destination--;
                    state.edges = state.edges.filter(e => e.from !== node.id && e.to !== node.id);
                    state.nodes = state.nodes.filter(n => n.id !== node.id);
                    state.nodes.forEach((n, i) => n.label = String(i));
                    updateInfo(); draw();
                } else if (edge) {
                    state.edges = state.edges.filter(e => e !== edge);
                    updateInfo(); draw();
                }
                break;
        }
    });

    /* ── Weight Modal ── */
    function showWeightModal() {
        return new Promise(resolve => {
            weightInput.value = 1;
            weightModal.classList.add('active');
            weightInput.focus();
            weightInput.select();

            function cleanup() {
                weightModal.classList.remove('active');
                document.getElementById('weightConfirm').removeEventListener('click', onConfirm);
                document.getElementById('weightCancel').removeEventListener('click', onCancel);
                weightInput.removeEventListener('keydown', onKey);
            }
            function onConfirm() { cleanup(); resolve(Math.max(1, parseInt(weightInput.value) || 1)); }
            function onCancel() { cleanup(); resolve(null); }
            function onKey(e) { if (e.key === 'Enter') onConfirm(); if (e.key === 'Escape') onCancel(); }

            document.getElementById('weightConfirm').addEventListener('click', onConfirm);
            document.getElementById('weightCancel').addEventListener('click', onCancel);
            weightInput.addEventListener('keydown', onKey);
        });
    }

    /* ── Speed slider ── */
    speedSlider.addEventListener('input', () => {
        speedValue.textContent = (1050 - parseInt(speedSlider.value)) + 'ms';
    });
    function getSpeed() { return 1050 - parseInt(speedSlider.value); }

    /* ── Dijkstra in JS (mirrors the C backend logic) ── */
    function dijkstraJS(n, edges, source, destination) {
        const INF = 999999999;
        const adj = Array.from({ length: n }, () => new Array(n).fill(0));
        for (const e of edges) {
            if (e.from >= 0 && e.from < n && e.to >= 0 && e.to < n) {
                adj[e.from][e.to] = e.weight;
                adj[e.to][e.from] = e.weight; // undirected
            }
        }

        const dist = new Array(n).fill(INF);
        const prev = new Array(n).fill(-1);
        const visited = new Array(n).fill(false);
        const visitOrder = [];
        dist[source] = 0;

        for (let iter = 0; iter < n; iter++) {
            let u = -1;
            for (let i = 0; i < n; i++) {
                if (!visited[i] && (u === -1 || dist[i] < dist[u])) u = i;
            }
            if (u === -1 || dist[u] === INF) break;
            visited[u] = true;
            visitOrder.push(u);

            for (let v = 0; v < n; v++) {
                if (adj[u][v] > 0 && !visited[v]) {
                    const nd = dist[u] + adj[u][v];
                    if (nd < dist[v]) { dist[v] = nd; prev[v] = u; }
                }
            }
        }

        // Build path
        const path = [];
        if (dist[destination] < INF) {
            let cur = destination;
            while (cur !== -1) { path.push(cur); cur = prev[cur]; }
            path.reverse();
        }

        return {
            path,
            distance: dist[destination] < INF ? dist[destination] : -1,
            visited_order: visitOrder,
            distances: dist.map(d => d < INF ? d : -1),
        };
    }

    /* ── Run Dijkstra ── */
    document.getElementById('btnRun').addEventListener('click', runDijkstra);

    async function runDijkstra() {
        if (state.animating) return;
        if (state.nodes.length < 2) return showError('Add at least 2 nodes');
        if (state.source === null || state.destination === null) return showError('Set source and destination');
        if (state.edges.length === 0) return showError('Add at least one edge');

        const idxEdges = state.edges.map(e => ({
            from: nodeIndex(e.from),
            to: nodeIndex(e.to),
            weight: e.weight,
        }));

        setStatus('running', 'Computing…');
        state.animating = true;
        clearResults();

        try {
            const data = dijkstraJS(state.nodes.length, idxEdges, state.source, state.destination);
            await animateResult(data);
            displayResult(data);
            setStatus('ready', 'Done');
        } catch (err) {
            setStatus('error', 'Error');
            showError(err.message);
        }
        state.animating = false;
    }

    /* ── Animate ── */
    async function animateResult(data) {
        state.visitedSet.clear();
        state.pathSet.clear();
        state.pathEdges.clear();
        logContainer.innerHTML = '';
        const speed = getSpeed();

        // Animate visited nodes
        for (const v of data.visited_order) {
            state.visitedSet.add(v);
            addLog(`Visiting node ${v}`, 'visit');
            draw();
            await sleep(speed);
        }

        // Animate shortest path
        if (data.path.length > 0) {
            for (let i = 0; i < data.path.length; i++) {
                state.pathSet.add(data.path[i]);
                if (i > 0) {
                    state.pathEdges.add(edgeKey(data.path[i - 1], data.path[i]));
                    addLog(`Path: ${data.path[i - 1]} → ${data.path[i]}`, 'path');
                }
                draw();
                await sleep(speed * 0.7);
            }
            addLog(`✓ Shortest distance: ${data.distance}`, 'done');
        } else {
            addLog('✗ No path found', 'visit');
        }
    }

    function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

    /* ── Display Results ── */
    function displayResult(data) {
        if (data.distance === -1 || data.path.length === 0) {
            resultCard.innerHTML = '<div class="result-no-path">No path exists between source and destination</div>';
        } else {
            let pathHtml = '<div class="result-path">';
            data.path.forEach((p, i) => {
                if (i > 0) pathHtml += '<span class="path-arrow">→</span>';
                pathHtml += `<span class="path-node">${p}</span>`;
            });
            pathHtml += '</div>';
            pathHtml += `<div class="result-distance"><span class="dist-label">Total Distance</span><span class="dist-value">${data.distance}</span></div>`;
            resultCard.innerHTML = pathHtml;
        }

        // Distance table
        let tHtml = '<table class="distance-table"><thead><tr><th>Node</th><th>Distance</th></tr></thead><tbody>';
        data.distances.forEach((d, i) => {
            const cls = d === -1 ? 'dist-inf' : 'dist-cell';
            tHtml += `<tr><td>${i}</td><td class="${cls}">${d === -1 ? '∞' : d}</td></tr>`;
        });
        tHtml += '</tbody></table>';
        distTableWrap.innerHTML = tHtml;
    }

    function clearResults() {
        state.visitedSet.clear();
        state.pathSet.clear();
        state.pathEdges.clear();
        resultCard.innerHTML = '<div class="result-placeholder">Computing…</div>';
        distTableWrap.innerHTML = '<div class="result-placeholder">Computing…</div>';
        logContainer.innerHTML = '';
    }

    function addLog(msg, type) {
        const div = document.createElement('div');
        div.className = 'log-entry ' + type;
        div.textContent = msg;
        logContainer.appendChild(div);
        logContainer.scrollTop = logContainer.scrollHeight;
    }

    function showError(msg) {
        resultCard.innerHTML = `<div class="result-no-path">${msg}</div>`;
    }

    function setStatus(type, text) {
        statusBadge.className = 'status-badge' + (type === 'ready' ? '' : ' ' + type);
        statusBadge.textContent = text;
    }

    /* ── Random Graph ── */
    document.getElementById('btnRandomGraph').addEventListener('click', () => {
        if (state.animating) return;
        state.nodes = [];
        state.edges = [];
        state.visitedSet.clear();
        state.pathSet.clear();
        state.pathEdges.clear();
        nextId = 0;

        const w = canvas.width / devicePixelRatio;
        const h = canvas.height / devicePixelRatio;
        const count = 6 + Math.floor(Math.random() * 5); // 6-10 nodes
        const pad = 60;

        for (let i = 0; i < count; i++) {
            state.nodes.push({
                id: nextId++,
                x: pad + Math.random() * (w - pad * 2),
                y: pad + Math.random() * (h - pad * 2),
                label: String(i),
            });
        }

        // Connect with random edges (ensure connected)
        for (let i = 1; i < count; i++) {
            const j = Math.floor(Math.random() * i);
            state.edges.push({ from: state.nodes[i].id, to: state.nodes[j].id, weight: 1 + Math.floor(Math.random() * 20) });
        }
        // Add extra random edges
        const extra = Math.floor(count * 0.6);
        for (let e = 0; e < extra; e++) {
            const i = Math.floor(Math.random() * count);
            const j = Math.floor(Math.random() * count);
            if (i !== j) {
                const exists = state.edges.find(ed =>
                    (ed.from === state.nodes[i].id && ed.to === state.nodes[j].id) ||
                    (ed.from === state.nodes[j].id && ed.to === state.nodes[i].id));
                if (!exists) {
                    state.edges.push({ from: state.nodes[i].id, to: state.nodes[j].id, weight: 1 + Math.floor(Math.random() * 20) });
                }
            }
        }

        state.source = 0;
        state.destination = count - 1;
        updateInfo();
        draw();
        resultCard.innerHTML = '<div class="result-placeholder">Run the algorithm to see results</div>';
        distTableWrap.innerHTML = '<div class="result-placeholder">No data yet</div>';
        logContainer.innerHTML = '<div class="result-placeholder">Algorithm steps will appear here</div>';
    });

    /* ── Clear All ── */
    document.getElementById('btnClear').addEventListener('click', () => {
        if (state.animating) return;
        state.nodes = [];
        state.edges = [];
        state.source = null;
        state.destination = null;
        state.visitedSet.clear();
        state.pathSet.clear();
        state.pathEdges.clear();
        nextId = 0;
        updateInfo();
        draw();
        resultCard.innerHTML = '<div class="result-placeholder">Run the algorithm to see results</div>';
        distTableWrap.innerHTML = '<div class="result-placeholder">No data yet</div>';
        logContainer.innerHTML = '<div class="result-placeholder">Algorithm steps will appear here</div>';
        setStatus('ready', 'Ready');
    });

    /* ── Init ── */
    updateInfo();
    draw();
    speedValue.textContent = getSpeed() + 'ms';

})();
