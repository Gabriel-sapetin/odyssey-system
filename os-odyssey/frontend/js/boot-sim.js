
(function () {
  'use strict';

  const $id = id => document.getElementById(id);
  const bootConsole = $id('bootConsole');
  const startBtn = $id('startBoot');
  const resetBtn = $id('resetBoot');
  const speedSelect = $id('bootSpeed');
  const statusLabel = $id('bootStatusLabel');
  const storagePanel = $id('storagePanel');
  const interruptPanel = $id('interruptPanel');
  const ivtBody = $id('ivtBody');
  const cpuModeValue = $id('cpuModeValue');
  const activeISR = $id('activeISR');
  const cpuModeBox = $id('cpuModeBox');
  const kernelModeBox = $id('kernelModeBox');
  const interruptLog = $id('interruptLog');

  if (!startBtn) return;

  let booting = false;
  let booted = false;

  const SPEEDS = { fast: 80, normal: 250, slow: 600 };

  /* ---- IRQ Definitions ---- */
  const IRQ_TABLE = [
    { irq: 0, device: '⏱️ Timer', isr: '0x0020', color: '#f5a623', count: 0 },
    { irq: 1, device: '⌨️ Keyboard', isr: '0x0060', color: '#20a7ff', count: 0 },
    { irq: 14, device: '💾 Disk I/O', isr: '0x01F0', color: '#22c55e', count: 0 },
    { irq: 11, device: '🌐 Network', isr: '0xB000', color: '#e879f9', count: 0 }
  ];

  const IRQ_MAP = { timer: 0, keyboard: 1, disk: 2, network: 3 };

  /* ---- Boot Sequence Steps ---- */
  const BOOT_SEQUENCE = [
    { text: '▸ Power supply delivering current...', type: 'info', storage: null },
    { text: '▸ CPU reset vector → jumping to BIOS ROM', type: 'info', storage: null },
    { text: '', type: 'divider' },
    { text: '═══ POST (Power-On Self-Test) ═══', type: 'header' },
    { text: '  ✓ CPU self-test .............. OK', type: 'success' },
    { text: '  ✓ Memory test (4096 MB) ...... OK', type: 'success', storage: 'ram' },
    { text: '  ✓ Keyboard controller ........ OK', type: 'success' },
    { text: '  ✓ Video adapter .............. OK', type: 'success' },
    { text: '  ✓ Storage controller ......... OK', type: 'success', storage: 'disk' },
    { text: '', type: 'divider' },
    { text: '═══ Bootstrap Loader ═══', type: 'header' },
    { text: '  ▸ Reading MBR from disk sector 0...', type: 'info', storage: 'disk' },
    { text: '  ▸ Bootstrap program found in ROM/EPROM', type: 'info' },
    { text: '  ▸ Locating kernel on disk...', type: 'info', storage: 'disk' },
    { text: '  ▸ Loading kernel into main memory...', type: 'loading', storage: 'ram' },
    { text: '  ✓ Kernel loaded at address 0x100000', type: 'success', storage: 'ram' },
    { text: '', type: 'divider' },
    { text: '═══ Kernel Initialization ═══', type: 'header' },
    { text: '  ▸ Initializing CPU registers...', type: 'info', storage: 'registers' },
    { text: '  ▸ Setting up Interrupt Vector Table (IVT)...', type: 'info' },
    { text: '  ▸ Configuring interrupt handlers...', type: 'info' },
    { text: '    IRQ 0  → Timer handler     at 0x0020', type: 'detail' },
    { text: '    IRQ 1  → Keyboard handler  at 0x0060', type: 'detail' },
    { text: '    IRQ 14 → Disk handler      at 0x01F0', type: 'detail' },
    { text: '    IRQ 11 → Network handler   at 0xB000', type: 'detail' },
    { text: '  ✓ IVT configured with 4 interrupt handlers', type: 'success' },
    { text: '', type: 'divider' },
    { text: '  ▸ Initializing L1/L2 cache...', type: 'info', storage: 'cache' },
    { text: '  ✓ Cache hierarchy online', type: 'success', storage: 'cache' },
    { text: '  ▸ Mounting root filesystem...', type: 'info', storage: 'disk' },
    { text: '  ✓ Filesystem mounted', type: 'success' },
    { text: '  ▸ Starting system services...', type: 'loading' },
    { text: '  ✓ Process scheduler started', type: 'success' },
    { text: '  ✓ Memory manager initialized', type: 'success', storage: 'ram' },
    { text: '  ✓ Device drivers loaded', type: 'success' },
    { text: '', type: 'divider' },
    { text: '═══ System Ready ═══', type: 'header' },
    { text: '  ✓ Entering dual-mode operation', type: 'success' },
    { text: '  ✓ CPU switched to USER MODE', type: 'success' },
    { text: '  ✓ OS is now interrupt-driven', type: 'success' },
    { text: '', type: 'divider' },
    { text: '🐧 OS ODYSSEY v2.1 — Boot complete!', type: 'final' }
  ];

  /* ---- Render IVT ---- */
  function renderIVT() {
    ivtBody.innerHTML = IRQ_TABLE.map(r => `
      <tr id="ivtRow-${r.irq}" style="border-left:4px solid ${r.color}">
        <td><strong style="color:${r.color}">${r.irq}</strong></td>
        <td>${r.device}</td>
        <td><code style="color:#8af1ff">${r.isr}</code></td>
        <td><span class="irq-status" id="irqStatus-${r.irq}">Idle</span></td>
        <td><strong id="irqCount-${r.irq}">${r.count}</strong></td>
      </tr>
    `).join('');
  }

  /* ---- Boot Console Line ---- */
  function addConsoleLine(text, type) {
    const line = document.createElement('div');
    line.className = 'boot-line';

    switch (type) {
      case 'header': line.classList.add('boot-header'); break;
      case 'success': line.classList.add('boot-success'); break;
      case 'info': line.classList.add('boot-info'); break;
      case 'loading': line.classList.add('boot-loading'); break;
      case 'detail': line.classList.add('boot-detail'); break;
      case 'final': line.classList.add('boot-final'); break;
      case 'divider': line.classList.add('boot-divider'); break;
      case 'error': line.classList.add('boot-error'); break;
      default: line.classList.add('boot-dim'); break;
    }

    line.textContent = text;
    bootConsole.appendChild(line);
    bootConsole.scrollTop = bootConsole.scrollHeight;
  }

  /* ---- Animate Storage Hierarchy ---- */
  function animateStorage(level) {
    if (!level) return;
    const el = document.querySelector(`[data-level="${level}"] .storage-fill`);
    if (el) {
      el.style.width = '100%';
      el.parentElement.parentElement.classList.add('storage-active');
    }
  }

  /* ---- Boot Sequence ---- */
  async function runBoot() {
    if (booting) return;
    booting = true;
    booted = false;
    startBtn.disabled = true;
    startBtn.textContent = '⏳ Booting...';
    statusLabel.textContent = '● Booting...';
    statusLabel.style.color = '#f5a623';
    bootConsole.innerHTML = '';

    const speed = SPEEDS[speedSelect.value] || 250;
    storagePanel.style.display = '';

    // Reset storage fills
    document.querySelectorAll('.storage-fill').forEach(f => f.style.width = '0%');
    document.querySelectorAll('.storage-level').forEach(l => l.classList.remove('storage-active'));

    for (const step of BOOT_SEQUENCE) {
      addConsoleLine(step.text, step.type);
      if (step.storage) animateStorage(step.storage);
      await delay(step.type === 'divider' ? speed / 3 : speed);
    }

    // Boot complete!
    statusLabel.textContent = '● System ONLINE';
    statusLabel.style.color = '#22c55e';
    booted = true;
    booting = false;
    startBtn.disabled = false;
    startBtn.textContent = '⚡ Power On';

    // Show interrupt panel
    interruptPanel.style.display = '';
    renderIVT();
    interruptLog.innerHTML = '<div class="boot-line boot-success">✓ Interrupt subsystem ready. Trigger IRQs above.</div>';

    // Award sim badge
    if (typeof window.OS_ODYSSEY_AWARD_BADGE === 'function') {
      window.OS_ODYSSEY_AWARD_BADGE('sim_boot');
    }
  }

  /* ---- Interrupt Handling ---- */
  async function handleIRQ(type) {
    if (!booted) return;
    const idx = IRQ_MAP[type];
    const irq = IRQ_TABLE[idx];
    irq.count++;

    // Flash the IVT row
    const row = $id(`ivtRow-${irq.irq}`);
    row.classList.add('irq-flash');
    setTimeout(() => row.classList.remove('irq-flash'), 800);

    // Update status
    const statusEl = $id(`irqStatus-${irq.irq}`);
    statusEl.textContent = 'HANDLING';
    statusEl.style.color = irq.color;
    $id(`irqCount-${irq.irq}`).textContent = irq.count;

    // Switch to Kernel Mode
    cpuModeValue.textContent = 'Kernel';
    cpuModeBox.classList.add('kernel-active');
    kernelModeBox.classList.add('kernel-active');
    activeISR.textContent = irq.device;
    activeISR.style.color = irq.color;

    // Log
    const logLine = document.createElement('div');
    logLine.className = 'boot-line boot-info';
    logLine.innerHTML = `<span style="color:${irq.color}">[IRQ ${irq.irq}]</span> ${irq.device} → CPU saved state → jumping to ISR at <code style="color:#8af1ff">${irq.isr}</code>`;
    interruptLog.appendChild(logLine);

    await delay(600);

    const doneLine = document.createElement('div');
    doneLine.className = 'boot-line boot-success';
    doneLine.innerHTML = `<span style="color:${irq.color}">[IRQ ${irq.irq}]</span> ISR complete → restoring state → returning to user program`;
    interruptLog.appendChild(doneLine);
    interruptLog.scrollTop = interruptLog.scrollHeight;

    await delay(400);

    // Back to User Mode
    statusEl.textContent = 'Idle';
    statusEl.style.color = '';
    cpuModeValue.textContent = 'User';
    cpuModeBox.classList.remove('kernel-active');
    kernelModeBox.classList.remove('kernel-active');
    activeISR.textContent = '—';
    activeISR.style.color = '';
  }

  /* ---- Events ---- */
  startBtn.addEventListener('click', runBoot);

  resetBtn.addEventListener('click', () => {
    if (booting) return;
    booted = false;
    bootConsole.innerHTML = '<div class="boot-line boot-dim">OS ODYSSEY BIOS v2.1 — Ready to boot</div>';
    statusLabel.textContent = '● System OFF';
    statusLabel.style.color = '';
    storagePanel.style.display = 'none';
    interruptPanel.style.display = 'none';
    IRQ_TABLE.forEach(r => r.count = 0);
    document.querySelectorAll('.storage-fill').forEach(f => f.style.width = '0%');
    document.querySelectorAll('.storage-level').forEach(l => l.classList.remove('storage-active'));
  });

  document.querySelectorAll('[data-irq]').forEach(btn => {
    btn.addEventListener('click', () => handleIRQ(btn.dataset.irq));
  });

  function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

})();
