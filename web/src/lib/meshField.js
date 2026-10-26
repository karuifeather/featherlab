/**
 * An animated "infrastructure topology": a handful of hub nodes (think control planes)
 * each surrounded by a cluster of satellite nodes (pods/workers), connected by spokes and
 * short peer links, with a shallow sense of depth and a subtle pointer parallax. Pure
 * Canvas 2D, no framework, and no React involvement — it owns its own requestAnimationFrame
 * loop so the launcher never re-renders for a frame of animation.
 *
 * Cost control: device-pixel-ratio is capped, the loop is throttled to ~30fps, work stops
 * entirely while the tab is hidden, and `prefers-reduced-motion` renders a single static
 * frame with no loop at all. Call the returned `destroy()` to release every resource.
 */
export function createMeshField(canvas, options = {}) {
  const ctx = canvas.getContext("2d", { alpha: true });
  if (!ctx) return { destroy() {} };

  const targetFps = options.fps ?? 30;
  const frameInterval = 1000 / targetFps;
  const maxDpr = options.maxDpr ?? 2;
  const reduceMq = window.matchMedia("(prefers-reduced-motion: reduce)");

  let width = 0;
  let height = 0;
  let dpr = 1;
  let hubs = [];
  let nodes = [];
  let colors = readColors();

  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };

  function readColors() {
    const s = getComputedStyle(canvas);
    const get = (name, fallback) => s.getPropertyValue(name).trim() || fallback;
    return {
      node: get("--primary-bright", "#83c0bb"),
      nodeCore: get("--primary", "#4a7c7c"),
      line: get("--accent-line", "#3f7a74"),
      hub: get("--secondary", "#cc6666"),
    };
  }

  function seed() {
    const area = width * height;
    const hubCount = Math.min(5, Math.max(3, Math.round(area / 360000)));
    hubs = Array.from({ length: hubCount }, () => ({
      x: 0.12 + Math.random() * 0.76,
      y: 0.12 + Math.random() * 0.76,
      z: Math.random(),
      vx: (Math.random() - 0.5) * 0.00008,
      vy: (Math.random() - 0.5) * 0.00008,
    }));

    const total = Math.min(66, Math.max(30, Math.round(area / 26000)));
    nodes = Array.from({ length: total }, (_, i) => {
      const hub = i % hubs.length;
      const spread = 0.1 + Math.random() * 0.14;
      const angle = Math.random() * Math.PI * 2;
      return {
        hub,
        // Offset from the owning hub, so clusters read as connected neighbourhoods.
        ox: Math.cos(angle) * spread,
        oy: Math.sin(angle) * spread,
        z: Math.random(),
        drift: Math.random() * Math.PI * 2,
        dspeed: 0.002 + Math.random() * 0.003,
        damp: 0.004 + Math.random() * 0.01,
      };
    });
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    width = Math.max(1, rect.width);
    height = Math.max(1, rect.height);
    dpr = Math.min(maxDpr, window.devicePixelRatio || 1);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (hubs.length === 0) seed();
  }

  // depth → visual weight (fog): far nodes are smaller and dimmer.
  const depthOf = (z) => 0.3 + z * 0.7;

  function draw(animate) {
    ctx.clearRect(0, 0, width, height);

    pointer.x += (pointer.tx - pointer.x) * 0.06;
    pointer.y += (pointer.ty - pointer.y) * 0.06;

    const minDim = Math.min(width, height);
    const peerThreshold = minDim * 0.17;
    const maxShift = minDim * 0.045;

    if (animate) {
      for (const h of hubs) {
        h.x += h.vx;
        h.y += h.vy;
        if (h.x < 0.08 || h.x > 0.92) h.vx *= -1;
        if (h.y < 0.08 || h.y > 0.92) h.vy *= -1;
      }
    }

    const hubPts = hubs.map((h) => {
      const depth = depthOf(h.z);
      return {
        px: h.x * width + pointer.x * maxShift * h.z,
        py: h.y * height + pointer.y * maxShift * h.z,
        depth,
        z: h.z,
      };
    });

    const pts = nodes.map((n) => {
      if (animate) n.drift += n.dspeed;
      const h = hubs[n.hub];
      // Gentle orbital wobble around the hub.
      const wob = n.damp;
      const nx = h.x + n.ox + Math.cos(n.drift) * wob;
      const ny = h.y + n.oy + Math.sin(n.drift) * wob;
      const depth = depthOf(n.z);
      return {
        px: nx * width + pointer.x * maxShift * n.z,
        py: ny * height + pointer.y * maxShift * n.z,
        depth,
        z: n.z,
        hub: n.hub,
        r: 0.7 + n.z * 2.4,
      };
    });

    // Spokes: node → its hub.
    ctx.lineWidth = 1;
    ctx.strokeStyle = colors.line;
    for (const p of pts) {
      const h = hubPts[p.hub];
      const dx = p.px - h.px;
      const dy = p.py - h.py;
      const dist = Math.hypot(dx, dy);
      const reach = minDim * 0.42;
      if (dist > reach) continue;
      ctx.globalAlpha = (1 - dist / reach) * 0.4 * ((p.depth + h.depth) / 2);
      ctx.beginPath();
      ctx.moveTo(p.px, p.py);
      ctx.lineTo(h.px, h.py);
      ctx.stroke();
    }

    // Peer links between nearby satellites: short, faint, add mesh texture.
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const dx = pts[i].px - pts[j].px;
        const dy = pts[i].py - pts[j].py;
        const dist = Math.hypot(dx, dy);
        if (dist > peerThreshold) continue;
        const nearness = 1 - dist / peerThreshold;
        const depth = (pts[i].depth + pts[j].depth) / 2;
        ctx.globalAlpha = nearness * nearness * 0.3 * depth;
        ctx.beginPath();
        ctx.moveTo(pts[i].px, pts[i].py);
        ctx.lineTo(pts[j].px, pts[j].py);
        ctx.stroke();
      }
    }

    // Draw satellites far-to-near so nearer ones layer on top (depth cue).
    const ordered = pts.slice().sort((a, b) => a.z - b.z);
    for (const p of ordered) {
      ctx.globalAlpha = 0.22 + p.depth * 0.5;
      ctx.fillStyle = colors.node;
      ctx.beginPath();
      ctx.arc(p.px, p.py, p.r, 0, Math.PI * 2);
      ctx.fill();

      ctx.globalAlpha = 0.9 * p.depth;
      ctx.fillStyle = colors.nodeCore;
      ctx.beginPath();
      ctx.arc(p.px, p.py, p.r * 0.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Hubs: larger, haloed, drawn last so they anchor each cluster.
    for (const h of hubPts) {
      const r = 2.4 + h.z * 3.2;
      ctx.globalAlpha = 0.14 * h.depth;
      ctx.fillStyle = colors.hub;
      ctx.beginPath();
      ctx.arc(h.px, h.py, r * 3.2, 0, Math.PI * 2);
      ctx.fill();

      ctx.globalAlpha = 0.5 + h.depth * 0.5;
      ctx.fillStyle = colors.node;
      ctx.beginPath();
      ctx.arc(h.px, h.py, r, 0, Math.PI * 2);
      ctx.fill();

      ctx.globalAlpha = 0.9;
      ctx.fillStyle = colors.hub;
      ctx.beginPath();
      ctx.arc(h.px, h.py, r * 0.45, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // --- lifecycle ---------------------------------------------------------
  let rafId = 0;
  let last = 0;
  let running = false;

  function loop(now) {
    rafId = requestAnimationFrame(loop);
    if (now - last < frameInterval) return;
    last = now;
    draw(true);
  }

  function start() {
    if (running || reduceMq.matches) return;
    running = true;
    last = 0;
    rafId = requestAnimationFrame(loop);
  }

  function stop() {
    running = false;
    cancelAnimationFrame(rafId);
    rafId = 0;
  }

  function onVisibility() {
    if (document.hidden) stop();
    else start();
  }

  function onPointerMove(e) {
    const rect = canvas.getBoundingClientRect();
    pointer.tx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.ty = ((e.clientY - rect.top) / rect.height) * 2 - 1;
  }

  function onReducedMotion() {
    if (reduceMq.matches) {
      stop();
      draw(false);
    } else {
      start();
    }
  }

  function refreshColors() {
    colors = readColors();
    if (!running) draw(false);
  }

  const ro = new ResizeObserver(() => {
    resize();
    if (!running) draw(false);
  });
  ro.observe(canvas);

  const themeObserver = new MutationObserver(refreshColors);
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });

  resize();
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("pointermove", onPointerMove, { passive: true });
  reduceMq.addEventListener("change", onReducedMotion);
  const schemeMq = window.matchMedia("(prefers-color-scheme: light)");
  schemeMq.addEventListener("change", refreshColors);

  if (reduceMq.matches) draw(false);
  else start();

  return {
    destroy() {
      stop();
      ro.disconnect();
      themeObserver.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pointermove", onPointerMove);
      reduceMq.removeEventListener("change", onReducedMotion);
      schemeMq.removeEventListener("change", refreshColors);
    },
  };
}
