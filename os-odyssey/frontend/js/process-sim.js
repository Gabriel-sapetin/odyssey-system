
(function () {
  'use strict';

  const $id = id => document.getElementById(id);
  const addBtn = $id('psAddProcess');
  const runBtn = $id('psRunSim');
  const stepBtn = $id('psStepSim');
  const resetBtn = $id('psResetSim');
  const presetBtn = $id('psLoadPreset');
  const pcbPanel = $id('pcbPanel');
  const pcbGrid = $id('pcbGrid');
  const csLogPanel = $id('csLogPanel');
  const csLog = $id('csLog');
  const csCounter = $id('csCounter');

  if (!addBtn) return;

  const COLORS = ['#f5a623', '#20a7ff', '#22c55e', '#e879f9', '#f97316', '#06b6d4', '#a78bfa', '#fb7185'];
  const STATES = ['new', 'ready', 'running', 'waiting', 'terminated'];

  let processes = [];
  let autoId = 1;
  let simRunning = false;
  let contextSwitches = 0;
  let simTimer = null;

  const processTools = document.createElement('div');
  processTools.className = 'sim-step-tools';
  processTools.innerHTML = `
    <label class="sim-toggle"><input type="checkbox" id="psStepMode" checked /> Step-by-step mode</label>
    <span class="sim-step-note" id="psStepNote"><strong>Step guide:</strong> Use Step Once to inspect each process-state transition.</span>
  `;
  $id('processControls').appendChild(processTools);
  const processStepToggle = $id('psStepMode');
  const processStepNote = $id('psStepNote');

  /* ---- Add Process ---- */
  addBtn.addEventListener('click', addProcess);

  function addProcess() {
    if (simRunning) return;
    const name = $id('psProcName').value.trim() || `P${autoId}`;
    const burst = Math.max(100, parseInt($id('psBurst').value) || 500);
    const io = Math.max(0, parseInt($id('psIO').value) || 300);

    if (processes.some(p => p.name === name)) return;

    const proc = {
      name,
      pid: autoId,
      burst,
      io,
      remaining: burst,
      ioRemaining: io,
      state: 'new',
      color: COLORS[(autoId - 1) % COLORS.length],
      pc: Math.floor(Math.random() * 0xFFFF),
      registers: { AX: 0, BX: 0, SP: 0x7FFE }
    };

    processes.push(proc);
    autoId++;
    $id('psProcName').value = '';
    renderAll();
    processStepNote.innerHTML = `<strong>Step guide:</strong> ${name} was created in the New state. Run one step to admit it to Ready.`;
  }

  /* ---- Preset ---- */
  presetBtn.addEventListener('click', () => {
    if (simRunning) return;
    processes = [
      { name: 'P1', pid: 1, burst: 800, io: 400, remaining: 800, ioRemaining: 400, state: 'new', color: COLORS[0], pc: 0x1A3F, registers: { AX: 0, BX: 0, SP: 0x7FFE } },
      { name: 'P2', pid: 2, burst: 500, io: 200, remaining: 500, ioRemaining: 200, state: 'new', color: COLORS[1], pc: 0x2B00, registers: { AX: 0, BX: 0, SP: 0x7FFE } },
      { name: 'P3', pid: 3, burst: 300, io: 0, remaining: 300, ioRemaining: 0, state: 'new', color: COLORS[2], pc: 0x3C11, registers: { AX: 0, BX: 0, SP: 0x7FFE } },
      { name: 'P4', pid: 4, burst: 600, io: 300, remaining: 600, ioRemaining: 300, state: 'new', color: COLORS[3], pc: 0x4D22, registers: { AX: 0, BX: 0, SP: 0x7FFE } }
    ];
    autoId = 5;
    contextSwitches = 0;
    renderAll();
  });

  /* ---- Reset ---- */
  resetBtn.addEventListener('click', () => {
    stopSim();
    processes = [];
    autoId = 1;
    contextSwitches = 0;
    csLog.innerHTML = '<div class="boot-line boot-dim">Scheduler not started yet.</div>';
    csCounter.textContent = '0 context switches';
    pcbPanel.style.display = 'none';
    csLogPanel.style.display = 'none';
    renderAll();
  });

  /* ---- Simulation Step ---- */
  function simulationStep() {
    const quantum = 200; // ms per time slice

    // 1. Admit new processes to ready
    processes.filter(p => p.state === 'new').forEach(p => {
      p.state = 'ready';
      logCS(`${p.name} admitted: New → Ready`);
    });

    // 2. If nothing running, dispatch from ready queue
    const running = processes.find(p => p.state === 'running');
    if (!running) {
      const next = processes.find(p => p.state === 'ready');
      if (next) {
        next.state = 'running';
        contextSwitches++;
        logCS(`Context Switch #${contextSwitches}: Dispatched ${next.name} (Ready → Running)`);
      }
    }

    // 3. Execute running process
    const current = processes.find(p => p.state === 'running');
    if (current) {
      current.remaining -= quantum;
      current.pc += Math.floor(Math.random() * 0x100);
      current.registers.AX = Math.floor(Math.random() * 255);

      if (current.remaining <= 0) {
        // Process complete — check if needs I/O
        if (current.ioRemaining > 0) {
          current.state = 'waiting';
          current.remaining = 0;
          logCS(`${current.name}: Running → Waiting (I/O request)`);
        } else {
          current.state = 'terminated';
          logCS(`${current.name}: Running → Terminated (completed)`);
        }
      } else if (Math.random() < 0.15 && current.ioRemaining > 0) {
        // Random I/O interrupt
        current.state = 'waiting';
        logCS(`${current.name}: Running → Waiting (I/O interrupt)`);
      }
    }

    // 4. Progress waiting processes
    processes.filter(p => p.state === 'waiting').forEach(p => {
      p.ioRemaining -= quantum;
      if (p.ioRemaining <= 0) {
        p.ioRemaining = 0;
        if (p.remaining <= 0) {
          p.state = 'terminated';
          logCS(`${p.name}: Waiting → Terminated (I/O done, no CPU left)`);
        } else {
          p.state = 'ready';
          logCS(`${p.name}: Waiting → Ready (I/O complete)`);
        }
      }
    });

    renderAll();
    const runningAfterStep = processes.find(p => p.state === 'running');
    const waitingAfterStep = processes.filter(p => p.state === 'waiting').length;
    const terminatedAfterStep = processes.filter(p => p.state === 'terminated').length;
    processStepNote.innerHTML = `<strong>Step:</strong> Scheduler advanced one quantum. Running: ${runningAfterStep ? runningAfterStep.name : 'none'}; waiting: ${waitingAfterStep}; terminated: ${terminatedAfterStep}.`;

    // Check if all terminated
    if (processes.length > 0 && processes.every(p => p.state === 'terminated')) {
      stopSim();
      logCS('✓ All processes terminated. Simulation complete.');
    }
  }

  /* ---- Run / Step ---- */
  runBtn.addEventListener('click', () => {
    if (processes.length === 0) return;
    if (simRunning) {
      stopSim();
      return;
    }
    if (processStepToggle.checked) {
      pcbPanel.style.display = '';
      csLogPanel.style.display = '';
      simulationStep();
      if (typeof window.OS_ODYSSEY_AWARD_BADGE === 'function') {
        window.OS_ODYSSEY_AWARD_BADGE('sim_process');
      }
      if (processes.length > 0 && processes.every(p => p.state === 'terminated') && typeof window.OS_ODYSSEY_RECORD_SIM_COMPLETION === 'function') {
        window.OS_ODYSSEY_RECORD_SIM_COMPLETION('process', Math.max(1, 100 - contextSwitches * 5), 0);
      }
      return;
    }
    simRunning = true;
    runBtn.textContent = '⏸ Pause';
    pcbPanel.style.display = '';
    csLogPanel.style.display = '';
    simTimer = setInterval(simulationStep, 500);
  });

  stepBtn.addEventListener('click', () => {
    if (processes.length === 0) return;
    pcbPanel.style.display = '';
    csLogPanel.style.display = '';
    simulationStep();

    // Award sim badge
    if (typeof window.OS_ODYSSEY_AWARD_BADGE === 'function') {
      window.OS_ODYSSEY_AWARD_BADGE('sim_process');
    }
    if (processes.length > 0 && processes.every(p => p.state === 'terminated') && typeof window.OS_ODYSSEY_RECORD_SIM_COMPLETION === 'function') {
      window.OS_ODYSSEY_RECORD_SIM_COMPLETION('process', Math.max(1, 100 - contextSwitches * 5), 0);
    }
  });

  function stopSim() {
    simRunning = false;
    clearInterval(simTimer);
    runBtn.textContent = '▶ Start Scheduler';
  }

  /* ---- Log ---- */
  function logCS(text) {
    csCounter.textContent = `${contextSwitches} context switches`;
    const line = document.createElement('div');
    line.className = 'boot-line boot-info';
    line.textContent = `[t=${Date.now() % 100000}] ${text}`;
    csLog.appendChild(line);
    csLog.scrollTop = csLog.scrollHeight;
  }

  /* ---- Render State Diagram ---- */
  function renderAll() {
    STATES.forEach(state => {
      const queue = $id(`queue${state.charAt(0).toUpperCase() + state.slice(1)}`);
      if (!queue) return;
      const procs = processes.filter(p => p.state === state);
      queue.innerHTML = procs.map(p =>
        `<div class="state-proc-chip" style="background:${p.color}">${p.name}</div>`
      ).join('') || '<span class="state-empty">—</span>';
    });

    // Highlight active state
    STATES.forEach(state => {
      const node = document.querySelector(`[data-state="${state}"]`);
      if (!node) return;
      const hasProcs = processes.some(p => p.state === state);
      node.classList.toggle('has-processes', hasProcs);
    });

    // Render PCB cards
    renderPCBs();
  }

  /* ---- Render PCB Cards ---- */
  function renderPCBs() {
    if (processes.length === 0) {
      pcbGrid.innerHTML = '<p class="sim-empty-msg">No processes created yet.</p>';
      return;
    }

    pcbGrid.innerHTML = processes.map(p => `
      <div class="pcb-card" style="border-color:${p.color}">
        <div class="pcb-header" style="background:${p.color}20;border-bottom-color:${p.color}">
          <strong style="color:${p.color}">${p.name}</strong>
          <span class="pcb-state-badge pcb-${p.state}">${p.state.toUpperCase()}</span>
        </div>
        <div class="pcb-body">
          <div class="pcb-row"><span>PID</span><code>${p.pid}</code></div>
          <div class="pcb-row"><span>State</span><code>${p.state}</code></div>
          <div class="pcb-row"><span>PC</span><code>0x${p.pc.toString(16).toUpperCase().padStart(4, '0')}</code></div>
          <div class="pcb-row"><span>AX</span><code>${p.registers.AX}</code></div>
          <div class="pcb-row"><span>SP</span><code>0x${p.registers.SP.toString(16).toUpperCase()}</code></div>
          <div class="pcb-row"><span>CPU Left</span><code>${Math.max(0, p.remaining)}ms</code></div>
          <div class="pcb-row"><span>I/O Left</span><code>${Math.max(0, p.ioRemaining)}ms</code></div>
        </div>
      </div>
    `).join('');
  }

  /* ---- Init ---- */
  renderAll();

})();
