(function () {
  'use strict';

  const $id = id => document.getElementById(id);
  const sim = document.body.dataset.kernelSim;
  if (!sim) return;

  function record(id, score) {
    if (typeof window.OS_ODYSSEY_RECORD_SIM_COMPLETION === 'function') {
      window.OS_ODYSSEY_RECORD_SIM_COMPLETION(id, score, 0);
    }
  }

  if (sim === 'filesystem') initFilesystem();
  if (sim === 'deadlock') initDeadlock();
  if (sim === 'disk') initDisk();
  if (sim === 'virtual-memory') initVirtualMemory();

  function initFilesystem() {
    const tree = $id('fsTree');
    const viz = $id('fsViz');
    const note = $id('fsNote');
    const blocks = Array.from({ length: 16 }, (_, i) => ({ id: i, file: null }));
    let nextInode = 100;
    let selected = null;
    let files = [];

    function render() {
      tree.innerHTML = files.length ? files.map(file => `
        <button class="kernel-item ${selected === file.name ? 'active' : ''}" type="button" data-file="${file.name}">
          <span>/${file.name}</span><strong>inode ${file.inode}</strong>
        </button>
      `).join('') : '<p class="sim-empty-msg">/ is empty. Create a file to allocate blocks.</p>';

      const active = files.find(file => file.name === selected) || files[0];
      const blockHtml = blocks.map(block => `<span class="fs-block ${block.file ? 'used' : ''}">${block.file ? block.file.slice(0, 2).toUpperCase() : block.id}</span>`).join('');
      viz.innerHTML = `
        <div class="block-row">${blockHtml}</div>
        <div class="sim-table-wrap" style="margin-top:18px;">
          <table class="sim-table">
            <thead><tr><th>Inode</th><th>Name</th><th>Size</th><th>Blocks</th></tr></thead>
            <tbody>${files.map(file => `<tr><td>${file.inode}</td><td>${file.name}</td><td>${file.size}</td><td>${file.blocks.join(', ')}</td></tr>`).join('')}</tbody>
          </table>
        </div>
      `;
      if (active) {
        note.innerHTML = `<strong>Step:</strong> ${active.name} maps inode ${active.inode} to disk blocks ${active.blocks.join(', ')}. Directory entries point names to inodes; inodes point to blocks.`;
      }
      record('filesystem', Math.min(100, files.length * 25));
    }

    function createFile(name, size) {
      if (!name || files.some(file => file.name === name)) return;
      const free = blocks.filter(block => !block.file).slice(0, size);
      if (free.length < size) {
        note.innerHTML = `<strong>Allocation failed:</strong> ${name} needs ${size} free blocks, but only ${free.length} are available.`;
        return;
      }
      free.forEach(block => { block.file = name; });
      files.push({ name, size, inode: nextInode++, blocks: free.map(block => block.id) });
      selected = name;
      render();
    }

    $id('fsCreate').addEventListener('click', () => {
      createFile($id('fsName').value.trim(), Math.max(1, Math.min(6, parseInt($id('fsSize').value) || 1)));
    });
    $id('fsDelete').addEventListener('click', () => {
      if (!selected) return;
      blocks.forEach(block => { if (block.file === selected) block.file = null; });
      files = files.filter(file => file.name !== selected);
      note.innerHTML = `<strong>Delete:</strong> ${selected} was removed from the directory, its inode was freed, and its blocks returned to the free list.`;
      selected = files[0] && files[0].name;
      render();
    });
    $id('fsPreset').addEventListener('click', () => {
      files = [];
      blocks.forEach(block => { block.file = null; });
      nextInode = 100;
      createFile('boot.log', 3);
      createFile('notes.txt', 2);
      createFile('kernel.bin', 4);
    });
    tree.addEventListener('click', event => {
      const item = event.target.closest('[data-file]');
      if (!item) return;
      selected = item.dataset.file;
      render();
    });
    render();
  }

  function initDeadlock() {
    const list = $id('dlList');
    const viz = $id('dlViz');
    const note = $id('dlNote');
    let scenario = 'safe';

    function render(deadlocked) {
      const safe = scenario === 'safe';
      const rows = safe
        ? [['P1', 'holds R1', 'requests R2'], ['P2', 'holds R2', 'can finish'], ['R1/R2', 'available after P2', 'safe sequence P2, P1']]
        : [['P1', 'holds R1', 'requests R2'], ['P2', 'holds R2', 'requests R1'], ['Cycle', 'P1 -> R2 -> P2 -> R1 -> P1', 'deadlock']];
      list.innerHTML = rows.map(row => `<div class="kernel-item"><span>${row[0]}</span><strong>${row[1]}</strong></div>`).join('');
      viz.innerHTML = `
        <div class="rag-row">
          <span class="rag-node ${deadlocked ? 'deadlocked' : 'active'}">P1</span>
          <span class="rag-node ${deadlocked ? 'deadlocked' : ''}">R2</span>
          <span class="rag-node ${deadlocked ? 'deadlocked' : 'active'}">P2</span>
          <span class="rag-node ${deadlocked ? 'deadlocked' : ''}">R1</span>
        </div>
        <p class="disk-path">${safe ? 'Safe path: P2 finishes, releases R2, then P1 finishes.' : 'Cycle: P1 waits for R2 while P2 waits for R1.'}</p>
      `;
    }

    $id('dlSafe').addEventListener('click', () => {
      scenario = 'safe';
      note.innerHTML = '<strong>State:</strong> Safe scenario loaded. A process can finish and release resources.';
      render(false);
    });
    $id('dlDeadlock').addEventListener('click', () => {
      scenario = 'deadlock';
      note.innerHTML = '<strong>State:</strong> Deadlock scenario loaded. Each process holds one resource and waits for the other.';
      render(true);
    });
    $id('dlDetect').addEventListener('click', () => {
      const deadlocked = scenario === 'deadlock';
      note.innerHTML = deadlocked
        ? '<strong>Detection:</strong> A cycle exists in the resource allocation graph, so the system is deadlocked.'
        : '<strong>Detection:</strong> No permanent wait cycle exists. This state can still make progress.';
      render(deadlocked);
      record('deadlock', deadlocked ? 100 : 80);
    });
    $id('dlBanker').addEventListener('click', () => {
      note.innerHTML = scenario === 'safe'
        ? '<strong>Banker:</strong> Safe sequence found: P2 -> P1. Granting the request keeps the system safe.'
        : '<strong>Banker:</strong> No safe sequence exists. The request should be denied to avoid deadlock.';
      record('deadlock', 100);
    });
    render(false);
  }

  function initDisk() {
    const viz = $id('diskViz');
    const note = $id('diskNote');
    const movement = $id('diskMovement');

    function orderRequests(queue, head, algo) {
      if (algo === 'fcfs') return [...queue];
      if (algo === 'sstf') {
        const pending = [...queue];
        const order = [];
        let pos = head;
        while (pending.length) {
          pending.sort((a, b) => Math.abs(a - pos) - Math.abs(b - pos));
          const next = pending.shift();
          order.push(next);
          pos = next;
        }
        return order;
      }
      const left = queue.filter(n => n < head).sort((a, b) => b - a);
      const right = queue.filter(n => n >= head).sort((a, b) => a - b);
      if (algo === 'scan') return [...right, 199, ...left];
      if (algo === 'cscan') return [...right, 199, 0, ...left.reverse()];
      if (algo === 'look') return [...right, ...left];
      return [...queue];
    }

    $id('diskRun').addEventListener('click', () => {
      const queue = $id('diskQueue').value.split(/[\s,]+/).map(Number).filter(n => !isNaN(n)).map(n => Math.max(0, Math.min(199, n)));
      const head = Math.max(0, Math.min(199, parseInt($id('diskHead').value) || 0));
      const order = orderRequests(queue, head, $id('diskAlgo').value);
      const path = [head, ...order];
      const total = path.slice(1).reduce((sum, pos, i) => sum + Math.abs(pos - path[i]), 0);
      movement.textContent = total;
      viz.innerHTML = `
        <div class="disk-track">${path.map((pos, i) => `<span class="disk-cylinder ${i ? 'active' : ''}">${pos}</span>`).join('')}</div>
        <p class="disk-path">Seek path: ${path.join(' -> ')}</p>
      `;
      note.innerHTML = `<strong>Step:</strong> ${$id('diskAlgo').value.toUpperCase()} services ${order.length} requests with total head movement ${total}.`;
      record('disk', Math.max(1, 100 - Math.round(total / 10)));
    });
  }

  function initVirtualMemory() {
    const refsInput = $id('vmRefs');
    const framesInput = $id('vmFrames');
    const algoSelect = $id('vmAlgo');
    const viz = $id('vmViz');
    const note = $id('vmNote');
    const faultsEl = $id('vmFaults');
    const hitsEl = $id('vmHits');
    let state = null;

    function chooseVictim(frames, refs, index, lastUsed, fifo) {
      if (algoSelect.value === 'fifo') return fifo[0];
      if (algoSelect.value === 'lru') return [...frames].sort((a, b) => (lastUsed[a] ?? -1) - (lastUsed[b] ?? -1))[0];
      return [...frames].sort((a, b) => {
        const nextA = refs.indexOf(a, index + 1);
        const nextB = refs.indexOf(b, index + 1);
        return (nextB === -1 ? Infinity : nextB) - (nextA === -1 ? Infinity : nextA);
      })[0];
    }

    function render() {
      if (!state) {
        viz.innerHTML = '<p class="sim-empty-msg">Run the simulator to initialize page tables and frames.</p>';
        return;
      }
      faultsEl.textContent = state.faults;
      hitsEl.textContent = state.hits;
      viz.innerHTML = `
        <div class="vm-row">${state.frames.map(page => `<span class="vm-page ${state.lastHit === page ? 'hit' : ''}">${page}</span>`).join('')}</div>
        <div class="sim-table-wrap" style="margin-top:18px;">
          <table class="sim-table"><thead><tr><th>Page</th><th>Frame</th><th>Valid</th><th>TLB</th></tr></thead>
          <tbody>${state.refs.map(page => `<tr><td>${page}</td><td>${state.frames.includes(page) ? state.frames.indexOf(page) : '-'}</td><td>${state.frames.includes(page) ? '1' : '0'}</td><td>${state.tlb.includes(page) ? 'hit' : '-'}</td></tr>`).join('')}</tbody></table>
        </div>
      `;
    }

    function step() {
      if (!state || state.index >= state.refs.length) return;
      const page = state.refs[state.index];
      state.lastHit = null;
      if (state.frames.includes(page)) {
        state.hits++;
        state.lastHit = page;
        note.innerHTML = `<strong>Step ${state.index + 1}:</strong> Page ${page} is already resident. TLB/page table returns its frame.`;
      } else {
        state.faults++;
        let replaced = null;
        if (state.frames.length < state.frameCount) {
          state.frames.push(page);
          state.fifo.push(page);
        } else {
          replaced = chooseVictim(state.frames, state.refs, state.index, state.lastUsed, state.fifo);
          state.frames[state.frames.indexOf(replaced)] = page;
          state.fifo = state.fifo.filter(p => p !== replaced);
          state.fifo.push(page);
        }
        note.innerHTML = `<strong>Step ${state.index + 1}:</strong> Page fault on ${page}.${replaced !== null ? ` Replaced page ${replaced}.` : ' Loaded into a free frame.'}`;
      }
      state.lastUsed[page] = state.index;
      state.tlb = [page, ...state.tlb.filter(p => p !== page)].slice(0, 3);
      state.index++;
      render();
      if (state.index >= state.refs.length) record('virtual-memory', Math.max(1, Math.round((state.hits / state.refs.length) * 100)));
    }

    $id('vmRun').addEventListener('click', () => {
      const refs = refsInput.value.split(/[\s,]+/).map(Number).filter(n => !isNaN(n));
      state = { refs, frameCount: Math.max(1, Math.min(5, parseInt(framesInput.value) || 3)), frames: [], fifo: [], tlb: [], lastUsed: {}, index: 0, faults: 0, hits: 0, lastHit: null };
      note.innerHTML = '<strong>Step:</strong> State initialized. Press Next Step to process each reference.';
      render();
    });
    $id('vmStep').addEventListener('click', step);
    render();
  }
})();
