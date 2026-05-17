
(function () {
  'use strict';

  const $id = id => document.getElementById(id);

  /* ---- Tab Switching ---- */
  document.querySelectorAll('#threadTabs .mem-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('#threadTabs .mem-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.mem-tab-content').forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      const target = $id('tab-' + tab.dataset.tab);
      if (target) target.classList.add('active');
    });
  });

  if (!$id('runParallel')) return;

  const TASK_COLORS = ['#f5a623', '#20a7ff', '#22c55e', '#e879f9', '#f97316', '#06b6d4', '#a78bfa', '#fb7185'];

  /* ================================================================
     TAB 1: PARALLELISM VS CONCURRENCY
     ================================================================ */

  const runParallelBtn = $id('runParallel');
  const resetParallelBtn = $id('resetParallel');
  const coreCountSel = $id('coreCount');
  const taskCountInput = $id('taskCount');
  const threadCores = $id('threadCores');
  const threadTimeline = $id('threadTimeline');
  const parallelStats = $id('parallelStats');

  let parallelRunning = false;

  runParallelBtn.addEventListener('click', async () => {
    if (parallelRunning) return;
    parallelRunning = true;
    runParallelBtn.disabled = true;
    runParallelBtn.textContent = '⏳ Simulating...';

    const cores = parseInt(coreCountSel.value);
    const tasks = Math.min(8, Math.max(2, parseInt(taskCountInput.value) || 4));
    const taskDuration = 300; // ms per task unit

    // Build core labels
    threadCores.innerHTML = '';
    for (let c = 0; c < cores; c++) {
      const coreEl = document.createElement('div');
      coreEl.className = 'core-label';
      coreEl.innerHTML = `<span class="core-chip">Core ${c}</span>`;
      threadCores.appendChild(coreEl);
    }

    // Build timeline
    threadTimeline.innerHTML = '';
    const timelineRows = [];
    for (let c = 0; c < cores; c++) {
      const row = document.createElement('div');
      row.className = 'thread-timeline-row';
      threadTimeline.appendChild(row);
      timelineRows.push(row);
    }

    // Assign tasks to cores (round-robin)
    const assignments = [];
    for (let t = 0; t < tasks; t++) {
      assignments.push({ task: t, core: t % cores, name: `T${t + 1}`, color: TASK_COLORS[t % TASK_COLORS.length] });
    }

    // Group by core
    const coreQueues = [];
    for (let c = 0; c < cores; c++) {
      coreQueues.push(assignments.filter(a => a.core === c));
    }

    // Animate: for single core, tasks run sequentially (concurrency)
    // For multi-core, tasks on different cores run in parallel
    const totalTime = cores === 1 ? tasks * taskDuration : Math.ceil(tasks / cores) * taskDuration;
    let elapsed = 0;

    if (cores === 1) {
      // Sequential execution on single core (concurrency via time-slicing)
      for (let t = 0; t < tasks; t++) {
        const a = assignments[t];
        const block = createTimeBlock(a.name, a.color, taskDuration);
        timelineRows[0].appendChild(block);
        await delay(taskDuration);
        elapsed += taskDuration;
      }
    } else {
      // Parallel execution across cores
      const rounds = Math.ceil(tasks / cores);
      for (let r = 0; r < rounds; r++) {
        const promises = [];
        for (let c = 0; c < cores; c++) {
          const taskIdx = r * cores + c;
          if (taskIdx < tasks) {
            const a = assignments[taskIdx];
            const block = createTimeBlock(a.name, a.color, taskDuration);
            timelineRows[c].appendChild(block);
          }
        }
        await delay(taskDuration);
        elapsed += taskDuration;
      }
    }

    // Show stats
    parallelStats.style.display = '';
    const speedup = cores === 1 ? 1 : (tasks * taskDuration / totalTime).toFixed(2);
    parallelStats.innerHTML = `
      <div class="sim-averages">
        <div class="sim-avg-item"><span>CORES</span><span>${cores}</span></div>
        <div class="sim-avg-item"><span>TASKS</span><span>${tasks}</span></div>
        <div class="sim-avg-item"><span>TOTAL TIME</span><span>${totalTime}ms</span></div>
        <div class="sim-avg-item"><span>SPEEDUP</span><span>${speedup}×</span></div>
        <div class="sim-avg-item"><span>TYPE</span><span>${cores === 1 ? 'Concurrent' : 'Parallel'}</span></div>
      </div>
    `;

    parallelRunning = false;
    runParallelBtn.disabled = false;
    runParallelBtn.textContent = '▶ Simulate';

    // Award sim badge
    if (typeof window.OS_ODYSSEY_AWARD_BADGE === 'function') {
      window.OS_ODYSSEY_AWARD_BADGE('sim_thread');
    }
  });

  resetParallelBtn.addEventListener('click', () => {
    threadCores.innerHTML = '';
    threadTimeline.innerHTML = '';
    parallelStats.style.display = 'none';
    parallelStats.innerHTML = '';
  });

  function createTimeBlock(name, color, duration) {
    const block = document.createElement('div');
    block.className = 'thread-block';
    block.style.background = color;
    block.style.minWidth = '60px';
    block.textContent = name;
    return block;
  }

  /* ================================================================
     TAB 2: THREADING MODELS
     ================================================================ */

  const runModelBtn = $id('runModel');
  const modelSelect = $id('modelSelect');
  const userThreadInput = $id('userThreadCount');
  const modelVis = $id('modelVis');
  const modelDescPanel = $id('modelDesc');

  const MODEL_INFO = {
    'many-to-one': {
      title: 'Many-to-One Model',
      desc: 'Many user-level threads map to a <strong>single kernel thread</strong>. Thread management is done in user space, so it is efficient. However, if one thread makes a blocking system call, the <strong>entire process blocks</strong>. Threads cannot run in parallel on multicore systems.',
      pros: ['Efficient thread management in user space', 'Low overhead for creation/switching'],
      cons: ['One blocking call blocks ALL threads', 'No true parallelism on multicore', 'Rarely used today'],
      examples: 'Solaris Green Threads, GNU Portable Threads',
      kernelThreads: 1
    },
    'one-to-one': {
      title: 'One-to-One Model',
      desc: 'Each user thread maps to its own <strong>dedicated kernel thread</strong>. This allows true parallel execution on multicore CPUs. One thread blocking does NOT block others. The downside is more overhead per thread, so systems may limit thread count.',
      pros: ['True parallelism on multicore', 'One blocked thread doesn\'t block others', 'Most widely used model'],
      cons: ['Higher overhead per thread', 'System may limit thread count'],
      examples: 'Windows, Linux, Solaris 9+',
      kernelThreads: null // same as user threads
    },
    'many-to-many': {
      title: 'Many-to-Many Model',
      desc: 'Many user threads map to a <strong>smaller or equal number</strong> of kernel threads. The OS creates enough kernel threads for useful parallelism. Avoids both the blocking problem of Many-to-One and the overhead of One-to-One.',
      pros: ['Good balance of parallelism and overhead', 'No blocking problem', 'Flexible kernel thread allocation'],
      cons: ['Complex implementation', 'Less common today'],
      examples: 'Solaris pre-9, Windows (ThreadFiber)',
      kernelThreads: null // calculated
    }
  };

  runModelBtn.addEventListener('click', () => {
    const model = modelSelect.value;
    const userCount = Math.min(6, Math.max(2, parseInt(userThreadInput.value) || 4));
    const info = MODEL_INFO[model];

    let kernelCount;
    if (model === 'many-to-one') kernelCount = 1;
    else if (model === 'one-to-one') kernelCount = userCount;
    else kernelCount = Math.max(2, Math.ceil(userCount * 0.6));

    // Build visualization
    let html = '<div class="model-mapping">';

    // User threads column
    html += '<div class="model-col"><h3 class="pool-section-title">User Threads</h3>';
    for (let i = 0; i < userCount; i++) {
      html += `<div class="model-thread user-thread" id="ut-${i}" style="border-color:${TASK_COLORS[i]}"><span style="color:${TASK_COLORS[i]}">UT${i + 1}</span></div>`;
    }
    html += '</div>';

    // Mapping lines
    html += '<div class="model-lines" id="modelLines">';
    for (let i = 0; i < userCount; i++) {
      let target;
      if (model === 'many-to-one') target = 0;
      else if (model === 'one-to-one') target = i;
      else target = i % kernelCount;
      html += `<div class="model-line" data-from="${i}" data-to="${target}">→</div>`;
    }
    html += '</div>';

    // Kernel threads column
    html += '<div class="model-col"><h3 class="pool-section-title">Kernel Threads</h3>';
    for (let i = 0; i < kernelCount; i++) {
      html += `<div class="model-thread kernel-thread" id="kt-${i}"><span>KT${i + 1}</span></div>`;
    }
    html += '</div>';
    html += '</div>';

    modelVis.innerHTML = html;

    // Model description
    modelDescPanel.innerHTML = `
      <h3 style="color:var(--orange);font-family:var(--font-pixel);font-size:14px;margin-bottom:12px;">${info.title}</h3>
      <p style="margin-bottom:16px;line-height:1.7;">${info.desc}</p>
      <div style="display:flex;gap:24px;flex-wrap:wrap;">
        <div>
          <h4 style="color:#22c55e;font-family:var(--font-pixel);font-size:10px;margin-bottom:8px;">✓ ADVANTAGES</h4>
          <ul style="list-style:none;padding:0;margin:0;">${info.pros.map(p => `<li style="padding:4px 0;color:var(--app-text);">• ${p}</li>`).join('')}</ul>
        </div>
        <div>
          <h4 style="color:#ef4444;font-family:var(--font-pixel);font-size:10px;margin-bottom:8px;">✗ DISADVANTAGES</h4>
          <ul style="list-style:none;padding:0;margin:0;">${info.cons.map(c => `<li style="padding:4px 0;color:var(--app-text);">• ${c}</li>`).join('')}</ul>
        </div>
      </div>
      <p style="margin-top:16px;color:var(--app-muted);"><strong>Examples:</strong> ${info.examples}</p>
    `;
  });

  /* ================================================================
     TAB 3: THREAD POOL
     ================================================================ */

  const runPoolBtn = $id('runPool');
  const resetPoolBtn = $id('resetPool');
  const poolSizeInput = $id('poolSize');
  const taskQueueInput = $id('taskQueueSize');
  const poolQueue = $id('poolQueue');
  const poolThreads = $id('poolThreads');
  const poolStats = $id('poolStats');

  let poolRunning = false;

  runPoolBtn.addEventListener('click', async () => {
    if (poolRunning) return;
    poolRunning = true;
    runPoolBtn.disabled = true;
    runPoolBtn.textContent = '⏳ Executing...';

    const poolSize = Math.min(6, Math.max(1, parseInt(poolSizeInput.value) || 3));
    const taskCount = Math.min(12, Math.max(3, parseInt(taskQueueInput.value) || 8));

    // Create task queue
    const tasks = [];
    for (let i = 0; i < taskCount; i++) {
      tasks.push({ id: i + 1, name: `Task ${i + 1}`, duration: 400 + Math.floor(Math.random() * 600), color: TASK_COLORS[i % TASK_COLORS.length] });
    }

    // Create thread slots
    poolThreads.innerHTML = '';
    const threadSlots = [];
    for (let t = 0; t < poolSize; t++) {
      const slot = document.createElement('div');
      slot.className = 'pool-thread-slot';
      slot.innerHTML = `
        <div class="pool-thread-header">Worker ${t + 1}</div>
        <div class="pool-thread-body" id="poolWorker-${t}">
          <span class="pool-idle">Idle</span>
        </div>
      `;
      poolThreads.appendChild(slot);
      threadSlots.push(slot);
    }

    // Render initial queue
    renderPoolQueue(tasks);

    let completed = 0;
    const startTime = Date.now();

    // Process tasks using thread pool
    async function processTask(threadIdx) {
      while (tasks.length > 0) {
        const task = tasks.shift();
        renderPoolQueue(tasks);

        const body = $id(`poolWorker-${threadIdx}`);
        body.innerHTML = `<div class="pool-active-task" style="background:${task.color}20;border-color:${task.color}">
          <strong style="color:${task.color}">${task.name}</strong>
          <span class="pool-progress-bar"><span class="pool-progress-fill" style="background:${task.color}"></span></span>
        </div>`;

        // Animate progress
        const fill = body.querySelector('.pool-progress-fill');
        fill.style.transition = `width ${task.duration}ms linear`;
        requestAnimationFrame(() => { fill.style.width = '100%'; });

        await delay(task.duration);
        completed++;

        body.innerHTML = `<span class="pool-idle" style="color:#22c55e">✓ Done</span>`;
        await delay(100);
        body.innerHTML = `<span class="pool-idle">Idle</span>`;
      }
    }

    // Start all workers in parallel
    const workers = [];
    for (let t = 0; t < poolSize; t++) {
      workers.push(processTask(t));
    }
    await Promise.all(workers);

    const totalTime = Date.now() - startTime;

    // Show stats
    poolStats.style.display = '';
    poolStats.innerHTML = `
      <div class="sim-averages" style="margin-top:20px;">
        <div class="sim-avg-item"><span>POOL SIZE</span><span>${poolSize}</span></div>
        <div class="sim-avg-item"><span>TASKS</span><span>${taskCount}</span></div>
        <div class="sim-avg-item"><span>COMPLETED</span><span>${completed}</span></div>
        <div class="sim-avg-item"><span>TOTAL TIME</span><span>${totalTime}ms</span></div>
        <div class="sim-avg-item"><span>THROUGHPUT</span><span>${(completed / (totalTime / 1000)).toFixed(1)}/s</span></div>
      </div>
    `;

    poolRunning = false;
    runPoolBtn.disabled = false;
    runPoolBtn.textContent = '▶ Execute Tasks';
  });

  resetPoolBtn.addEventListener('click', () => {
    poolQueue.innerHTML = '';
    poolThreads.innerHTML = '';
    poolStats.style.display = 'none';
    poolStats.innerHTML = '';
  });

  function renderPoolQueue(tasks) {
    poolQueue.innerHTML = tasks.map(t =>
      `<div class="pool-task-chip" style="border-color:${t.color};color:${t.color}">${t.name}</div>`
    ).join('') || '<span class="pool-idle" style="opacity:0.4">Queue empty</span>';
  }

  function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

})();
