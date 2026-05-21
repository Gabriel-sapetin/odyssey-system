
(function () {
  'use strict';

  const COLORS = ['#f5a623', '#20a7ff', '#22c55e', '#e879f9', '#f97316', '#06b6d4', '#a78bfa', '#fb7185', '#facc15', '#34d399'];

  /* ---- DOM refs ---- */
  const $id = id => document.getElementById(id);
  const procName = $id('procName');
  const procArrival = $id('procArrival');
  const procBurst = $id('procBurst');
  const procPriority = $id('procPriority');
  const addBtn = $id('addProcess');
  const algoSelect = $id('algoSelect');
  const quantumField = $id('quantumField');
  const quantumInput = $id('quantumInput');
  const runBtn = $id('runSim');
  const resetBtn = $id('resetSim');
  const presetBtn = $id('loadPreset');
  const processBody = $id('processBody');
  const ganttPanel = $id('ganttPanel');
  const ganttTrack = $id('ganttTrack');
  const ganttTimeline = $id('ganttTimeline');
  const ganttLegend = $id('ganttLegend');
  const resultsPanel = $id('resultsPanel');
  const resultsBody = $id('resultsBody');
  const simAverages = $id('simAverages');
  const rqPanel = $id('readyQueuePanel');
  const rqCurrent = $id('rqCurrent');
  const rqCpuBox = $id('rqCpuBox');
  const rqQueue = $id('rqQueue');
  const simTimeDisp = $id('simTimeDisplay');

  if (!addBtn) return; // Not on scheduling page

  let processes = [];
  let autoCounter = 1;
  let simRunning = false;
  let stepMode = false;
  let stepResume = null;
  let challengeRunning = false;
  let challengeStart = 0;
  let challengeTimer = null;

  const tools = document.createElement('div');
  tools.className = 'sim-step-tools';
  tools.innerHTML = `
    <label class="sim-toggle"><input type="checkbox" id="schedStepMode" /> Step-by-step mode</label>
    <button class="sim-btn sim-btn-preset" type="button" id="schedNextStep" disabled>Next Step</button>
    <button class="sim-btn sim-btn-run" type="button" id="schedChallenge">Challenge Mode</button>
    <span class="sim-challenge-status" id="schedChallengeStatus">Challenge: clear a schedule in 45s for up to 50 bonus XP.</span>
  `;
  document.getElementById('schedControls').appendChild(tools);
  const stepModeToggle = $id('schedStepMode');
  const nextStepBtn = $id('schedNextStep');
  const challengeBtn = $id('schedChallenge');
  const challengeStatus = $id('schedChallengeStatus');

  stepModeToggle.addEventListener('change', () => {
    stepMode = stepModeToggle.checked;
    if (!stepMode && stepResume) stepResume();
  });

  nextStepBtn.addEventListener('click', () => {
    if (stepResume) stepResume();
  });

  challengeBtn.addEventListener('click', startChallenge);

  /* ---- Toggle quantum field ---- */
  algoSelect.addEventListener('change', () => {
    quantumField.style.display = algoSelect.value === 'rr' ? '' : 'none';
  });

  /* ---- Add Process ---- */
  addBtn.addEventListener('click', addProcess);
  procBurst.addEventListener('keydown', e => { if (e.key === 'Enter') addProcess(); });

  function addProcess() {
    if (simRunning) return;
    const name = procName.value.trim() || `P${autoCounter}`;
    const arrival = Math.max(0, parseInt(procArrival.value) || 0);
    const burst = Math.max(1, parseInt(procBurst.value) || 1);
    const priority = Math.max(1, parseInt(procPriority.value) || 1);

    if (processes.some(p => p.name === name)) {
      shakeField(procName);
      return;
    }

    const color = COLORS[(processes.length) % COLORS.length];
    processes.push({ name, arrival, burst, priority, color });
    autoCounter++;
    renderTable();
    resetInputs();
  }

  function resetInputs() {
    procName.value = '';
    procArrival.value = '0';
    procBurst.value = '5';
    procPriority.value = '1';
    procName.focus();
  }

  function shakeField(el) {
    el.style.animation = 'none';
    void el.offsetWidth;
    el.style.animation = 'shake 0.35s ease';
    el.style.borderColor = '#ef4444';
    setTimeout(() => { el.style.animation = ''; el.style.borderColor = ''; }, 400);
  }

  /* ---- Render Process Table ---- */
  function renderTable() {
    if (processes.length === 0) {
      processBody.innerHTML = '<tr class="sim-empty-row"><td colspan="5">No processes added yet. Add some above!</td></tr>';
      return;
    }
    processBody.innerHTML = processes.map((p, i) => `
      <tr style="border-left: 4px solid ${p.color}">
        <td><strong style="color:${p.color}">${p.name}</strong></td>
        <td>${p.arrival}</td>
        <td>${p.burst}</td>
        <td>${p.priority}</td>
        <td><button class="delete-btn" data-idx="${i}" title="Remove">×</button></td>
      </tr>
    `).join('');

    processBody.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (simRunning) return;
        processes.splice(Number(btn.dataset.idx), 1);
        renderTable();
      });
    });
  }

  /* ---- Preset ---- */
  presetBtn.addEventListener('click', () => {
    if (simRunning) return;
    processes = [
      { name: 'P1', arrival: 0, burst: 6, priority: 3, color: COLORS[0] },
      { name: 'P2', arrival: 1, burst: 4, priority: 1, color: COLORS[1] },
      { name: 'P3', arrival: 2, burst: 8, priority: 2, color: COLORS[2] },
      { name: 'P4', arrival: 3, burst: 2, priority: 4, color: COLORS[3] },
      { name: 'P5', arrival: 5, burst: 3, priority: 5, color: COLORS[4] }
    ];
    autoCounter = 6;
    renderTable();
    hideResults();
  });

  /* ---- Reset ---- */
  resetBtn.addEventListener('click', () => {
    if (simRunning) return;
    stopChallenge(false);
    processes = [];
    autoCounter = 1;
    renderTable();
    hideResults();
  });

  function hideResults() {
    ganttPanel.style.display = 'none';
    resultsPanel.style.display = 'none';
    rqPanel.style.display = 'none';
  }

  /* ---- Run Simulation ---- */
  runBtn.addEventListener('click', () => {
    if (simRunning || processes.length === 0) {
      if (processes.length === 0) shakeField(procName);
      return;
    }
    const algo = algoSelect.value;
    const quantum = Math.max(1, parseInt(quantumInput.value) || 2);
    const schedule = computeSchedule(algo, quantum);
    animateSchedule(schedule);
  });

  function startChallenge() {
    if (simRunning) return;
    processes = [
      { name: 'P1', arrival: 0, burst: 5, priority: 2, color: COLORS[0] },
      { name: 'P2', arrival: 1, burst: 3, priority: 1, color: COLORS[1] },
      { name: 'P3', arrival: 2, burst: 7, priority: 4, color: COLORS[2] },
      { name: 'P4', arrival: 4, burst: 2, priority: 3, color: COLORS[3] }
    ];
    autoCounter = 5;
    algoSelect.value = 'sjf';
    quantumField.style.display = 'none';
    renderTable();
    hideResults();
    challengeRunning = true;
    challengeStart = Date.now();
    challengeBtn.disabled = true;
    challengeStatus.className = 'sim-challenge-status warning';
    challengeStatus.textContent = 'Challenge running: SJF schedule loaded. Run it before the 45s timer expires.';
    clearInterval(challengeTimer);
    challengeTimer = setInterval(() => {
      const left = Math.max(0, 45 - Math.floor((Date.now() - challengeStart) / 1000));
      challengeStatus.textContent = `Challenge running: ${left}s left. Best score rewards speed and low average waiting time.`;
      if (left <= 0) stopChallenge(false);
    }, 1000);
  }

  function stopChallenge(completed, metrics) {
    clearInterval(challengeTimer);
    challengeTimer = null;
    if (!challengeRunning) return;

    const elapsed = Math.floor((Date.now() - challengeStart) / 1000);
    challengeRunning = false;
    challengeBtn.disabled = false;

    if (!completed || elapsed > 45) {
      challengeStatus.className = 'sim-challenge-status';
      challengeStatus.textContent = 'Challenge ended. Start again to chase bonus XP.';
      return;
    }

    const speedPoints = Math.max(0, 45 - elapsed);
    const waitPenalty = Math.round((metrics.avgWaiting || 0) * 2);
    const score = Math.max(10, 100 + speedPoints - waitPenalty);
    const bonusXp = Math.min(50, Math.max(20, Math.round(score / 3)));
    challengeStatus.className = 'sim-challenge-status success';
    challengeStatus.innerHTML = `Challenge complete in <strong>${elapsed}s</strong>. Score <strong>${score}</strong>, bonus XP <strong>${bonusXp}</strong>.`;
    recordCompletion(score, bonusXp);
  }

  function recordCompletion(score, bonusXp) {
    if (typeof window.OS_ODYSSEY_RECORD_SIM_COMPLETION === 'function') {
      window.OS_ODYSSEY_RECORD_SIM_COMPLETION('scheduling', score, bonusXp);
    }
  }

  /* ---- Scheduling Algorithms ---- */
  function computeSchedule(algo, quantum) {
    const procs = processes.map(p => ({ ...p, remaining: p.burst }));
    const timeline = []; // { name, color, start, end }

    switch (algo) {
      case 'fcfs': return scheduleFCFS(procs);
      case 'sjf': return scheduleSJF(procs);
      case 'priority': return schedulePriority(procs);
      case 'rr': return scheduleRR(procs, quantum);
    }
    return timeline;
  }

  function scheduleFCFS(procs) {
    const sorted = [...procs].sort((a, b) => a.arrival - b.arrival || a.name.localeCompare(b.name));
    const timeline = [];
    let time = 0;
    for (const p of sorted) {
      if (time < p.arrival) {
        timeline.push({ name: 'idle', color: null, start: time, end: p.arrival });
        time = p.arrival;
      }
      timeline.push({ name: p.name, color: p.color, start: time, end: time + p.burst });
      time += p.burst;
    }
    return timeline;
  }

  function scheduleSJF(procs) {
    const remaining = procs.map(p => ({ ...p }));
    const timeline = [];
    let time = 0;
    const done = new Set();

    while (done.size < remaining.length) {
      const available = remaining.filter(p => p.arrival <= time && !done.has(p.name));
      if (available.length === 0) {
        const next = remaining.filter(p => !done.has(p.name)).sort((a, b) => a.arrival - b.arrival)[0];
        timeline.push({ name: 'idle', color: null, start: time, end: next.arrival });
        time = next.arrival;
        continue;
      }
      available.sort((a, b) => a.burst - b.burst || a.arrival - b.arrival);
      const p = available[0];
      timeline.push({ name: p.name, color: p.color, start: time, end: time + p.burst });
      time += p.burst;
      done.add(p.name);
    }
    return timeline;
  }

  function schedulePriority(procs) {
    const remaining = procs.map(p => ({ ...p }));
    const timeline = [];
    let time = 0;
    const done = new Set();

    while (done.size < remaining.length) {
      const available = remaining.filter(p => p.arrival <= time && !done.has(p.name));
      if (available.length === 0) {
        const next = remaining.filter(p => !done.has(p.name)).sort((a, b) => a.arrival - b.arrival)[0];
        timeline.push({ name: 'idle', color: null, start: time, end: next.arrival });
        time = next.arrival;
        continue;
      }
      available.sort((a, b) => a.priority - b.priority || a.arrival - b.arrival);
      const p = available[0];
      timeline.push({ name: p.name, color: p.color, start: time, end: time + p.burst });
      time += p.burst;
      done.add(p.name);
    }
    return timeline;
  }

  function scheduleRR(procs, quantum) {
    const queue = [];
    const remaining = procs.map(p => ({ ...p, remaining: p.burst }));
    const sorted = [...remaining].sort((a, b) => a.arrival - b.arrival);
    const timeline = [];
    let time = 0;
    let idx = 0;

    // Add initially available processes
    while (idx < sorted.length && sorted[idx].arrival <= time) {
      queue.push(sorted[idx]);
      idx++;
    }

    while (queue.length > 0 || idx < sorted.length) {
      if (queue.length === 0) {
        const next = sorted[idx];
        timeline.push({ name: 'idle', color: null, start: time, end: next.arrival });
        time = next.arrival;
        while (idx < sorted.length && sorted[idx].arrival <= time) {
          queue.push(sorted[idx]);
          idx++;
        }
        continue;
      }

      const p = queue.shift();
      const exec = Math.min(p.remaining, quantum);
      timeline.push({ name: p.name, color: p.color, start: time, end: time + exec });
      time += exec;
      p.remaining -= exec;

      // Add new arrivals during execution
      while (idx < sorted.length && sorted[idx].arrival <= time) {
        queue.push(sorted[idx]);
        idx++;
      }

      // Re-add to queue if not done
      if (p.remaining > 0) queue.push(p);
    }
    return timeline;
  }

  /* ---- Animate Schedule ---- */
  async function animateSchedule(timeline) {
    if (timeline.length === 0) return;
    simRunning = true;
    runBtn.disabled = true;
    runBtn.textContent = '⏳ Running...';

    // Show panels
    ganttPanel.style.display = '';
    resultsPanel.style.display = '';
    rqPanel.style.display = '';
    ganttTrack.innerHTML = '';
    ganttTimeline.innerHTML = '';
    ganttLegend.innerHTML = '';
    resultsBody.innerHTML = '';
    simAverages.innerHTML = '';

    const maxTime = timeline[timeline.length - 1].end;
    const delay = Math.max(120, 600 - processes.length * 40);

    for (let i = 0; i < timeline.length; i++) {
      const block = timeline[i];
      await addGanttBlock(block, i, delay);
      updateReadyQueue(timeline, i);
      await explainSchedulingStep(timeline, i);
    }

    // Build results
    const metrics = buildResults(timeline);
    buildLegend();

    simRunning = false;
    runBtn.disabled = false;
    runBtn.textContent = '▶ Run Simulation';
    rqCpuBox.classList.remove('active');
    rqCurrent.textContent = '—';

    // Award sim badge
    if (typeof window.OS_ODYSSEY_AWARD_BADGE === 'function') {
      window.OS_ODYSSEY_AWARD_BADGE('sim_scheduling');
    }
    if (challengeRunning) {
      stopChallenge(true, metrics);
    } else {
      recordCompletion(Math.max(1, 100 - Math.round(metrics.avgWaiting * 5)), 0);
    }
  }

  function explainSchedulingStep(timeline, index) {
    const note = ensureStepNote();
    const block = timeline[index];
    const ready = processes
      .filter(p => p.arrival <= block.start && timeline.slice(index).some(b => b.name === p.name))
      .map(p => p.name)
      .filter(name => name !== block.name);
    note.innerHTML = block.name === 'idle'
      ? `<strong>Step ${index + 1}:</strong> CPU is idle from t=${block.start} to t=${block.end} because no process has arrived yet.`
      : `<strong>Step ${index + 1}:</strong> ${block.name} runs from t=${block.start} to t=${block.end}. Ready queue before this slice: ${ready.join(', ') || 'empty'}.`;

    if (!stepMode) return Promise.resolve();
    nextStepBtn.disabled = false;
    return new Promise(resolve => {
      stepResume = () => {
        stepResume = null;
        nextStepBtn.disabled = true;
        resolve();
      };
    });
  }

  function ensureStepNote() {
    let note = $id('schedStepNote');
    if (!note) {
      note = document.createElement('div');
      note.id = 'schedStepNote';
      note.className = 'sim-step-note';
      rqPanel.appendChild(note);
    }
    return note;
  }

  function addGanttBlock(block, index, delay) {
    return new Promise(resolve => {
      setTimeout(() => {
        const el = document.createElement('div');
        el.className = 'gantt-block' + (block.name === 'idle' ? ' idle' : '');
        el.style.width = `${(block.end - block.start) * 48}px`;
        if (block.color) el.style.background = block.color;
        el.textContent = block.name === 'idle' ? 'IDLE' : block.name;
        el.style.animationDelay = '0s';
        el.title = `${block.name}: ${block.start}→${block.end}`;
        ganttTrack.appendChild(el);

        // Timeline
        const timeEl = document.createElement('span');
        timeEl.className = 'gantt-time';
        timeEl.style.width = `${(block.end - block.start) * 48}px`;
        timeEl.textContent = block.start;
        ganttTimeline.appendChild(timeEl);

        // Add final time marker
        if (index === ganttTrack.children.length - 1) {
          // Actually we want end marker — but we put it as next iteration
        }

        // Update time display
        simTimeDisp.textContent = block.end;

        // Update CPU box
        if (block.name !== 'idle') {
          rqCpuBox.classList.add('active');
          rqCurrent.textContent = block.name;
          rqCurrent.style.color = block.color;
        } else {
          rqCpuBox.classList.remove('active');
          rqCurrent.textContent = '—';
          rqCurrent.style.color = '';
        }

        // Scroll to end
        ganttTrack.parentElement.scrollLeft = ganttTrack.scrollWidth;

        resolve();
      }, delay);
    });
  }

  function updateReadyQueue(timeline, currentIdx) {
    const current = timeline[currentIdx];
    const time = current.end;
    // Find processes that have arrived but haven't completed yet
    const procs = processes.filter(p => {
      if (p.name === current.name) return false;
      if (p.arrival > time) return false;
      // Check if process is fully scheduled after this point
      const futureBlocks = timeline.slice(currentIdx + 1).filter(b => b.name === p.name);
      return futureBlocks.length > 0;
    });

    rqQueue.innerHTML = procs.map(p =>
      `<div class="rq-item" style="border-color:${p.color};color:${p.color}">${p.name}</div>`
    ).join('') || '<div class="rq-item" style="opacity:0.3">empty</div>';
  }

  function buildResults(timeline) {
    const results = {};
    processes.forEach(p => {
      results[p.name] = { arrival: p.arrival, burst: p.burst, color: p.color, completion: 0 };
    });

    timeline.forEach(block => {
      if (block.name !== 'idle' && results[block.name]) {
        results[block.name].completion = Math.max(results[block.name].completion, block.end);
      }
    });

    let totalTurnaround = 0, totalWaiting = 0;
    const entries = Object.entries(results);

    entries.forEach(([name, r]) => {
      const turnaround = r.completion - r.arrival;
      const waiting = turnaround - r.burst;
      totalTurnaround += turnaround;
      totalWaiting += waiting;

      resultsBody.innerHTML += `
        <tr style="border-left: 4px solid ${r.color}">
          <td><strong style="color:${r.color}">${name}</strong></td>
          <td>${r.arrival}</td>
          <td>${r.burst}</td>
          <td>${r.completion}</td>
          <td>${turnaround}</td>
          <td>${waiting}</td>
        </tr>
      `;
    });

    const n = entries.length;
    const avgTurnaround = totalTurnaround / n;
    const avgWaiting = totalWaiting / n;
    simAverages.innerHTML = `
      <div class="sim-avg-item">
        <span>AVG TURNAROUND</span>
        <span>${avgTurnaround.toFixed(2)}</span>
      </div>
      <div class="sim-avg-item">
        <span>AVG WAITING</span>
        <span>${avgWaiting.toFixed(2)}</span>
      </div>
      <div class="sim-avg-item">
        <span>TOTAL TIME</span>
        <span>${timeline[timeline.length - 1].end}</span>
      </div>
      <div class="sim-avg-item">
        <span>PROCESSES</span>
        <span>${n}</span>
      </div>
    `;
    return { avgTurnaround, avgWaiting, totalTime: timeline[timeline.length - 1].end, processes: n };
  }

  function buildLegend() {
    ganttLegend.innerHTML = processes.map(p =>
      `<div class="gantt-legend-item">
        <span class="gantt-legend-swatch" style="background:${p.color}"></span>
        ${p.name}
      </div>`
    ).join('') + `
      <div class="gantt-legend-item">
        <span class="gantt-legend-swatch" style="background:rgba(82,96,122,0.3);border-style:dashed"></span>
        Idle
      </div>`;
  }

  /* ---- Shake animation style ---- */
  const shakeStyle = document.createElement('style');
  shakeStyle.textContent = `
    @keyframes shake {
      0%,100% { transform: translateX(0); }
      25% { transform: translateX(-5px); }
      75% { transform: translateX(5px); }
    }
  `;
  document.head.appendChild(shakeStyle);

  /* ---- Init ---- */
  renderTable();

})();
