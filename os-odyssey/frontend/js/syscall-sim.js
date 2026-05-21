
(function () {
  'use strict';

  const $id = id => document.getElementById(id);
  const programSelect = $id('programSelect');
  const runBtn = $id('runSyscall');
  const resetBtn = $id('resetSyscall');
  const userIndicator = $id('userIndicator');
  const kernelIndicator = $id('kernelIndicator');
  const transitionLabel = $id('transitionLabel');
  const tracePanel = $id('tracePanel');
  const traceCounter = $id('traceCounter');
  const timeline = $id('syscallTimeline');
  const tablePanel = $id('syscallTablePanel');
  const syscallBody = $id('syscallBody');
  const modelDesc = $id('modelDesc');

  if (!runBtn) return;

  let running = false;
  let callCount = 0;
  let stepMode = false;
  let stepResume = null;

  const syscallTools = document.createElement('div');
  syscallTools.className = 'sim-step-tools';
  syscallTools.innerHTML = `
    <label class="sim-toggle"><input type="checkbox" id="syscallStepMode" /> Step-by-step mode</label>
    <button class="sim-btn sim-btn-preset" type="button" id="syscallNextStep" disabled>Next Step</button>
    <span class="sim-step-note" id="syscallStepNote"><strong>Step guide:</strong> Execute a program to explain each user/kernel transition.</span>
  `;
  $id('syscallControls').appendChild(syscallTools);
  const syscallStepToggle = $id('syscallStepMode');
  const syscallNextStep = $id('syscallNextStep');
  const syscallStepNote = $id('syscallStepNote');

  syscallStepToggle.addEventListener('change', () => {
    stepMode = syscallStepToggle.checked;
    if (!stepMode && stepResume) stepResume();
  });

  syscallNextStep.addEventListener('click', () => {
    if (stepResume) stepResume();
  });

  /* ---- Program Definitions ---- */
  const PROGRAMS = {
    fileRead: {
      name: 'File Read',
      calls: [
        { name: 'open()', cat: 'File', args: '"/data/report.txt", O_RDONLY', ret: 'fd = 3', desc: 'Opens the file and returns a file descriptor' },
        { name: 'read()', cat: 'File', args: 'fd=3, buf, 4096', ret: '1024 bytes', desc: 'Reads up to 4096 bytes from the file into buffer' },
        { name: 'read()', cat: 'File', args: 'fd=3, buf, 4096', ret: '0 (EOF)', desc: 'Second read returns 0 indicating end of file' },
        { name: 'close()', cat: 'File', args: 'fd=3', ret: '0 (success)', desc: 'Closes the file descriptor, releasing kernel resources' }
      ]
    },
    fileWrite: {
      name: 'File Write',
      calls: [
        { name: 'open()', cat: 'File', args: '"/data/log.txt", O_WRONLY|O_CREAT', ret: 'fd = 4', desc: 'Opens/creates the file for writing' },
        { name: 'write()', cat: 'File', args: 'fd=4, "Hello OS\\n", 9', ret: '9 bytes', desc: 'Writes 9 bytes to the file' },
        { name: 'fsync()', cat: 'File', args: 'fd=4', ret: '0 (success)', desc: 'Flushes file data from kernel buffer to disk' },
        { name: 'close()', cat: 'File', args: 'fd=4', ret: '0 (success)', desc: 'Closes the file descriptor' }
      ]
    },
    processCreate: {
      name: 'Process Fork',
      calls: [
        { name: 'fork()', cat: 'Process', args: '(none)', ret: 'child pid = 1234', desc: 'Creates a child process — duplicates address space' },
        { name: 'exec()', cat: 'Process', args: '"/bin/worker", argv', ret: '(does not return)', desc: 'Child replaces its image with a new program' },
        { name: 'wait()', cat: 'Process', args: '&status', ret: 'pid 1234 exited', desc: 'Parent blocks until child terminates' },
        { name: 'exit()', cat: 'Process', args: 'status=0', ret: '(never returns)', desc: 'Child process terminates with exit code 0' }
      ]
    },
    networkIO: {
      name: 'Network Socket',
      calls: [
        { name: 'socket()', cat: 'Network', args: 'AF_INET, SOCK_STREAM, 0', ret: 'fd = 5', desc: 'Creates a TCP socket endpoint' },
        { name: 'connect()', cat: 'Network', args: 'fd=5, 93.184.216.34:80', ret: '0 (connected)', desc: 'Establishes TCP connection to remote server' },
        { name: 'send()', cat: 'Network', args: 'fd=5, "GET / HTTP/1.1", 128', ret: '128 bytes sent', desc: 'Sends HTTP request to the server' },
        { name: 'recv()', cat: 'Network', args: 'fd=5, buf, 4096', ret: '2048 bytes', desc: 'Receives HTTP response from the server' },
        { name: 'close()', cat: 'Network', args: 'fd=5', ret: '0 (success)', desc: 'Closes the socket and releases kernel resources' }
      ]
    },
    memAlloc: {
      name: 'Memory Allocation',
      calls: [
        { name: 'mmap()', cat: 'Memory', args: 'NULL, 4096, PROT_READ|PROT_WRITE', ret: '0x7f4a00001000', desc: 'Maps 4KB of anonymous memory into process address space' },
        { name: 'mprotect()', cat: 'Memory', args: '0x7f4a00001000, 4096, PROT_READ', ret: '0 (success)', desc: 'Changes memory page protection to read-only' },
        { name: 'munmap()', cat: 'Memory', args: '0x7f4a00001000, 4096', ret: '0 (success)', desc: 'Unmaps memory region, returning it to the OS' }
      ]
    }
  };

  const CAT_COLORS = {
    File: '#20a7ff',
    Process: '#22c55e',
    Network: '#e879f9',
    Memory: '#f5a623'
  };

  /* ---- Mode Switching Animation ---- */
  function setMode(mode, label) {
    const isKernel = mode === 'kernel';
    userIndicator.querySelector('.mode-dot').classList.toggle('active', !isKernel);
    kernelIndicator.querySelector('.mode-dot').classList.toggle('active', isKernel);
    userIndicator.querySelector('span:last-child').textContent = isKernel ? 'Blocked (waiting)' : 'Application Running';
    kernelIndicator.querySelector('span:last-child').textContent = isKernel ? 'Executing Syscall' : 'OS Kernel';
    transitionLabel.textContent = label || 'System Call';

    $id('userModeCol').classList.toggle('mode-inactive', isKernel);
    $id('kernelModeCol').classList.toggle('mode-inactive', !isKernel);
  }

  /* ---- Run Program ---- */
  async function runProgram() {
    if (running) return;
    running = true;
    runBtn.disabled = true;
    runBtn.textContent = '⏳ Executing...';

    const program = PROGRAMS[programSelect.value];
    const calls = program.calls;

    tracePanel.style.display = '';
    tablePanel.style.display = '';
    timeline.innerHTML = '';
    syscallBody.innerHTML = '';
    callCount = 0;
    traceCounter.textContent = '0 system calls traced';

    for (let i = 0; i < calls.length; i++) {
      const call = calls[i];
      callCount++;
      traceCounter.textContent = `${callCount} system calls traced`;

      // User mode → prepare syscall
      setMode('user', `→ ${call.name}`);
      addTimelineBlock('user', `App calls ${call.name}`, CAT_COLORS[call.cat]);
      await explainSyscallStep(`The app prepares ${call.name} with arguments ${call.args}.`, i, 'user');
      await delay(400);

      // Transition to kernel
      setMode('kernel', call.name);
      addTimelineBlock('kernel', `Kernel: ${call.name}`, CAT_COLORS[call.cat]);
      await explainSyscallStep(`The CPU enters kernel mode so the OS can safely handle ${call.desc.toLowerCase()}.`, i, 'kernel');
      await delay(600);

      // Add to table
      addSyscallRow(callCount, call);

      // Return to user mode
      setMode('user', `← return`);
      addTimelineBlock('return', `Return: ${call.ret}`, '#8af1ff');
      await explainSyscallStep(`The kernel returns ${call.ret}; the program resumes in user mode.`, i, 'return');
      await delay(300);
    }

    // Final state
    setMode('user', 'Program Complete');
    addTimelineBlock('done', '✓ Program finished', '#22c55e');

    running = false;
    runBtn.disabled = false;
    runBtn.textContent = '▶ Execute Program';

    // Award sim badge
    if (typeof window.OS_ODYSSEY_AWARD_BADGE === 'function') {
      window.OS_ODYSSEY_AWARD_BADGE('sim_syscall');
    }
    if (typeof window.OS_ODYSSEY_RECORD_SIM_COMPLETION === 'function') {
      window.OS_ODYSSEY_RECORD_SIM_COMPLETION('syscall', Math.min(100, callCount * 20), 0);
    }
  }

  function explainSyscallStep(text, index, phase) {
    syscallStepNote.innerHTML = `<strong>Call ${index + 1} ${phase}:</strong> ${text}`;
    if (!stepMode) return Promise.resolve();
    syscallNextStep.disabled = false;
    return new Promise(resolve => {
      stepResume = () => {
        stepResume = null;
        syscallNextStep.disabled = true;
        resolve();
      };
    });
  }

  /* ---- Timeline Block ---- */
  function addTimelineBlock(type, text, color) {
    const block = document.createElement('div');
    block.className = `syscall-block syscall-${type}`;
    if (color) block.style.borderLeftColor = color;
    block.innerHTML = `<span class="syscall-block-text">${text}</span>`;
    timeline.appendChild(block);
    timeline.scrollTop = timeline.scrollHeight;
  }

  /* ---- Syscall Table Row ---- */
  function addSyscallRow(num, call) {
    const color = CAT_COLORS[call.cat];
    const row = document.createElement('tr');
    row.style.borderLeft = `4px solid ${color}`;
    row.style.animation = 'panelSlideIn 0.3s ease both';
    row.innerHTML = `
      <td>${num}</td>
      <td><strong style="color:${color}">${call.name}</strong></td>
      <td><span class="stat-chip" style="border-color:${color};color:${color}">${call.cat}</span></td>
      <td><code style="font-size:12px;color:var(--app-muted)">${call.args}</code></td>
      <td><code style="color:#8ef76e">${call.ret}</code></td>
      <td>Kernel</td>
    `;
    syscallBody.appendChild(row);
  }

  /* ---- Reset ---- */
  function reset() {
    if (running) return;
    tracePanel.style.display = 'none';
    tablePanel.style.display = 'none';
    timeline.innerHTML = '';
    syscallBody.innerHTML = '';
    callCount = 0;
    setMode('user', 'System Call');
  }

  /* ---- Events ---- */
  runBtn.addEventListener('click', runProgram);
  resetBtn.addEventListener('click', reset);

  function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

})();
