(() => {
  const S = 44;          // spacing between holes (px)
  const PAD = 26;        // board padding to the first hole center
  const T = 16;          // wall thickness
  const PEG = 26;        // peg diameter
  const WALL_LENGTHS = [1, 2, 3, 4, 5, 6];
  const SWATCHES = ['#e63946', '#f4a261', '#e9c46a', '#2a9d8f', '#457b9d', '#6a4c93', '#ffffff', '#222222'];
  const STORAGE_KEY = 'pegboard-v1';

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

  // ---------- geometry ----------

  function cellsOf(p) {
    if (p.type === 'peg') return [[p.c, p.r]];
    const cells = [];
    for (let i = 0; i <= p.len; i++) {
      cells.push(p.dir === 'h' ? [p.c + i, p.r] : [p.c, p.r + i]);
    }
    return cells;
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

  // Offset (px) from an element's top-left corner to the center of its first hole.
  function anchorOf(p) {
    return p.type === 'peg' ? { x: PEG / 2, y: PEG / 2 } : { x: T / 2, y: T / 2 };
  }

  function holeX(c) { return PAD + c * S; }
  function holeY(r) { return PAD + r * S; }

  // ---------- rendering ----------

  function makePieceEl(p) {
    const el = document.createElement('div');
    if (p.type === 'peg') {
      el.className = 'peg';
      el.style.width = el.style.height = PEG + 'px';
      el.style.background = p.color;
    } else {
      const long = p.len * S + T;
      el.className = 'wall';
      el.style.width = (p.dir === 'h' ? long : T) + 'px';
      el.style.height = (p.dir === 'h' ? T : long) + 'px';
      for (const k of [0, p.len]) {
        const end = document.createElement('div');
        end.className = 'end';
        const along = k * S + T / 2 - 2 - 4; // minus border and half the dot
        const across = T / 2 - 2 - 4;
        end.style.left = (p.dir === 'h' ? along : across) + 'px';
        end.style.top = (p.dir === 'h' ? across : along) + 'px';
        el.appendChild(end);
      }
    }
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
      if (drag && drag.piece.id === p.id) el.classList.add('piece-dragging');
      el.addEventListener('pointerdown', (e) => startBoardDrag(e, p));
      el.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        removePiece(p.id);
      });
      boardEl.appendChild(el);
    }
    previewEl = null;
  }

  function renderPalette() {
    const hRow = $('palette-h');
    const vRow = $('palette-v');
    hRow.innerHTML = vRow.innerHTML = '';
    for (const dir of ['h', 'v']) {
      for (const len of WALL_LENGTHS) {
        const proto = { type: 'wall', len, dir };
        const item = document.createElement('div');
        item.className = 'palette-item';
        const label = document.createElement('span');
        label.className = 'label';
        label.textContent = len;
        const wall = makePieceEl(proto);
        wall.style.position = 'relative';
        wall.style.touchAction = 'none';
        wall.title = `Length ${len} wall (spans ${len + 1} holes)`;
        wall.addEventListener('pointerdown', (e) => startPaletteDrag(e, proto, wall));
        item.append(label, wall);
        (dir === 'h' ? hRow : vRow).appendChild(item);
      }
    }
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

  function renderPegPalette() {
    const holder = $('palette-peg');
    holder.innerHTML = '';
    const proto = { type: 'peg', color: colorInput.value };
    const el = makePieceEl(proto);
    el.style.position = 'relative';
    el.style.touchAction = 'none';
    el.title = 'Drag a peg onto the board';
    el.addEventListener('pointerdown', (e) => startPaletteDrag(e, { ...proto, color: colorInput.value }, el));
    holder.appendChild(el);
  }

  // ---------- drag & drop ----------

  function startPaletteDrag(e, proto, el) {
    if (e.button !== 0) return;
    e.preventDefault();
    const rect = el.getBoundingClientRect();
    const a = anchorOf(proto);
    beginDrag(e, { ...proto, id: null }, e.clientX - (rect.left + a.x), e.clientY - (rect.top + a.y), false);
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

      if (!previewEl || previewEl.dataset.key !== `${piece.type}${piece.len}${piece.dir}`) {
        if (previewEl) previewEl.remove();
        previewEl = makePieceEl(piece);
        previewEl.classList.add('preview');
        previewEl.dataset.key = `${piece.type}${piece.len}${piece.dir}`;
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
      } else if (fromBoard && !snap && drag.moved) {
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
    drag.piece = { ...drag.piece, dir: drag.piece.dir === 'h' ? 'v' : 'h' };
    [drag.grabX, drag.grabY] = [drag.grabY, drag.grabX];
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
    const rotated = { ...p, dir: p.dir === 'h' ? 'v' : 'h' };
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

  function startBoard(c, r, saved = []) {
    cols = c;
    rows = r;
    pieces = saved;
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

  colorInput.addEventListener('input', renderPegPalette);

  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && saved.cols && saved.rows) startBoard(saved.cols, saved.rows, saved.pieces || []);
  } catch (_) { /* ignore corrupt storage */ }
})();
