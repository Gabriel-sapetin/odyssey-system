
(function () {
  'use strict';

  const $id = id => document.getElementById(id);

  /* ===== TAB SWITCHING ===== */
  const tabs = document.querySelectorAll('.mem-tab');
  const tabContents = document.querySelectorAll('.mem-tab-content');

  if (tabs.length === 0) return; // Not on memory page

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tabContents.forEach(tc => tc.classList.remove('active'));
      tab.classList.add('active');
      const target = $id('tab-' + tab.dataset.tab);
      if (target) target.classList.add('active');
    });
  });

  /* ============================================================
     PART 1: PAGE REPLACEMENT SIMULATOR
     ============================================================ */
  const refInput = $id('refString');
  const frameInput = $id('frameCount');
  const pageAlgo = $id('pageAlgo');
  const runPageBtn = $id('runPaging');
  const resetPageBtn = $id('resetPaging');
  const presetPageBtn = $id('loadPagePreset');
  const pagingResult = $id('pagingResult');
  const pageFaults = $id('pageFaults');
  const pageHits = $id('pageHits');
  const pageFaultRate = $id('pageFaultRate');
  const memFramesVis = $id('memFramesVis');
  const pageTraceHead = $id('pageTraceHead');
  const pageTraceBody = $id('pageTraceBody');

  /* ---- Preset ---- */
  presetPageBtn.addEventListener('click', () => {
    refInput.value = '7 0 1 2 0 3 0 4 2 3 0 3 2';
    frameInput.value = '3';
    pageAlgo.value = 'fifo';
    pagingResult.style.display = 'none';
  });

  /* ---- Reset ---- */
  resetPageBtn.addEventListener('click', () => {
    refInput.value = '';
    frameInput.value = '3';
    pagingResult.style.display = 'none';
  });

  /* ---- Run ---- */
  runPageBtn.addEventListener('click', () => {
    const refStr = refInput.value.trim();
    if (!refStr) return;
    const refs = refStr.split(/[\s,]+/).map(Number).filter(n => !isNaN(n));
    if (refs.length === 0) return;
    const numFrames = Math.max(1, Math.min(10, parseInt(frameInput.value) || 3));
    const algo = pageAlgo.value;

    const result = simulatePageReplacement(refs, numFrames, algo);
    renderPageResult(refs, numFrames, result);

    // Award sim badge
    if (typeof window.OS_ODYSSEY_AWARD_BADGE === 'function') {
      window.OS_ODYSSEY_AWARD_BADGE('sim_memory');
    }
  });

  /* ---- FIFO ---- */
  function fifo(refs, numFrames) {
    const frames = [];
    const steps = [];
    let faults = 0, hits = 0, pointer = 0;

    refs.forEach(page => {
      if (frames.includes(page)) {
        hits++;
        steps.push({ frames: [...frames], fault: false, replaced: null, page });
      } else {
        faults++;
        let replaced = null;
        if (frames.length < numFrames) {
          frames.push(page);
        } else {
          replaced = frames[pointer];
          frames[pointer] = page;
          pointer = (pointer + 1) % numFrames;
        }
        steps.push({ frames: [...frames], fault: true, replaced, page });
      }
    });

    return { steps, faults, hits };
  }

  /* ---- LRU ---- */
  function lru(refs, numFrames) {
    const frames = [];
    const steps = [];
    let faults = 0, hits = 0;
    const lastUsed = {};

    refs.forEach((page, time) => {
      if (frames.includes(page)) {
        hits++;
        lastUsed[page] = time;
        steps.push({ frames: [...frames], fault: false, replaced: null, page });
      } else {
        faults++;
        let replaced = null;
        if (frames.length < numFrames) {
          frames.push(page);
        } else {
          // Find LRU page
          let lruPage = frames[0], lruTime = lastUsed[frames[0]] ?? -1;
          frames.forEach(f => {
            const t = lastUsed[f] ?? -1;
            if (t < lruTime) { lruPage = f; lruTime = t; }
          });
          replaced = lruPage;
          const idx = frames.indexOf(lruPage);
          frames[idx] = page;
        }
        lastUsed[page] = time;
        steps.push({ frames: [...frames], fault: true, replaced, page });
      }
    });

    return { steps, faults, hits };
  }

  /* ---- Optimal ---- */
  function optimal(refs, numFrames) {
    const frames = [];
    const steps = [];
    let faults = 0, hits = 0;

    refs.forEach((page, time) => {
      if (frames.includes(page)) {
        hits++;
        steps.push({ frames: [...frames], fault: false, replaced: null, page });
      } else {
        faults++;
        let replaced = null;
        if (frames.length < numFrames) {
          frames.push(page);
        } else {
          // Find page used farthest in future
          let farthest = -1, victim = frames[0];
          frames.forEach(f => {
            const nextUse = refs.indexOf(f, time + 1);
            if (nextUse === -1) { victim = f; farthest = Infinity; return; }
            if (nextUse > farthest) { farthest = nextUse; victim = f; }
          });
          replaced = victim;
          const idx = frames.indexOf(victim);
          frames[idx] = page;
        }
        steps.push({ frames: [...frames], fault: true, replaced, page });
      }
    });

    return { steps, faults, hits };
  }

  function simulatePageReplacement(refs, numFrames, algo) {
    switch (algo) {
      case 'fifo': return fifo(refs, numFrames);
      case 'lru': return lru(refs, numFrames);
      case 'optimal': return optimal(refs, numFrames);
    }
  }

  /* ---- Render ---- */
  function renderPageResult(refs, numFrames, result) {
    pagingResult.style.display = '';
    pageFaults.textContent = result.faults;
    pageHits.textContent = result.hits;
    pageFaultRate.textContent = ((result.faults / refs.length) * 100).toFixed(1) + '%';

    // Memory frames visualization
    memFramesVis.innerHTML = '';
    result.steps.forEach((step, i) => {
      const col = document.createElement('div');
      col.className = 'mem-frame-col';
      col.style.animationDelay = `${i * 0.05}s`;

      const header = document.createElement('div');
      header.className = 'mem-frame-header';
      header.textContent = refs[i];
      if (step.fault) header.style.color = '#ff6b6b';
      else header.style.color = '#22c55e';
      col.appendChild(header);

      for (let f = 0; f < numFrames; f++) {
        const cell = document.createElement('div');
        cell.className = 'mem-frame-cell';
        if (step.frames[f] !== undefined) {
          cell.textContent = step.frames[f];
          if (step.fault && step.frames[f] === refs[i]) {
            cell.classList.add('fault');
          } else if (!step.fault && step.frames[f] === refs[i]) {
            cell.classList.add('hit');
          }
        } else {
          cell.textContent = '—';
          cell.style.opacity = '0.3';
        }
        col.appendChild(cell);
      }

      const status = document.createElement('div');
      status.className = 'mem-frame-status ' + (step.fault ? 'fault' : 'hit');
      status.textContent = step.fault ? 'F' : 'H';
      col.appendChild(status);

      memFramesVis.appendChild(col);
    });

    // Table
    pageTraceHead.innerHTML = '<tr><th>Step</th>' +
      refs.map((r, i) => `<th>${r}</th>`).join('') + '</tr>';

    let rows = '';
    for (let f = 0; f < numFrames; f++) {
      rows += `<tr><td><strong>Frame ${f + 1}</strong></td>`;
      result.steps.forEach((step, i) => {
        const val = step.frames[f] !== undefined ? step.frames[f] : '—';
        const cls = step.fault && step.frames[f] === refs[i] ? 'fault-cell' :
          !step.fault && step.frames[f] === refs[i] ? 'hit-cell' : '';
        rows += `<td class="${cls}">${val}</td>`;
      });
      rows += '</tr>';
    }
    // Fault/Hit row
    rows += '<tr><td><strong>Status</strong></td>';
    result.steps.forEach(step => {
      rows += `<td class="${step.fault ? 'fault-cell' : 'hit-cell'}">${step.fault ? 'Fault' : 'Hit'}</td>`;
    });
    rows += '</tr>';

    pageTraceBody.innerHTML = rows;
  }


  /* ============================================================
     PART 2: FRAGMENTATION SIMULATOR
     ============================================================ */
  const COLORS = ['#f5a623', '#20a7ff', '#22c55e', '#e879f9', '#f97316', '#06b6d4', '#a78bfa', '#fb7185', '#facc15', '#34d399'];

  const memSizeInput = $id('memSize');
  const fragAlgoSelect = $id('fragAlgo');
  const fragProcName = $id('fragProcName');
  const fragProcSize = $id('fragProcSize');
  const allocateBtn = $id('allocateProc');
  const resetFragBtn = $id('resetFrag');
  const presetFragBtn = $id('loadFragPreset');
  const fragMemoryBar = $id('fragMemoryBar');
  const fragProcessList = $id('fragProcessList');
  const fragUsedEl = $id('fragUsed');
  const fragFreeEl = $id('fragFree');
  const fragExtFragEl = $id('fragExtFrag');

  let memorySize = 1024;
  let allocations = []; // { name, start, size, color }
  let fragAutoCounter = 1;

  function getMemorySize() {
    return Math.max(64, parseInt(memSizeInput.value) || 1024);
  }

  /* ---- Get free blocks ---- */
  function getFreeBlocks() {
    memorySize = getMemorySize();
    const sorted = [...allocations].sort((a, b) => a.start - b.start);
    const free = [];
    let pos = 0;

    sorted.forEach(alloc => {
      if (alloc.start > pos) {
        free.push({ start: pos, size: alloc.start - pos });
      }
      pos = alloc.start + alloc.size;
    });

    if (pos < memorySize) {
      free.push({ start: pos, size: memorySize - pos });
    }

    return free;
  }

  /* ---- Allocation algorithms ---- */
  function firstFit(size) {
    const blocks = getFreeBlocks();
    for (const b of blocks) {
      if (b.size >= size) return b.start;
    }
    return -1;
  }

  function bestFit(size) {
    const blocks = getFreeBlocks().filter(b => b.size >= size);
    if (blocks.length === 0) return -1;
    blocks.sort((a, b) => a.size - b.size);
    return blocks[0].start;
  }

  function worstFit(size) {
    const blocks = getFreeBlocks().filter(b => b.size >= size);
    if (blocks.length === 0) return -1;
    blocks.sort((a, b) => b.size - a.size);
    return blocks[0].start;
  }

  /* ---- Allocate ---- */
  allocateBtn.addEventListener('click', () => {
    memorySize = getMemorySize();
    const name = fragProcName.value.trim() || `P${fragAutoCounter}`;
    const size = Math.max(1, parseInt(fragProcSize.value) || 100);

    if (allocations.some(a => a.name === name)) {
      fragProcName.style.borderColor = '#ef4444';
      setTimeout(() => { fragProcName.style.borderColor = ''; }, 500);
      return;
    }

    const algo = fragAlgoSelect.value;
    let start = -1;
    if (algo === 'first-fit') start = firstFit(size);
    else if (algo === 'best-fit') start = bestFit(size);
    else start = worstFit(size);

    if (start === -1) {
      alert(`Cannot allocate ${size} KB for ${name}. Not enough contiguous memory!`);
      return;
    }

    const color = COLORS[allocations.length % COLORS.length];
    allocations.push({ name, start, size, color });
    fragAutoCounter++;
    fragProcName.value = '';
    fragProcSize.value = '200';
    renderFragmentation();
  });

  /* ---- Deallocate ---- */
  function deallocate(name) {
    allocations = allocations.filter(a => a.name !== name);
    renderFragmentation();
  }

  /* ---- Reset ---- */
  resetFragBtn.addEventListener('click', () => {
    allocations = [];
    fragAutoCounter = 1;
    memSizeInput.value = '1024';
    renderFragmentation();
  });

  /* ---- Preset ---- */
  presetFragBtn.addEventListener('click', () => {
    memSizeInput.value = '1024';
    memorySize = 1024;
    allocations = [
      { name: 'OS', start: 0, size: 100, color: '#94a3b8' },
      { name: 'P1', start: 100, size: 200, color: COLORS[0] },
      { name: 'P2', start: 400, size: 150, color: COLORS[1] },
      { name: 'P3', start: 650, size: 250, color: COLORS[2] }
    ];
    fragAutoCounter = 4;
    renderFragmentation();
  });

  /* ---- Render ---- */
  function renderFragmentation() {
    memorySize = getMemorySize();
    const sorted = [...allocations].sort((a, b) => a.start - b.start);
    const freeBlocks = getFreeBlocks();

    // Memory bar
    let barHTML = '';
    let pos = 0;

    sorted.forEach(alloc => {
      // Free block before this allocation
      if (alloc.start > pos) {
        const freeSize = alloc.start - pos;
        const pct = (freeSize / memorySize) * 100;
        barHTML += `<div class="frag-block frag-free" style="width:${pct}%" data-label="Free: ${freeSize} KB"></div>`;
      }
      const pct = (alloc.size / memorySize) * 100;
      barHTML += `<div class="frag-block" style="width:${pct}%;background:${alloc.color}" data-label="${alloc.name}: ${alloc.size} KB"></div>`;
      pos = alloc.start + alloc.size;
    });

    // Trailing free
    if (pos < memorySize) {
      const freeSize = memorySize - pos;
      const pct = (freeSize / memorySize) * 100;
      barHTML += `<div class="frag-block frag-free" style="width:${pct}%" data-label="Free: ${freeSize} KB"></div>`;
    }

    fragMemoryBar.innerHTML = barHTML;

    // Stats
    const usedKB = allocations.reduce((sum, a) => sum + a.size, 0);
    const freeKB = memorySize - usedKB;
    const extFrag = freeBlocks.length > 1 ? freeBlocks.reduce((sum, b) => sum + b.size, 0) : 0;

    fragUsedEl.textContent = `Used: ${usedKB} KB`;
    fragFreeEl.textContent = `Free: ${freeKB} KB`;
    fragExtFragEl.textContent = `Ext. Frag: ${freeBlocks.length > 1 ? freeBlocks.length + ' blocks' : '0'}`;

    // Process list
    if (allocations.length === 0) {
      fragProcessList.innerHTML = '<p class="sim-empty-msg">No processes allocated. Use the controls above to allocate memory.</p>';
      return;
    }

    fragProcessList.innerHTML = sorted.map(a => `
      <div class="frag-proc-item">
        <div class="frag-proc-info">
          <span class="frag-proc-swatch" style="background:${a.color}"></span>
          <span class="frag-proc-name">${a.name}</span>
          <span class="frag-proc-size">${a.size} KB</span>
          <span class="frag-proc-range">[${a.start}–${a.start + a.size - 1}]</span>
        </div>
        <button class="frag-dealloc-btn" data-name="${a.name}">Deallocate</button>
      </div>
    `).join('');

    fragProcessList.querySelectorAll('.frag-dealloc-btn').forEach(btn => {
      btn.addEventListener('click', () => deallocate(btn.dataset.name));
    });
  }

  /* ---- Init ---- */
  renderFragmentation();

})();
