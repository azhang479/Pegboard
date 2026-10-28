(() => {
  const S = 44;          // spacing between holes (px)
  const PAD = 26;        // board padding to the first hole center
  const T = 16;          // wall thickness
  const PEG = 26;        // peg diameter
  const THUMB = 92;      // palette thumbnail box for corner pieces
  const WALL_LENGTHS = [1, 2, 3, 4, 5, 6];
  const SWATCHES = ['#e63946', '#f4a261', '#e9c46a', '#2a9d8f', '#457b9d', '#6a4c93', '#ffffff', '#222222'];
  const STORAGE_KEY = 'pegboard-v1';
  const SVG_NS = 'http://www.w3.org/2000/svg';

  // Direction indices rotate clockwise: E -> S -> W -> N.
  const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  // Arms leaving the pivot hole at rotation 0. Every arm is `len` holes long.
  const SHAPE_ARMS = {
    I: [0],          // straight wall, pivot at one end
    L: [0, 1],       // corner at the pivot
    T: [2, 0, 1],    // bar across, stem down from the middle
    X: [0, 1, 2, 3], // cross centered on the pivot
  };
  const SHAPE_NAMES = { L: 'L piece', T: 'T piece', X: 'X piece' };

  const $ = (id) => document.getElementById(id);
  const boardEl = $('board');
  const ghostEl = $('ghost');
  const colorInput = $('peg-color');

  let cols = 0;
  let rows = 0;
  let pieces = [];
  let nextId = 1;
  let drag = null;
  let previewEl = null;
  let lastTap = { id: null, t: 0 };
  let shapeLen = 2;
  let shapeRot = 0;

  // ---------- geometry ----------

  function armsOf(p) {
    return SHAPE_ARMS[p.shape].map((d) => DIRS[(d + p.rot) % 4]);
  }

  // Cells relative to the pivot hole.
  function offsetsOf(p) {
    if (p.type === 'peg') return [[0, 0]];
    const out = [[0, 0]];
    for (const [dx, dy] of armsOf(p)) {
      for (let i = 1; i <= p.len; i++) out.push([dx * i, dy * i]);
    }
    return out;
  }

  function cellsOf(p) {
    return offsetsOf(p).map(([x, y]) => [p.c + x, p.r + y]);
  }

  function extentOf(p) {
    const offs = offsetsOf(p);
    const xs = offs.map((o) => o[0]);
    const ys = offs.map((o) => o[1]);
    return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
  }

  function occupancy(excludeId) {
    const occ = new Set();
    for (const p of pieces) {
      if (p.id === excludeId) continue;
      for (const [c, r] of cellsOf(p)) occ.add(c + ',' + r);
    }
    return occ;
  }

  function canPlace(p, excludeId) {
    const occ = occupancy(excludeId);
    return cellsOf(p).every(([c, r]) =>
      c >= 0 && r >= 0 && c < cols && r < rows && !occ.has(c + ',' + r));
  }

  // Offset (px) from an element's top-left corner to the center of its pivot hole.
  function anchorOf(p) {
    if (p.type === 'peg') return { x: PEG / 2, y: PEG / 2 };
    const e = extentOf(p);
    return { x: -e.minX * S + T / 2, y: -e.minY * S + T / 2 };
  }

  function nextRot(p) {
    return p.shape === 'I' ? p.rot ^ 1 : (p.rot + 1) % 4;
  }

  function holeX(c) { return PAD + c * S; }
  function holeY(r) { return PAD + r * S; }

  // ---------- rendering ----------

  function svgEl(tag, attrs) {
    const el = document.createElementNS(SVG_NS, tag);
    for (const k in attrs) el.setAttribute(k, attrs[k]);
    return el;
  }

  function makePieceEl(p) {
    const el = document.createElement('div');
    if (p.type === 'peg') {
      el.className = 'peg';
      el.style.width = el.style.height = PEG + 'px';
      el.style.background = p.color;
      return el;
    }

    const e = extentOf(p);
    const w = (e.maxX - e.minX) * S + T;
    const h = (e.maxY - e.minY) * S + T;
    const a = anchorOf(p);
    el.className = 'wall';
    el.style.width = w + 'px';
    el.style.height = h + 'px';

    const svg = svgEl('svg', { width: w, height: h, viewBox: `0 0 ${w} ${h}` });
    const ends = armsOf(p).map(([dx, dy]) => [a.x + dx * p.len * S, a.y + dy * p.len * S]);
    for (const [cls, width] of [['edge', T], ['fill', T - 4]]) {
      for (const [x, y] of ends) {
        svg.appendChild(svgEl('line', { class: cls, x1: a.x, y1: a.y, x2: x, y2: y, 'stroke-width': width }));
      }
    }
    for (const [x, y] of [[a.x, a.y], ...ends]) {
      svg.appendChild(svgEl('circle', { class: 'dot', cx: x, cy: y, r: 4 }));
    }
    el.appendChild(svg);
    return el;
  }

  function positionOnBoard(el, p) {
    const a = anchorOf(p);
    el.style.left = holeX(p.c) - a.x + 'px';
    el.style.top = holeY(p.r) - a.y + 'px';
  }

  function renderBoard() {
    boardEl.innerHTML = '';
    boardEl.style.width = PAD * 2 + (cols - 1) * S + 'px';
    boardEl.style.height = PAD * 2 + (rows - 1) * S + 'px';
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const h = document.createElement('div');
        h.className = 'hole';
        h.style.left = holeX(c) + 'px';
        h.style.top = holeY(r) + 'px';
        boardEl.appendChild(h);
      }
    }
    for (const p of pieces) {
      const el = makePieceEl(p);
      el.dataset.id = p.id;
      positionOnBoard(el, p);
      el.addEventListener('pointerdown', (e) => startBoardDrag(e, p));
      el.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        removePiece(p.id);
      });
      boardEl.appendChild(el);
    }
    previewEl = null;
  }

  function makePaletteEl(proto, title, scale = 1) {
    const el = makePieceEl(proto);
    el.style.touchAction = 'none';
    el.title = title;
    if (scale !== 1) {
      el.style.transform = `scale(${scale})`;
      el.style.transformOrigin = 'top left';
    }
    el.addEventListener('pointerdown', (e) => startPaletteDrag(e, proto, el, scale));
    return el;
  }

  function renderPalette() {
    const hRow = $('palette-h');
    const vRow = $('palette-v');
    hRow.innerHTML = vRow.innerHTML = '';
    for (const rot of [0, 1]) {
      for (const len of WALL_LENGTHS) {
        const proto = { type: 'wall', shape: 'I', len, rot };
        const item = document.createElement('div');
        item.className = 'palette-item';
        const label = document.createElement('span');
        label.className = 'label';
        label.textContent = len;
        const wall = makePaletteEl(proto, `Length ${len} wall (spans ${len + 1} holes)`);
        wall.style.position = 'relative';
        item.append(label, wall);
        (rot === 0 ? hRow : vRow).appendChild(item);
      }
    }
    renderShapeLengths();
    renderShapePalette();
    renderPegPalette();

    const sw = $('swatches');
    sw.innerHTML = '';
    for (const color of SWATCHES) {
      const s = document.createElement('div');
      s.className = 'swatch';
      s.style.background = color;
      s.title = color;
      s.addEventListener('click', () => {
        colorInput.value = color;
        renderPegPalette();
      });
      sw.appendChild(s);
    }
  }

  function renderShapeLengths() {
    const seg = $('shape-lengths');
    seg.innerHTML = '';
    for (const len of WALL_LENGTHS) {
      const b = document.createElement('button');
      b.textContent = len;
      b.title = `Arm length ${len}`;
      b.classList.toggle('active', len === shapeLen);
      b.addEventListener('click', () => {
        shapeLen = len;
        renderShapeLengths();
        renderShapePalette();
      });
      seg.appendChild(b);
    }
  }

  function renderShapePalette() {
    const holder = $('palette-shapes');
    holder.innerHTML = '';
    for (const shape of ['L', 'T', 'X']) {
      const proto = { type: 'wall', shape, len: shapeLen, rot: shapeRot };
      const e = extentOf(proto);
      const w = (e.maxX - e.minX) * S + T;
      const h = (e.maxY - e.minY) * S + T;
      const scale = Math.min(1, (THUMB - 8) / Math.max(w, h));

      const item = document.createElement('div');
      item.className = 'shape-item';
      const box = document.createElement('div');
      box.className = 'shape-thumb';
      const el = makePaletteEl(proto, `${SHAPE_NAMES[shape]}, arm length ${shapeLen}`, scale);
      el.style.left = (THUMB - w * scale) / 2 + 'px';
      el.style.top = (THUMB - h * scale) / 2 + 'px';
      box.appendChild(el);
      const label = document.createElement('span');
      label.className = 'label';
      label.textContent = shape;
      item.append(box, label);
      holder.appendChild(item);
    }
  }

  function renderPegPalette() {
    const holder = $('palette-peg');
    holder.innerHTML = '';
    const el = makePaletteEl({ type: 'peg', color: colorInput.value }, 'Drag a peg onto the board');
    el.style.position = 'relative';
    holder.appendChild(el);
  }

  // ---------- drag & drop ----------

  function startPaletteDrag(e, proto, el, scale) {
    if (e.button !== 0) return;
    e.preventDefault();
    const rect = el.getBoundingClientRect();
    const a = anchorOf(proto);
    beginDrag(e, { ...proto, id: null },
      (e.clientX - rect.left) / scale - a.x, (e.clientY - rect.top) / scale - a.y, false);
  }

  function startBoardDrag(e, p) {
    if (e.button !== 0) return;
    e.preventDefault();
    const now = performance.now();
    if (p.type === 'wall' && lastTap.id === p.id && now - lastTap.t < 350) {
      lastTap = { id: null, t: 0 };
      rotatePlaced(p);
      return;
    }
    lastTap = { id: p.id, t: now };
    const rect = boardEl.getBoundingClientRect();
    beginDrag(e, { ...p }, e.clientX - (rect.left + holeX(p.c)), e.clientY - (rect.top + holeY(p.r)), true);
  }

  function beginDrag(e, piece, grabX, grabY, fromBoard) {
    drag = { piece, grabX, grabY, fromBoard, x: e.clientX, y: e.clientY, snap: null, moved: false };
    document.body.classList.add('dragging');
    if (fromBoard) {
      const el = boardEl.querySelector(`[data-id="${piece.id}"]`);
      if (el) el.classList.add('piece-dragging');
    }
    rebuildGhost();
    updateDrag();
  }

  function rebuildGhost() {
    ghostEl.innerHTML = '';
    ghostEl.appendChild(makePieceEl(drag.piece));
    if (previewEl) { previewEl.remove(); previewEl = null; }
  }

  function overBoard(x, y) {
    const r = boardEl.getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  }

  function updateDrag() {
    const { piece, grabX, grabY, x, y } = drag;
    const a = anchorOf(piece);

    if (overBoard(x, y)) {
      const rect = boardEl.getBoundingClientRect();
      const c = Math.round((x - grabX - rect.left - PAD) / S);
      const r = Math.round((y - grabY - rect.top - PAD) / S);
      const candidate = { ...piece, c, r };
      const valid = canPlace(candidate, piece.id);
      drag.snap = { c, r, valid };

      if (!previewEl) {
        previewEl = makePieceEl(piece);
        previewEl.classList.add('preview');
        boardEl.appendChild(previewEl);
      }
      previewEl.classList.toggle('invalid', !valid);
      positionOnBoard(previewEl, candidate);
      ghostEl.classList.add('hidden');
    } else {
      drag.snap = null;
      if (previewEl) { previewEl.remove(); previewEl = null; }
      ghostEl.classList.remove('hidden');
      ghostEl.style.transform = `translate(${x - grabX - a.x}px, ${y - grabY - a.y}px)`;
    }
  }

  function endDrag(cancelled) {
    if (!drag) return;
    const { piece, snap, fromBoard } = drag;
    if (fromBoard && !drag.moved) {
      drag = null;
      document.body.classList.remove('dragging');
      ghostEl.classList.add('hidden');
      if (previewEl) { previewEl.remove(); previewEl = null; }
      boardEl.querySelectorAll('.piece-dragging').forEach((el) => el.classList.remove('piece-dragging'));
      return;
    }
    if (!cancelled) {
      if (snap && snap.valid) {
        const placed = { ...piece, c: snap.c, r: snap.r };
        if (fromBoard) {
          pieces = pieces.map((p) => (p.id === piece.id ? placed : p));
        } else {
          placed.id = nextId++;
          pieces.push(placed);
        }
      } else if (fromBoard && !snap) {
        pieces = pieces.filter((p) => p.id !== piece.id);
      }
    }
    drag = null;
    document.body.classList.remove('dragging');
    ghostEl.classList.add('hidden');
    ghostEl.innerHTML = '';
    renderBoard();
    save();
  }

  function rotateDrag() {
    if (!drag || drag.piece.type !== 'wall') return;
    const rot = nextRot(drag.piece);
    // Rotate the grab point around the pivot so the cursor stays on the piece.
    for (let q = (rot - drag.piece.rot + 4) % 4; q > 0; q--) {
      [drag.grabX, drag.grabY] = [-drag.grabY, drag.grabX];
    }
    drag.piece = { ...drag.piece, rot };
    rebuildGhost();
    updateDrag();
  }

  window.addEventListener('pointermove', (e) => {
    if (!drag) return;
    if (Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y) > 2) drag.moved = true;
    drag.x = e.clientX;
    drag.y = e.clientY;
    updateDrag();
  });
  window.addEventListener('pointerup', () => endDrag(false));
  window.addEventListener('pointercancel', () => endDrag(true));
  window.addEventListener('keydown', (e) => {
    if (!drag) return;
    if (e.key === 'r' || e.key === 'R') rotateDrag();
    if (e.key === 'Escape') endDrag(true);
  });

  // ---------- piece actions ----------

  function rotatePlaced(p) {
    const rotated = { ...p, rot: nextRot(p) };
    if (!canPlace(rotated, p.id)) return;
    pieces = pieces.map((q) => (q.id === p.id ? rotated : q));
    renderBoard();
    save();
  }

  function removePiece(id) {
    pieces = pieces.filter((p) => p.id !== id);
    renderBoard();
    save();
  }

  // ---------- setup / persistence ----------

  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ cols, rows, pieces }));
  }

  // Boards saved before corner pieces stored walls as { dir: 'h' | 'v' }.
  function migrate(p) {
    if (p.type !== 'wall' || p.shape) return p;
    const { dir, ...rest } = p;
    return { ...rest, shape: 'I', rot: dir === 'v' ? 1 : 0 };
  }

  function startBoard(c, r, saved = []) {
    cols = c;
    rows = r;
    pieces = saved.map(migrate);
    nextId = pieces.reduce((m, p) => Math.max(m, p.id), 0) + 1;
    $('setup').classList.add('hidden');
    $('app').classList.remove('hidden');
    renderPalette();
    renderBoard();
    save();
  }

  const clamp = (v) => Math.max(2, Math.min(60, Math.floor(Number(v)) || 2));

  $('setup-form').addEventListener('submit', (e) => {
    e.preventDefault();
    startBoard(clamp($('cols').value), clamp($('rows').value));
  });

  $('clear').addEventListener('click', () => {
    pieces = [];
    renderBoard();
    save();
  });

  $('new-board').addEventListener('click', () => {
    if (pieces.length && !confirm('Start a new board? This removes all pieces.')) return;
    localStorage.removeItem(STORAGE_KEY);
    $('cols').value = cols;
    $('rows').value = rows;
    $('app').classList.add('hidden');
    $('setup').classList.remove('hidden');
  });

  $('shape-rotate').addEventListener('click', () => {
    shapeRot = (shapeRot + 1) % 4;
    renderShapePalette();
  });

  colorInput.addEventListener('input', renderPegPalette);

  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && saved.cols && saved.rows) startBoard(saved.cols, saved.rows, saved.pieces || []);
  } catch (_) { /* ignore corrupt storage */ }
})();
