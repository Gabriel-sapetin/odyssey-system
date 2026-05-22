
(function () {
  'use strict';

  const DEFAULT_AVATAR = '../../assets/penguin-flower-removebg-preview.png';
  const DEFAULT_CHARACTER = 'Kernel Penguin';
  const SIGNUP_REQUIRED_CHARACTER = '__signup_required__';
  const GOOGLE_AUTH_MODE_KEY = 'os-odyssey-google-auth-mode';
  const AUTH_MESSAGE_KEY = 'os-odyssey-auth-message';
  let activeProfile = null;

  /* ---- Backend API helper ---- */
  const BACKEND_API = 'https://os-odyssey-api.onrender.com/api';

  /**
   * Call the backend API. Automatically attaches the Supabase JWT.
   * Returns the parsed JSON body, or null on error.
   */
  async function backendCall(method, path, body = null) {
    try {
      const session = await getSession();
      if (!session) return null;

      const opts = {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        keepalive: true,
      };
      if (body) opts.body = JSON.stringify(body);

      const res = await fetch(`${BACKEND_API}${path}`, opts);
      if (!res.ok) {
        console.error(`Backend ${method} ${path} failed:`, res.status, await res.text());
        return null;
      }
      return await res.json();
    } catch (err) {
      console.error(`Backend ${method} ${path} error:`, err);
      return null;
    }
  }

  /* ---- Global Background Music ---- */
  (function initBgMusic() {
    const BGM_SRC = '../../assets/Purity - Beautiful Piano Song, Relaxing BGM BigRicePiano.mp3';
    const MUTE_KEY = 'os-odyssey-bgm-muted';
    const POS_KEY = 'os-odyssey-bgm-position';
    const BGM_VOLUME = 0.3;

    const bgm = new Audio(BGM_SRC);
    bgm.loop = true;
    bgm.volume = BGM_VOLUME;

    /* Restore mute preference */
    const isMuted = localStorage.getItem(MUTE_KEY) === 'true';
    bgm.muted = isMuted;

    /* Restore playback position so music doesn't restart on navigation */
    const savedPos = parseFloat(sessionStorage.getItem(POS_KEY));
    if (!isNaN(savedPos) && savedPos > 0) {
      bgm.currentTime = savedPos;
    }

    /* Periodically save position so page transitions are seamless */
    setInterval(() => {
      if (!bgm.paused) {
        sessionStorage.setItem(POS_KEY, bgm.currentTime);
      }
    }, 500);

    /* Save position right before navigating away */
    window.addEventListener('beforeunload', () => {
      sessionStorage.setItem(POS_KEY, bgm.currentTime);
    });

    /* — Inject floating mute/unmute toggle — */
    const btn = document.createElement('button');
    btn.id = 'bgmToggle';
    btn.type = 'button';
    btn.setAttribute('aria-label', 'Toggle background music');
    btn.innerHTML = isMuted ? '🔇' : '🔊';
    document.body.appendChild(btn);

    const style = document.createElement('style');
    style.textContent = `
      #bgmToggle {
        position: fixed;
        bottom: 24px;
        right: 24px;
        z-index: 9999;
        width: 48px;
        height: 48px;
        border-radius: 50%;
        border: 2px solid rgba(255,255,255,0.15);
        background: rgba(20, 20, 35, 0.75);
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        color: #fff;
        font-size: 22px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 4px 16px rgba(0,0,0,0.35);
        transition: transform 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
      }
      #bgmToggle:hover {
        transform: scale(1.12);
        box-shadow: 0 6px 24px rgba(0,0,0,0.45);
        background: rgba(40, 40, 60, 0.85);
      }
      #bgmToggle:active {
        transform: scale(0.95);
      }
    `;
    document.head.appendChild(style);

    btn.addEventListener('click', (e) => {
      e.stopPropagation(); // don't trigger the document-level tryStartBgm
      bgm.muted = !bgm.muted;
      localStorage.setItem(MUTE_KEY, bgm.muted);
      btn.innerHTML = bgm.muted ? '🔇' : '🔊';
    });

    /* — Start playback on first user interaction (autoplay policy) — */
    let bgmStarted = false;

    function removeStartListeners() {
      document.removeEventListener('click', tryStartBgm, true);
      document.removeEventListener('keydown', tryStartBgm, true);
      document.removeEventListener('touchstart', tryStartBgm, true);
    }

    function tryStartBgm() {
      if (bgmStarted) return;
      bgmStarted = true;

      bgm.play().then(() => {
        // Successfully playing — remove listeners so we never re-trigger
        removeStartListeners();
      }).catch(err => {
        console.warn('BGM autoplay blocked:', err);
        bgmStarted = false; // allow retry on next interaction
      });
    }

    document.addEventListener('click', tryStartBgm, true);
    document.addEventListener('keydown', tryStartBgm, true);
    document.addEventListener('touchstart', tryStartBgm, true);
  })();

  /* ---- Module stats metadata (update as new modules are built) ---- */
  const MODULE_META = [
    { id: 'module1', statements: 15 },
    { id: 'module2', statements: 15 },
    { id: 'module3', statements: 15 },
    { id: 'module4', statements: 25 }
  ];
  const TOTAL_MODULES = MODULE_META.length;

  // Expose MODULE_META globally so other scripts (profile.js) can read it dynamically
  window.OS_ODYSSEY_MODULE_META = MODULE_META;

  function getTotalTopics() {
    return MODULE_META.reduce((sum, m) => sum + m.statements, 0);
  }

  function isModuleTopicsDone(moduleId) {
    return localStorage.getItem('os-odyssey-topics-done-' + moduleId) === 'true';
  }

  function markModuleTopicsDone(moduleId) {
    localStorage.setItem('os-odyssey-topics-done-' + moduleId, 'true');
  }

  function quizHistoryKey(userId) {
    return `os-odyssey-quiz-history-${userId || 'guest'}`;
  }

  function readQuizHistory(userId) {
    try {
      const raw = localStorage.getItem(quizHistoryKey(userId));
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (err) {
      console.warn('Unable to read quiz history:', err);
      return {};
    }
  }

  function recordQuizAttempt(moduleId, score, total) {
    if (!moduleId || !total) return;

    const userId = activeProfile && activeProfile.id;
    const history = readQuizHistory(userId);
    const attempts = Array.isArray(history[moduleId]) ? history[moduleId] : [];
    history[moduleId] = [
      ...attempts,
      {
        score,
        total,
        percent: Math.round((score / total) * 100),
        completedAt: new Date().toISOString()
      }
    ];

    localStorage.setItem(quizHistoryKey(userId), JSON.stringify(history));
  }

  /**
   * Module unlock logic:
   * - Module 1 is always unlocked.
   * - Module N (N>1) is unlocked when Module N-1 has been completed.
   * - A module is "completed" once the user finishes its quiz (any score).
   */
  function isModuleUnlocked(moduleId) {
    const idx = MODULE_META.findIndex(m => m.id === moduleId);
    if (idx <= 0) return true; // Module 1 or unknown → always open
    const prevModuleId = MODULE_META[idx - 1].id;
    const completedModules = (activeProfile && activeProfile.completed_modules) ? activeProfile.completed_modules : [];
    return completedModules.includes(prevModuleId);
  }

  const BADGE_DEFS = [
    { id: 'badge_module1', name: 'OS Pioneer', icon: '🖥️', color: '#22c55e', desc: 'Completed Module 1: Introduction to Operating Systems', trigger: 'module1' },
    { id: 'badge_module2', name: 'System Architect', icon: '🏗️', color: '#3b82f6', desc: 'Completed Module 2: Operating-System Structures', trigger: 'module2' },
    { id: 'badge_module3', name: 'Process Master', icon: '⚙️', color: '#f59e0b', desc: 'Completed Module 3: Processes', trigger: 'module3' },
    { id: 'badge_module4', name: 'Thread Weaver', icon: '🧵', color: '#e879f9', desc: 'Completed Module 4: Threads', trigger: 'module4' },
    // Simulation interaction badges
    { id: 'badge_sim_boot', name: 'Boot Commander', icon: '⚡', color: '#7c3aed', desc: 'Interacted with the Boot & Interrupts simulator', trigger: 'sim_boot' },
    { id: 'badge_sim_syscall', name: 'Kernel Caller', icon: '📞', color: '#0891b2', desc: 'Interacted with the System Call Tracer', trigger: 'sim_syscall' },
    { id: 'badge_sim_scheduling', name: 'Scheduler Ace', icon: '🗓️', color: '#f97316', desc: 'Ran the CPU Scheduling simulator', trigger: 'sim_scheduling' },
    { id: 'badge_sim_memory', name: 'Memory Warden', icon: '💾', color: '#06b6d4', desc: 'Interacted with the Memory Labs simulator', trigger: 'sim_memory' },
    { id: 'badge_sim_process', name: 'State Navigator', icon: '🔄', color: '#059669', desc: 'Interacted with the Process States simulator', trigger: 'sim_process' },
    { id: 'badge_sim_thread', name: 'Concurrency Pro', icon: '🔀', color: '#dc2626', desc: 'Interacted with the Thread Visualizer', trigger: 'sim_thread' }
  ];

  // Expose badge defs globally for profile.js
  window.OS_ODYSSEY_BADGE_DEFS = BADGE_DEFS;

  /* ---- Badge popup injection styles ---- */
  (function injectBadgeStyles() {
    const s = document.createElement('style');
    s.textContent = `
      .badge-popup-overlay {
        position: fixed;
        inset: 0;
        z-index: 10000;
        display: grid;
        place-items: center;
        background: rgba(3,7,18,0.75);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        animation: badgeFadeIn 0.4s ease both;
      }
      @keyframes badgeFadeIn {
        from { opacity: 0; }
        to   { opacity: 1; }
      }
      .badge-popup-card {
        position: relative;
        width: min(420px, 90vw);
        background: linear-gradient(145deg, rgba(10,16,32,0.97), rgba(18,27,48,0.97));
        border: 2px solid;
        border-radius: 16px;
        padding: 48px 36px 36px;
        text-align: center;
        box-shadow: 0 20px 80px rgba(0,0,0,0.7);
        animation: badgeCardPop 0.55s cubic-bezier(0.34,1.56,0.64,1) both;
      }
      @keyframes badgeCardPop {
        from { transform: scale(0.5) translateY(40px); opacity: 0; }
        to   { transform: scale(1) translateY(0); opacity: 1; }
      }
      .badge-popup-confetti {
        position: absolute;
        top: -10px; left: 50%; transform: translateX(-50%);
        font-size: 36px;
        animation: badgeConfetti 0.6s ease both;
      }
      @keyframes badgeConfetti {
        0% { transform: translateX(-50%) scale(0) rotate(-30deg); }
        50% { transform: translateX(-50%) scale(1.3) rotate(5deg); }
        100% { transform: translateX(-50%) scale(1) rotate(0deg); }
      }
      .badge-popup-icon {
        width: 100px;
        height: 100px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 48px;
        margin: 0 auto 20px;
        border: 3px solid;
        animation: badgeIconGlow 2s ease-in-out infinite alternate;
      }
      @keyframes badgeIconGlow {
        from { box-shadow: 0 0 20px rgba(255,255,255,0.1); }
        to   { box-shadow: 0 0 40px rgba(255,255,255,0.25); }
      }
      .badge-popup-label {
        font-family: var(--font-pixel, 'Press Start 2P', monospace);
        font-size: 10px;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        margin-bottom: 8px;
        opacity: 0.7;
      }
      .badge-popup-name {
        font-family: var(--font-pixel, 'Press Start 2P', monospace);
        font-size: 18px;
        line-height: 1.5;
        margin-bottom: 12px;
      }
      .badge-popup-desc {
        font-size: 14px;
        color: #94a3b8;
        line-height: 1.5;
        margin-bottom: 28px;
      }
      .badge-popup-close {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 12px 36px;
        border: 2px solid;
        border-radius: 8px;
        background: rgba(255,255,255,0.05);
        font-family: var(--font-pixel, 'Press Start 2P', monospace);
        font-size: 10px;
        cursor: pointer;
        transition: all 0.2s ease;
      }
      .badge-popup-close:hover {
        background: rgba(255,255,255,0.12);
        transform: translateY(-1px);
      }
      .badge-popup-particles {
        position: absolute;
        inset: 0;
        pointer-events: none;
        overflow: hidden;
        border-radius: 16px;
      }
      .badge-particle {
        position: absolute;
        width: 4px; height: 4px;
        border-radius: 50%;
        animation: badgeParticleFloat 3s ease-out forwards;
      }
      @keyframes badgeParticleFloat {
        0%   { transform: translateY(0) scale(1); opacity: 1; }
        100% { transform: translateY(-120px) translateX(var(--dx)) scale(0); opacity: 0; }
      }
    `;
    document.head.appendChild(s);
  })();

  /** Show a premium badge-earned popup */
  function showBadgePopup(badge) {
    const overlay = document.createElement('div');
    overlay.className = 'badge-popup-overlay';
    overlay.innerHTML = `
      <div class="badge-popup-card" style="border-color: ${badge.color}">
        <div class="badge-popup-particles" id="badgeParticles"></div>
        <div class="badge-popup-confetti">🎉</div>
        <div class="badge-popup-icon" style="background: ${badge.color}22; border-color: ${badge.color}">
          ${badge.icon}
        </div>
        <p class="badge-popup-label" style="color: ${badge.color}">Badge Earned!</p>
        <h2 class="badge-popup-name" style="color: ${badge.color}">${badge.name}</h2>
        <p class="badge-popup-desc">${badge.desc}</p>
        <button class="badge-popup-close" style="border-color: ${badge.color}; color: ${badge.color}">Awesome!</button>
      </div>
    `;
    document.body.appendChild(overlay);

    // Spawn particles
    const particleContainer = overlay.querySelector('#badgeParticles');
    for (let i = 0; i < 20; i++) {
      const p = document.createElement('div');
      p.className = 'badge-particle';
      p.style.cssText = `
        left: ${10 + Math.random() * 80}%;
        bottom: ${Math.random() * 30}%;
        background: ${badge.color};
        animation-delay: ${Math.random() * 0.8}s;
        animation-duration: ${2 + Math.random() * 2}s;
        --dx: ${(Math.random() - 0.5) * 60}px;
      `;
      particleContainer.appendChild(p);
    }

    // Close
    const closeBtn = overlay.querySelector('.badge-popup-close');
    function close() {
      overlay.style.opacity = '0';
      overlay.style.transition = 'opacity 0.3s ease';
      setTimeout(() => overlay.remove(), 320);
    }
    closeBtn.addEventListener('click', close);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });
  }

  /** Award a badge by trigger ID (e.g. 'module1', 'sim_boot'). Shows popup if new. */
  async function awardBadge(triggerId) {
    if (!activeProfile) return;

    const badge = BADGE_DEFS.find(b => b.trigger === triggerId);
    if (!badge) return;

    const earned = activeProfile.earned_badges || [];
    if (earned.includes(badge.id)) return; // already earned

    const updatedBadges = [...earned, badge.id];
    const updatedCount = updatedBadges.length;

    // Optimistic UI update
    activeProfile.earned_badges = updatedBadges;
    activeProfile.badges = updatedCount;
    const profileBadgesEl = document.getElementById('profileBadges');
    if (profileBadgesEl) profileBadgesEl.textContent = updatedCount;

    // Show the popup
    showBadgePopup(badge);

    // Persist via backend API (RLS blocks direct writes to earned_badges)
    const result = await backendCall('POST', '/progress/award-badge', { badge_id: badge.id });
    if (result) {
      // Refresh profile to get server-authoritative state
      const refreshed = await getCurrentUser();
      if (refreshed) activeProfile = { ...activeProfile, ...refreshed };
    }
  }

  // Expose globally so simulation scripts can call it
  window.OS_ODYSSEY_AWARD_BADGE = awardBadge;

  /* ============================================================
     STREAK TRACKING
     ============================================================ */
  async function updateStreak() {
    if (!activeProfile) return;

    const today = new Date().toISOString().slice(0, 10);
    if (activeProfile.last_active_date === today) return;

    // Call backend — server determines streak logic (tamper-proof)
    const result = await backendCall('POST', '/progress/streak');
    if (result && result.streak != null) {
      activeProfile.streak = result.streak;
      activeProfile.last_active_date = today;
      const streakEl = document.getElementById('profileStreak');
      if (streakEl) streakEl.textContent = result.streak;
    }
  }

  /* ---- Platform stats (index page stats band) ---- */
  async function loadPlatformStats() {
    const statLearners = document.getElementById('statLearners');
    const statModules = document.getElementById('statModules');
    const statTopics = document.getElementById('statTopics');
    const ctaLearners = document.getElementById('ctaLearners');

    if (statModules) statModules.textContent = TOTAL_MODULES;
    if (statTopics) statTopics.textContent = getTotalTopics();

    if (statLearners || ctaLearners) {
      try {
        const { data, error } = await supa.rpc('get_learner_count');
        if (!error && data !== null) {
          const count = Number(data);
          if (statLearners) statLearners.textContent = count;
          if (ctaLearners) ctaLearners.textContent = count + '+';
        }
      } catch (e) {
        console.error('Failed to fetch learner count:', e);
      }
    }
  }

  /* ---- Progress tracking (dashboard) ---- */
  function updateProgressDisplay(user) {
    const completed = (user && user.completed_modules) ? user.completed_modules.length : 0;
    const pct = Math.round((completed / TOTAL_MODULES) * 100);
    const bar = document.getElementById('progressBar');
    const text = document.getElementById('progressText');
    if (bar) bar.style.width = pct + '%';
    if (text) text.textContent = pct + '%';
  }

  function completedModuleCount(user) {
    const completed = Array.isArray(user && user.completed_modules) ? user.completed_modules : [];
    return MODULE_META.filter(module => completed.includes(module.id)).length;
  }

  function isKernelModeUnlocked(user) {
    return completedModuleCount(user) >= TOTAL_MODULES;
  }

  function renderSystemLabState(user) {
    const unlocked = isKernelModeUnlocked(user);
    const card = document.getElementById('systemLabCard');
    const title = document.getElementById('systemLabTitle');
    const copy = document.getElementById('systemLabCopy');
    const action = document.getElementById('systemLabAction');
    const completed = completedModuleCount(user);

    if (card) card.classList.toggle('kernel-unlocked', unlocked);
    if (title) title.textContent = unlocked ? 'Kernel mode unlocked' : 'Unlock kernel mode';
    if (copy) {
      copy.textContent = unlocked
        ? 'System Lab is open. Launch simulations and complete kernel-mode challenges.'
        : `Complete ${TOTAL_MODULES - completed} more module${TOTAL_MODULES - completed === 1 ? '' : 's'} to unlock System Lab simulations.`;
    }
    if (action) {
      action.textContent = unlocked ? 'Enter System Lab' : 'Open Course';
      action.setAttribute('href', unlocked ? '#system-lab' : 'course.html');
    }

    const systemLabSection = document.getElementById('system-lab');
    if (systemLabSection) systemLabSection.hidden = !unlocked;

    document.querySelectorAll('.explore-card-link.kernel-sim-link').forEach(cardLink => {
      cardLink.classList.toggle('kernel-locked', !unlocked);
      cardLink.setAttribute('aria-disabled', unlocked ? 'false' : 'true');
      let lock = cardLink.querySelector('.kernel-lock-label');
      if (!unlocked && !lock) {
        lock = document.createElement('span');
        lock.className = 'kernel-lock-label';
        lock.textContent = `Complete all ${TOTAL_MODULES} modules`;
        cardLink.appendChild(lock);
      } else if (unlocked && lock) {
        lock.remove();
      }
    });
  }

  function simProgressKey() {
    const userId = activeProfile && activeProfile.id;
    return `os-odyssey-sim-progress-${userId || 'guest'}`;
  }
  const SIM_META = [
    { id: 'boot', name: 'Boot & Interrupts' },
    { id: 'syscall', name: 'System Call Tracer' },
    { id: 'scheduling', name: 'Scheduling Challenges' },
    { id: 'memory', name: 'Memory Labs' },
    { id: 'process', name: 'Process States' },
    { id: 'thread', name: 'Thread Visualizer' },
    { id: 'filesystem', name: 'File System Simulator' },
    { id: 'deadlock', name: 'Deadlock Simulator' },
    { id: 'disk', name: 'Disk Scheduling Simulator' },
    { id: 'virtual-memory', name: 'Virtual Memory Simulator' }
  ];

  function readSimProgress() {
    try {
      const raw = localStorage.getItem(simProgressKey());
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (err) {
      console.warn('Unable to read simulation progress:', err);
      return {};
    }
  }

  function getSimBonusXp(progress) {
    return Object.values(progress || {}).reduce((sum, sim) => sum + Number(sim.bonusXp || 0), 0);
  }

  function displayXpWithBonus(baseXp) {
    const bonus = getSimBonusXp(readSimProgress());
    return Number(baseXp || 0) + bonus;
  }

  function recordSimCompletion(simId, score = 0, bonusXp = 0) {
    if (!simId) return null;
    const progress = readSimProgress();
    const existing = progress[simId] || {};
    const bestScore = Math.max(Number(existing.bestScore || 0), Number(score || 0));
    const earnedBonus = Math.max(Number(existing.bonusXp || 0), Number(bonusXp || 0));

    progress[simId] = {
      completed: true,
      bestScore,
      bonusXp: earnedBonus,
      completedAt: existing.completedAt || new Date().toISOString(),
      lastPlayedAt: new Date().toISOString()
    };

    localStorage.setItem(simProgressKey(), JSON.stringify(progress));
    renderSimProgressDashboard();
    renderProfileStats(activeProfile);
    return progress[simId];
  }

  function renderSimProgressDashboard() {
    const list = document.getElementById('simProgressList');
    const summary = document.getElementById('simProgressSummary');
    if (!list && !summary) return;

    const progress = readSimProgress();
    const completedCount = SIM_META.filter(sim => progress[sim.id] && progress[sim.id].completed).length;
    const bonusXp = getSimBonusXp(progress);

    if (summary) {
      summary.textContent = `${completedCount}/${SIM_META.length} complete | ${bonusXp} bonus XP`;
    }

    if (list) {
      list.innerHTML = SIM_META.map(sim => {
        const entry = progress[sim.id] || {};
        const complete = Boolean(entry.completed);
        const score = Number(entry.bestScore || 0);
        return `
          <div class="sim-progress-item ${complete ? 'complete' : ''}">
            <span>${sim.name}</span>
            <strong>${complete ? `Best ${score}` : 'Not cleared'}</strong>
          </div>
        `;
      }).join('');
    }
  }

  window.OS_ODYSSEY_RECORD_SIM_COMPLETION = recordSimCompletion;
  window.OS_ODYSSEY_READ_SIM_PROGRESS = readSimProgress;

  async function markModuleCompleted(moduleId) {
    if (!activeProfile) return;

    const completed = activeProfile.completed_modules || [];
    if (completed.includes(moduleId)) return;

    // Call backend — awards XP, updates completed_modules, and validates module ID
    const result = await backendCall('POST', '/progress/complete-module', { module_id: moduleId });
    if (result && !result.already_completed) {
      // Update local profile from server response
      activeProfile.completed_modules = [...completed, moduleId];
      if (result.xp != null) activeProfile.xp = result.xp;
      if (result.level != null) activeProfile.level = result.level;
      if (result.rank != null) activeProfile.rank = result.rank;
      renderProfileStats(activeProfile);
      updateProgressDisplay(activeProfile);
      renderSystemLabState(activeProfile);
      renderCourseProgressPanel();
      if (typeof applyModuleLockState === 'function') applyModuleLockState();
    }

    // Award the corresponding module badge via backend
    awardBadge(moduleId);
  }

  /* ---- Supabase helpers ---- */

  async function getSession() {
    const { data: { session } } = await supa.auth.getSession();
    return session;
  }

  async function getCurrentUser() {
    const session = await getSession();
    if (!session) return null;

    const { data, error } = await supa
      .from('profiles')
      .select('*')
      .eq('id', session.user.id)
      .single();

    if (error) {
      console.error('Error fetching profile:', error);
      return null;
    }
    return data;
  }

  async function updateUserProfile(updates) {
    const session = await getSession();
    if (!session) return null;

    const { data, error } = await supa
      .from('profiles')
      .update(updates)
      .eq('id', session.user.id)
      .select()
      .single();

    if (error) {
      console.error('Error updating profile:', error);
      return null;
    }
    return data;
  }

  /* ---- Avatar rendering ---- */

  function renderAvatar(target, user) {
    if (!target || !user) return;

    if (user.avatar === 'computer') {
      target.innerHTML = '<span class="computer-avatar mini"><span class="screen-face"></span></span>';
      return;
    }

    target.innerHTML = `<img src="${user.avatar}" alt="${user.character}" />`;
  }

  /* ---- Session UI ---- */

  async function renderSessionUI() {
    const user = await getCurrentUser();
    activeProfile = user;

    document.querySelectorAll('[data-auth-action="guest"]').forEach(el => {
      el.hidden = Boolean(user);
    });
    document.querySelectorAll('[data-auth-action="user"]').forEach(el => {
      el.hidden = !user;
    });

    if (!user) {
      loadLeaderboard(null);

      // Redirect away from dashboard if not logged in
      if (document.body.classList.contains('dashboard-page') || document.body.classList.contains('course-page')) {
        window.location.href = 'login.html';
      }
      return;
    }

    const normalizedLevel = calculateLevel(user.xp);
    const normalizedRank = calculateRank(normalizedLevel);
    const displayUser = {
      ...user,
      level: normalizedLevel,
      rank: normalizedRank
    };
    activeProfile = displayUser;

    document.querySelectorAll('[data-user-name]').forEach(el => {
      el.textContent = displayUser.username;
    });
    document.querySelectorAll('[data-user-avatar]').forEach(el => renderAvatar(el, displayUser));

    // Dashboard profile elements
    const profileName = document.getElementById('profileName');
    const profileAvatar = document.getElementById('profileAvatar');
    const profileLevel = document.getElementById('profileLevel');
    const profileXp = document.getElementById('profileXp');
    const profileRank = document.getElementById('profileRank');
    const profileBadges = document.getElementById('profileBadges');
    const profileStreak = document.getElementById('profileStreak');

    if (profileName) profileName.textContent = displayUser.username;
    if (profileLevel) profileLevel.textContent = `Level ${displayUser.level}`;
    if (profileXp) profileXp.textContent = displayXpWithBonus(displayUser.xp);
    if (profileRank) profileRank.textContent = displayUser.rank;
    if (profileBadges) profileBadges.textContent = (displayUser.earned_badges || []).length;
    if (profileStreak) profileStreak.textContent = displayUser.streak;
    if (profileAvatar) renderAvatar(profileAvatar, displayUser);
    updateProgressDisplay(displayUser);
    renderSimProgressDashboard();
    renderSystemLabState(displayUser);

    if (document.body.dataset.kernelSim && !isKernelModeUnlocked(displayUser)) {
      window.location.href = 'dashboard.html#practice';
      return;
    }

    // Update streak on each session
    updateStreak();

    // Update course progress panel (if on course page)
    renderCourseProgressPanel();

    // Refresh lock/unlock state for sidebar & action buttons now that profile is loaded
    applyModuleLockState();

    loadLeaderboard(displayUser);

    // Set personalized welcome text for typewriter
    const typewriterEl = document.getElementById('typewriterText');
    if (typewriterEl) {
      const name = displayUser.username || 'kernel cadet';
      typewriterEl.setAttribute('data-full-text',
        `Hii ${name}. Your process table is ready, and today we are booting into Operating Systems.`);
      startTypewriter();
    }
  }

  function calculateLevel(xp) {
    return Math.max(1, Math.floor(Number(xp || 0) / 20));
  }

  function calculateRank(level) {
    if (level >= 115) return 'Platinum';
    if (level >= 75) return 'Gold';
    if (level >= 30) return 'Silver';
    return 'Bronze';
  }

  function renderProfileStats(user) {
    if (!user) return;

    const profileLevel = document.getElementById('profileLevel');
    const profileXp = document.getElementById('profileXp');
    const profileRank = document.getElementById('profileRank');

    if (profileLevel) profileLevel.textContent = `Level ${user.level}`;
    if (profileXp) profileXp.textContent = displayXpWithBonus(user.xp);
    if (profileRank) profileRank.textContent = user.rank;
  }

  function formatXp(value) {
    return Number(value || 0).toLocaleString();
  }

  function formatBadgeCount(value) {
    const count = Number(value || 0);
    return `${count.toLocaleString()} ${count === 1 ? 'Badge' : 'Badges'}`;
  }

  function formatOrdinal(value) {
    const number = Number(value || 0);
    const tens = number % 100;
    if (tens >= 11 && tens <= 13) return `${number}th`;

    switch (number % 10) {
      case 1:
        return `${number}st`;
      case 2:
        return `${number}nd`;
      case 3:
        return `${number}rd`;
      default:
        return `${number}th`;
    }
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[char]));
  }

  function avatarMarkup(entry) {
    if (entry.avatar === 'computer') {
      return '<span class="computer-avatar mini"><span class="screen-face"></span></span>';
    }

    const avatar = entry.avatar || DEFAULT_AVATAR;
    const name = entry.username || entry.character || DEFAULT_CHARACTER;
    return `<img src="${escapeHtml(avatar)}" alt="${escapeHtml(name)} avatar" />`;
  }

  async function loadLeaderboard(currentUser) {
    const list = document.getElementById('leaderboardList');
    if (!list) return;

    const title = document.getElementById('leaderboardTitle');
    const metricHead = document.getElementById('leaderboardMetricHead');
    const userRankSummary = document.getElementById('leaderboardUserRankSummary');
    const sortButtons = document.querySelectorAll('[data-rank-mode]');
    let rankMode = 'xp';

    const renderLeaderboard = entries => {
      const rankedEntries = [...entries].sort((a, b) => {
        if (rankMode === 'badges') {
          return Number(b.badge_count || 0) - Number(a.badge_count || 0)
            || Number(b.xp || 0) - Number(a.xp || 0)
            || String(a.username || '').localeCompare(String(b.username || ''));
        }

        return Number(b.xp || 0) - Number(a.xp || 0)
          || Number(b.badge_count || 0) - Number(a.badge_count || 0)
          || String(a.username || '').localeCompare(String(b.username || ''));
      });

      if (title) title.textContent = rankMode === 'badges' ? 'Ranked by Badges' : 'Ranked by Total XP';
      if (metricHead) metricHead.textContent = rankMode === 'badges' ? 'Badges' : 'Total XP';
      if (userRankSummary) {
        const modeLabel = rankMode === 'badges' ? 'BADGES' : 'XP';
        const currentIndex = currentUser
          ? rankedEntries.findIndex(entry => entry.username === currentUser.username)
          : -1;

        if (!currentUser) {
          userRankSummary.textContent = `Sign in to see your ${modeLabel} leaderboard rank.`;
        } else if (currentIndex >= 0) {
          userRankSummary.textContent = `You're ranked ${formatOrdinal(currentIndex + 1)} in the ${modeLabel} Leaderboard!`;
        } else {
          userRankSummary.textContent = `You're not ranked in the ${modeLabel} Leaderboard yet.`;
        }
      }

      list.innerHTML = rankedEntries.map((entry, index) => {
        const position = index + 1;
        const isCurrentUser = currentUser && entry.username === currentUser.username;
        const medalClass = position <= 3 ? ` top-${position}` : '';
        const currentClass = isCurrentUser ? ' is-current-user' : '';
        const rank = entry.rank || calculateRank(entry.level || 1);
        const metricClass = rankMode === 'badges' ? 'leaderboard-badges' : 'leaderboard-xp';
        const metricText = rankMode === 'badges' ? formatBadgeCount(entry.badge_count) : `${formatXp(entry.xp)} XP`;

        return `
          <article class="leaderboard-row${medalClass}${currentClass}">
            <span class="leaderboard-position">${position}</span>
            <span class="leaderboard-player">
              <span class="leaderboard-avatar">${avatarMarkup(entry)}</span>
              <span>
                <strong>${escapeHtml(entry.username || 'Anonymous')}</strong>
                <small>${isCurrentUser ? 'You' : escapeHtml(entry.character || DEFAULT_CHARACTER)}</small>
              </span>
            </span>
            <span class="leaderboard-stat"><strong>${Number(entry.level || 1)}</strong><small>Level</small></span>
            <span class="leaderboard-rank">${escapeHtml(rank)}</span>
            <span class="${metricClass}">${escapeHtml(metricText)}</span>
          </article>
        `;
      }).join('');
    };

    list.innerHTML = '<div class="leaderboard-state">Loading leaderboard...</div>';

    try {
      const { data, error } = await supa.rpc('get_leaderboard');
      if (error) throw error;

      const entries = Array.isArray(data) ? data : [];
      if (!entries.length) {
        list.innerHTML = '<div class="leaderboard-state">No leaderboard data yet.</div>';
        if (userRankSummary) {
          userRankSummary.textContent = currentUser
            ? 'Your leaderboard rank will appear once rankings are ready.'
            : 'Sign in to see your leaderboard rank.';
        }
        return;
      }

      sortButtons.forEach(button => {
        button.onclick = () => {
          rankMode = button.dataset.rankMode === 'badges' ? 'badges' : 'xp';
          sortButtons.forEach(item => item.classList.toggle('active', item === button));
          renderLeaderboard(entries);
        };
      });

      renderLeaderboard(entries);
    } catch (error) {
      console.error('Failed to load leaderboard:', error);
      list.innerHTML = '<div class="leaderboard-state">Leaderboard is not ready yet. Apply the latest database migration and reload.</div>';
      if (userRankSummary) {
        userRankSummary.textContent = 'Your leaderboard rank is unavailable right now.';
      }
    }
  }

  function showAuthError(message) {
    const form = document.querySelector('.auth-form') || document.querySelector('.character-panel');
    if (!form) return;

    let error = form.querySelector('.auth-error');
    if (!error) {
      error = document.createElement('p');
      error.className = 'auth-error';
      form.prepend(error);
    }

    error.textContent = message;
  }

  function showAuthSuccess(message) {
    const form = document.querySelector('.auth-form');
    if (!form) return;

    // Remove any existing error
    const existing = form.querySelector('.auth-error');
    if (existing) existing.remove();

    let success = form.querySelector('.auth-success');
    if (!success) {
      success = document.createElement('p');
      success.className = 'auth-success';
      form.prepend(success);
    }

    success.textContent = message;
  }

  const pendingAuthMessage = sessionStorage.getItem(AUTH_MESSAGE_KEY);
  if (pendingAuthMessage) {
    sessionStorage.removeItem(AUTH_MESSAGE_KEY);
    showAuthError(pendingAuthMessage);
  }

  /* ---- Theme Toggle (landing page) ---- */
  const html = document.documentElement;
  const toggleBtn = document.getElementById('themeToggle');

  const savedTheme = localStorage.getItem('os-odyssey-theme') || 'light';
  html.setAttribute('data-theme', savedTheme);

  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      const next = html.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
      html.setAttribute('data-theme', next);
      localStorage.setItem('os-odyssey-theme', next);
    });
  }

  /* ---- Mobile Menu Toggle ---- */
  const mobileNavToggle = document.getElementById('mobileNavToggle');
  let navbar = document.querySelector('.navbar');
  
  if (mobileNavToggle && navbar) {
    mobileNavToggle.addEventListener('click', () => {
      navbar.classList.toggle('mobile-menu-open');
      document.body.style.overflow = navbar.classList.contains('mobile-menu-open') ? 'hidden' : '';
    });

    // Close menu when clicking on links
    const navLinks = navbar.querySelectorAll('.nav-leaderboard-link, .btn-primary');
    navLinks.forEach(link => {
      link.addEventListener('click', () => {
        navbar.classList.remove('mobile-menu-open');
        document.body.style.overflow = '';
      });
    });

    // Close menu when clicking outside
    document.addEventListener('click', (e) => {
      if (!navbar.contains(e.target) && navbar.classList.contains('mobile-menu-open')) {
        navbar.classList.remove('mobile-menu-open');
        document.body.style.overflow = '';
      }
    });
  }

  /* ---- Mobile Menu Toggle for App Nav ---- */
  const appNavMobileToggle = document.querySelector('.app-nav-mobile-toggle');
  const appNav = document.querySelector('.app-nav');
  
  if (appNavMobileToggle && appNav) {
    appNavMobileToggle.addEventListener('click', () => {
      const isOpen = appNav.classList.toggle('mobile-menu-open');
      appNavMobileToggle.setAttribute('aria-expanded', String(isOpen));
      appNavMobileToggle.setAttribute('aria-label', isOpen ? 'Close navigation menu' : 'Open navigation menu');
      document.body.style.overflow = isOpen ? 'hidden' : '';
    });

    // Close menu when clicking on links
    const appNavLinks = appNav.querySelectorAll('.app-nav-links > a, .app-link-button');
    appNavLinks.forEach(link => {
      link.addEventListener('click', () => {
        appNav.classList.remove('mobile-menu-open');
        appNavMobileToggle.setAttribute('aria-expanded', 'false');
        appNavMobileToggle.setAttribute('aria-label', 'Open navigation menu');
        document.body.style.overflow = '';
      });
    });

    // Close menu when clicking outside
    document.addEventListener('click', (e) => {
      if (!appNav.contains(e.target) && appNav.classList.contains('mobile-menu-open')) {
        appNav.classList.remove('mobile-menu-open');
        appNavMobileToggle.setAttribute('aria-expanded', 'false');
        appNavMobileToggle.setAttribute('aria-label', 'Open navigation menu');
        document.body.style.overflow = '';
      }
    });
  }

  /* ---- Theme Toggle (dashboard) ---- */
  const dashToggle = document.getElementById('dashThemeToggle');
  const isDashboard = document.body.classList.contains('app-page') || document.body.classList.contains('dashboard-page');

  if (isDashboard) {
    const savedDashTheme = localStorage.getItem('os-odyssey-dash-theme') || 'dark';
    if (savedDashTheme === 'light') {
      document.body.classList.add('light-mode');
    }
  }

  if (dashToggle) {
    dashToggle.addEventListener('click', () => {
      document.body.classList.toggle('light-mode');
      const isLight = document.body.classList.contains('light-mode');
      localStorage.setItem('os-odyssey-dash-theme', isLight ? 'light' : 'dark');
    });
  }

  /* ---- Navbar scroll shadow ---- */
  if (navbar) {
    window.addEventListener('scroll', () => {
      navbar.style.boxShadow = window.scrollY > 20 ? '0 4px 0 rgba(0,0,0,0.2)' : 'none';
    }, { passive: true });
  }

  function initMobileNav() {
    document.querySelectorAll('.navbar, .app-nav').forEach((nav, index) => {
      const menu = nav.querySelector('.nav-right, .app-nav-links');
      if (!menu || nav.querySelector('.mobile-nav-toggle, .app-nav-mobile-toggle')) return;

      const menuId = menu.id || `mobileNavMenu${index + 1}`;
      menu.id = menuId;

      const toggle = document.createElement('button');
      toggle.className = 'mobile-nav-toggle';
      toggle.type = 'button';
      toggle.setAttribute('aria-label', 'Open navigation menu');
      toggle.setAttribute('aria-controls', menuId);
      toggle.setAttribute('aria-expanded', 'false');
      toggle.innerHTML = '<span></span><span></span><span></span>';

      menu.before(toggle);

      toggle.addEventListener('click', () => {
        const isOpen = nav.classList.toggle('mobile-menu-open');
        toggle.setAttribute('aria-expanded', String(isOpen));
        toggle.setAttribute('aria-label', isOpen ? 'Close navigation menu' : 'Open navigation menu');
      });

      menu.addEventListener('click', (event) => {
        if (!event.target.closest('a, button')) return;
        nav.classList.remove('mobile-menu-open');
        toggle.setAttribute('aria-expanded', 'false');
        toggle.setAttribute('aria-label', 'Open navigation menu');
      });

      window.addEventListener('resize', () => {
        if (window.innerWidth > 768) {
          nav.classList.remove('mobile-menu-open');
          toggle.setAttribute('aria-expanded', 'false');
          toggle.setAttribute('aria-label', 'Open navigation menu');
        }
      });
    });
  }

  initMobileNav();

  /* ---- Scroll-triggered fade-in for module cards ---- */
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.style.opacity = '1';
        e.target.style.transform = 'translateY(0)';
        observer.unobserve(e.target);
      }
    });
  }, { threshold: 0.12 });

  document.querySelectorAll('.module-card').forEach((card, i) => {
    card.style.opacity = '0';
    card.style.transform = 'translateY(24px)';
    card.style.transition = `opacity 0.45s ease ${i * 0.08}s, transform 0.45s ease ${i * 0.08}s`;
    observer.observe(card);
  });

  /* ---- Snow particle effect over hero ---- */
  function spawnSnow() {
    const hero = document.querySelector('.hero');
    const dashboard = document.querySelector('.dashboard-shell');
    const profile = document.querySelector('.profile-shell');
    const simShell = document.querySelector('.sim-shell');
    const container = hero || dashboard || profile || simShell;
    if (!container) return;

    const style = document.createElement('style');
    style.textContent = `
      .flake {
        position: absolute;
        background: #fff;
        pointer-events: none;
        z-index: 6;
        image-rendering: pixelated;
        animation: fall linear infinite;
        border-radius: 0; /* pixel square flakes */
      }
      @keyframes fall {
        0%   { transform: translateY(-20px) translateX(0px); opacity: 0; }
        5%   { opacity: 1; }
        90%  { opacity: 0.8; }
        100% { transform: translateY(100vh) translateX(var(--drift)); opacity: 0; }
      }
    `;
    document.head.appendChild(style);

    /* Fewer, subtler flakes on the dashboard so they don't distract */
    const count = hero ? 35 : 22;
    const maxOpacity = hero ? 0.5 : 0.35;

    /* Dashboard needs position:relative so absolute flakes stay inside */
    if (!hero) container.style.position = 'relative';
    container.style.overflow = 'hidden';

    for (let i = 0; i < count; i++) {
      const f = document.createElement('div');
      const size = Math.random() > 0.6 ? 4 : 2;
      const drift = (Math.random() > 0.5 ? 1 : -1) * (10 + Math.random() * 20);
      f.className = 'flake';
      f.style.cssText = `
        width: ${size}px;
        height: ${size}px;
        left: ${Math.random() * 100}%;
        top: ${Math.random() * 50}%;
        opacity: ${maxOpacity + Math.random() * 0.5};
        animation-duration: ${4 + Math.random() * 6}s;
        animation-delay: ${Math.random() * 6}s;
        --drift: ${drift}px;
      `;
      container.appendChild(f);
    }
  }

  spawnSnow();

  /* ---- Module card click ripple ---- */
  document.querySelectorAll('.module-card').forEach(card => {
    card.addEventListener('click', e => {
      const ripple = document.createElement('span');
      const rect = card.getBoundingClientRect();
      ripple.style.cssText = `
        position: absolute;
        width: 8px; height: 8px;
        background: rgba(245,166,35,0.45);
        left: ${e.clientX - rect.left - 4}px;
        top:  ${e.clientY - rect.top - 4}px;
        pointer-events: none;
        z-index: 99;
        animation: ripple-out 0.55s ease forwards;
      `;
      card.style.position = 'relative';
      card.appendChild(ripple);
      setTimeout(() => ripple.remove(), 600);
    });
  });

  const rippleStyle = document.createElement('style');
  rippleStyle.textContent = `@keyframes ripple-out { to { transform: scale(32); opacity: 0; } }`;
  document.head.appendChild(rippleStyle);

  /* ---- Initialize session UI ---- */
  renderSessionUI();
  loadPlatformStats();

  /* ---- Course page: Live progress panel (right side) ---- */
  function renderCourseProgressPanel() {
    const panel = document.getElementById('courseProgressPanel');
    if (!panel) return;

    const MODULE_LABELS = {
      module1: { num: '1', title: 'Introduction to Operating Systems', color: '#22c55e' },
      module2: { num: '2', title: 'Operating-System Structures', color: '#3b82f6' },
      module3: { num: '3', title: 'Processes', icon: '⚙️', color: '#f59e0b' },
      module4: { num: '4', title: 'Threads', icon: '🧵', color: '#e879f9' }
    };

    const completedModules = (activeProfile && activeProfile.completed_modules) ? activeProfile.completed_modules : [];
    const totalModules = MODULE_META.length;
    const completedCount = completedModules.length;
    const overallPct = Math.round((completedCount / totalModules) * 100);

    let html = `
      <div class="progress-panel-header">
        <span class="progress-panel-title">Your Progress</span>
        <span class="progress-panel-overall">${overallPct}% Complete</span>
      </div>
      <div class="progress-panel-bar-wrap">
        <div class="progress-panel-bar" style="width: ${overallPct}%"></div>
      </div>
      <div class="progress-panel-stats-row">
        <div class="progress-stat-mini">
          <span class="progress-stat-num">${completedCount}</span>
          <span class="progress-stat-label">Modules Done</span>
        </div>
        <div class="progress-stat-mini">
          <span class="progress-stat-num">${totalModules}</span>
          <span class="progress-stat-label">Total Modules</span>
        </div>
        <div class="progress-stat-mini">
          <span class="progress-stat-num">${getTotalTopics()}</span>
          <span class="progress-stat-label">Total Topics</span>
        </div>
      </div>
    `;

    MODULE_META.forEach(meta => {
      const label = MODULE_LABELS[meta.id] || { num: '?', title: meta.id, color: '#94a3b8' };
      const isDone = completedModules.includes(meta.id);
      const unlocked = isModuleUnlocked(meta.id);
      const statusClass = isDone ? 'completed' : (unlocked ? 'in-progress' : 'locked');
      const statusText = isDone ? '✓ Completed' : (unlocked ? 'In Progress' : '🔒 Locked');
      const statusColor = isDone ? '#16a34a' : (unlocked ? '#f59e0b' : '#64748b');
      const topicPct = isDone ? 100 : (unlocked ? 15 : 0);

      html += `
        <button class="progress-module-row ${statusClass}" type="button" data-start-module="${meta.id}" ${unlocked ? '' : 'disabled'}>

          <span class="progress-module-info">
            <strong>Module ${label.num}</strong>
            <em>${label.title}</em>
            <span class="progress-module-bar-wrap">
              <span class="progress-module-bar" style="width: ${topicPct}%; background: ${unlocked ? label.color : '#475569'}"></span>
            </span>
          </span>
          <span class="progress-module-status" style="color: ${statusColor}">${statusText}</span>
        </button>
      `;
    });

    panel.innerHTML = html;
  }

  renderCourseProgressPanel();

  /* ---- Typewriter animation for welcome speech bubble ---- */
  function startTypewriter() {
    const textEl = document.getElementById('typewriterText');
    const cursorEl = document.getElementById('typewriterCursor');
    if (!textEl || !cursorEl) return;
    const fullText = textEl.getAttribute('data-full-text') || '';
    if (!fullText) return;

    /* -- Typing sound effect -- */
    const typingSound = new Audio('../../assets/Keyboard typing Sound Effects.mp3');
    typingSound.loop = true;
    typingSound.volume = 0.45;

    let i = 0;
    textEl.textContent = '';

    /** Smoothly fade out the typing sound then pause it */
    function fadeOutSound() {
      const fadeStep = 0.05;
      const fadeInterval = setInterval(() => {
        if (typingSound.volume > fadeStep) {
          typingSound.volume = Math.max(0, typingSound.volume - fadeStep);
        } else {
          typingSound.volume = 0;
          typingSound.pause();
          typingSound.currentTime = 0;
          clearInterval(fadeInterval);
        }
      }, 40);
    }

    /** Pause sound on punctuation pauses and resume before next char */
    function pauseSound() { typingSound.pause(); }
    function resumeSound() {
      typingSound.volume = 0.45;
      typingSound.play().catch(() => { });
    }

    function typeChar() {
      if (i < fullText.length) {
        textEl.textContent += fullText.charAt(i);
        const ch = fullText.charAt(i);
        i++;

        // Variable speed: pause longer on punctuation for natural rhythm
        let delay = 38;
        if (ch === '.' || ch === '!' || ch === '?') {
          delay = 320;
          pauseSound();
          setTimeout(() => { resumeSound(); typeChar(); }, delay);
          return;
        } else if (ch === ',') {
          delay = 180;
          pauseSound();
          setTimeout(() => { resumeSound(); typeChar(); }, delay);
          return;
        } else if (ch === ' ') {
          delay = 55;
        }

        setTimeout(typeChar, delay);
      } else {
        // Typing done — fade out sound and hide cursor
        fadeOutSound();
        setTimeout(() => {
          cursorEl.classList.add('hidden');
        }, 1800);
      }
    }

    // Small initial delay before typing starts
    setTimeout(() => {
      typingSound.play().catch(() => { });
      typeChar();
    }, 500);
  }

  /* startTypewriter() is now called from renderSessionUI after profile loads */

  /* ---- Auth form (signup + login) — Supabase Auth ---- */
  const authSubmit = document.querySelector('.auth-submit');
  if (authSubmit) {
    authSubmit.addEventListener('click', async (e) => {
      e.preventDefault();

      const emailInput = document.querySelector('.auth-input[type="email"]');
      const passwordInput = document.querySelector('.auth-input[type="password"]');
      const email = emailInput ? emailInput.value.trim().toLowerCase() : '';
      const password = passwordInput ? passwordInput.value : '';
      const mode = authSubmit.dataset.authMode || 'signup';
      const termsAccepted = document.getElementById('termsAccepted');

      if (mode === 'signup' && termsAccepted && !termsAccepted.checked) {
        showAuthError('Please accept the Terms of Use before creating an account.');
        termsAccepted.closest('.auth-terms-check')?.animate(
          [
            { transform: 'translateX(0)' },
            { transform: 'translateX(-6px)' },
            { transform: 'translateX(6px)' },
            { transform: 'translateX(0)' }
          ],
          { duration: 300, easing: 'ease' }
        );
        return;
      }

      // Validate inputs
      const inputs = document.querySelectorAll('.auth-input');
      let valid = true;

      const shakeStyle = document.createElement('style');
      shakeStyle.textContent = `
        @keyframes shake {
          0%,100% { transform: translateX(0); }
          25%      { transform: translateX(-6px); }
          75%      { transform: translateX(6px); }
        }
      `;
      document.head.appendChild(shakeStyle);

      inputs.forEach(inp => {
        if (!inp.value.trim()) {
          valid = false;
          inp.style.borderColor = '#ef4444';
          inp.style.animation = 'shake 0.3s ease';
          setTimeout(() => { inp.style.animation = ''; inp.style.borderColor = ''; }, 400);
        }
      });

      if (!valid) {
        showAuthError('Please fill in all fields.');
        return;
      }

      if (password.length < 6) {
        showAuthError('Password must be at least 6 characters.');
        return;
      }

      // ── Cloudflare Turnstile verification ──
      const turnstileWidget = document.querySelector('.cf-turnstile');
      let turnstileToken = null;
      if (turnstileWidget && typeof turnstile !== 'undefined') {
        turnstileToken = turnstile.getResponse(turnstileWidget);
        if (!turnstileToken) {
          showAuthError('Please complete the security check.');
          return;
        }
      }

      // Show loading state
      const defaultText = authSubmit.textContent;
      authSubmit.textContent = authSubmit.dataset.loadingText || 'Submitting...';
      authSubmit.disabled = true;

      try {
        let result;

        if (mode === 'signup') {
          result = await supa.auth.signUp({ email, password });
        } else {
          result = await supa.auth.signInWithPassword({ email, password });
        }

        if (result.error) {
          showAuthError(result.error.message);
          authSubmit.textContent = defaultText;
          authSubmit.disabled = false;
          // Reset Turnstile widget so user can retry
          if (turnstileWidget && typeof turnstile !== 'undefined') {
            turnstile.reset(turnstileWidget);
          }
          return;
        }

        // Handle signup with email confirmation required
        if (mode === 'signup' && result.data?.user && !result.data?.session) {
          showAuthSuccess('Check your email! Click the confirmation link to activate your account.');
          authSubmit.textContent = defaultText;
          authSubmit.disabled = false;
          if (turnstileWidget && typeof turnstile !== 'undefined') {
            turnstile.reset(turnstileWidget);
          }
          return;
        }

        // Redirect on success (login, or signup without confirmation)
        if (authSubmit.dataset.redirect) {
          window.location.href = authSubmit.dataset.redirect;
        }
      } catch (err) {
        console.error('Auth error:', err);
        showAuthError(err.message || 'Something went wrong. Please try again.');
        authSubmit.textContent = defaultText;
        authSubmit.disabled = false;
        // Reset Turnstile widget so user can retry
        if (turnstileWidget && typeof turnstile !== 'undefined') {
          turnstile.reset(turnstileWidget);
        }
      }
    });
  }

  function isRecentlyCreatedUser(user) {
    if (!user?.created_at) return false;

    const createdAt = new Date(user.created_at).getTime();
    if (Number.isNaN(createdAt)) return false;

    return Date.now() - createdAt < 120000;
  }

  /* ---- Handle auth callback (Google OAuth) ---- */
  // Google signup stays on character-select. Google login either moves a
  // known user to the dashboard or rejects an account that OAuth just created.
  supa.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' && session) {
      const path = window.location.pathname;
      const isCharacterPage = path.includes('character-select');
      const googleAuthMode = sessionStorage.getItem(GOOGLE_AUTH_MODE_KEY);

      if (!isCharacterPage || !googleAuthMode) {
        return;
      }

      sessionStorage.removeItem(GOOGLE_AUTH_MODE_KEY);

      let profile = null;
      if (googleAuthMode === 'login') {
        const { data } = await supa
          .from('profiles')
          .select('character')
          .eq('id', session.user.id)
          .single();
        profile = data;
      }

      const needsSignup = profile?.character === SIGNUP_REQUIRED_CHARACTER;
      const justCreatedByGoogleLogin = googleAuthMode === 'login' && isRecentlyCreatedUser(session.user);

      if (justCreatedByGoogleLogin) {
        await supa
          .from('profiles')
          .update({
            character: SIGNUP_REQUIRED_CHARACTER,
            avatar: DEFAULT_AVATAR
          })
          .eq('id', session.user.id);
      }

      if (googleAuthMode === 'login' && (needsSignup || justCreatedByGoogleLogin)) {
        await supa.auth.signOut();
        sessionStorage.setItem(
          AUTH_MESSAGE_KEY,
          'Please sign up first. Your account is not signed up yet.'
        );
        window.location.href = 'login.html';
        return;
      }

      if (googleAuthMode === 'login') {
        window.location.href = 'dashboard.html';
        return;
      } else if (googleAuthMode === 'signup') {
        return;
      }
    }
  });

  /* ---- Google OAuth ---- */
  document.querySelectorAll('.btn-google').forEach(btn => {
    btn.addEventListener('click', async () => {
      const termsAccepted = document.getElementById('termsAccepted');
      if (termsAccepted && !termsAccepted.checked) {
        showAuthError('Please accept the Terms of Use before creating an account.');
        termsAccepted.closest('.auth-terms-check')?.animate(
          [
            { transform: 'translateX(0)' },
            { transform: 'translateX(-6px)' },
            { transform: 'translateX(6px)' },
            { transform: 'translateX(0)' }
          ],
          { duration: 300, easing: 'ease' }
        );
        return;
      }

      // Show loading state on the button
      const originalContent = btn.innerHTML;
      btn.innerHTML = '<img src="https://www.svgrepo.com/show/475656/google-color.svg" width="20" alt="Google" /> Connecting...';
      btn.disabled = true;
      btn.style.opacity = '0.7';

      try {
        const authMode = btn.id === 'googleLoginBtn' ? 'login' : 'signup';
        sessionStorage.setItem(GOOGLE_AUTH_MODE_KEY, authMode);

        const { error } = await supa.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo: window.location.origin + '/os-odyssey/frontend/html/character-select.html'
          }
        });
        if (error) {
          sessionStorage.removeItem(GOOGLE_AUTH_MODE_KEY);
          showAuthError(error.message);
          btn.innerHTML = originalContent;
          btn.disabled = false;
          btn.style.opacity = '';
        }
        // If no error, the browser will redirect to Google — no need to reset button
      } catch (err) {
        sessionStorage.removeItem(GOOGLE_AUTH_MODE_KEY);
        showAuthError('Failed to connect to Google. Please try again.');
        btn.innerHTML = originalContent;
        btn.disabled = false;
        btn.style.opacity = '';
      }
    });
  });

  /* ---- Character selection ---- */
  const characterCards = document.querySelectorAll('.character-card');
  const characterContinue = document.getElementById('characterContinue');

  let selectedCharacter = {
    name: DEFAULT_CHARACTER,
    avatar: DEFAULT_AVATAR
  };

  // Try to load current user's character (async, best-effort for initial selection)
  (async () => {
    const user = await getCurrentUser();
    if (user) {
      const savedCharacter = user.character === SIGNUP_REQUIRED_CHARACTER ? DEFAULT_CHARACTER : user.character;
      selectedCharacter = {
        name: savedCharacter || DEFAULT_CHARACTER,
        avatar: user.avatar || DEFAULT_AVATAR
      };

      // Highlight the matching card
      characterCards.forEach(card => {
        if (card.dataset.character === selectedCharacter.name) {
          selectCharacter(card);
        }
      });
    }
  })();

  function selectCharacter(card) {
    characterCards.forEach(c => c.classList.remove('selected'));
    card.classList.add('selected');
    selectedCharacter = {
      name: card.dataset.character,
      avatar: card.dataset.avatar
    };
  }

  characterCards.forEach(card => {
    card.addEventListener('click', () => selectCharacter(card));
  });

  if (characterContinue) {
    characterContinue.addEventListener('click', async (e) => {
      e.preventDefault();
      characterContinue.textContent = 'Saving...';
      characterContinue.style.pointerEvents = 'none';

      // Save character choice to Supabase database
      const updated = await updateUserProfile({
        character: selectedCharacter.name,
        avatar: selectedCharacter.avatar
      });

      if (!updated) {
        characterContinue.textContent = 'Enter Dashboard';
        characterContinue.style.pointerEvents = '';
        showAuthError('Failed to save character. Please try again.');
        return;
      }

      window.location.href = 'dashboard.html';
    });
  }

  /* ---- Module focus-mode lessons ---- */
  const moduleOverlay = document.querySelector('[data-module-overlay]');

  // Module content data — declared outside the overlay guard so profile.js
  // can always read it (even on pages without the overlay element).
  const modules = {
    module1: {
      number: 'Module 1',
      title: 'Introduction to Operating Systems',
      summary: 'Nice work finishing Module 1. You practiced kernels, dual-mode operation, and caching.',
      review: [
        {
          title: 'What is an Operating System?',
          body: 'An Operating System (OS) is a program that acts as an intermediary between the user and the computer hardware. Its main goals are to make the computer easy to use, execute user programs efficiently, and manage hardware resources effectively. The OS is often described as "the one program running at all times" - this core component is called the <strong>kernel</strong>.'
        },
        {
          title: 'Computer System Structure',
          body: 'A computer system is made up of four key components: <strong>Hardware</strong> (CPU, memory, I/O devices), the <strong>Operating System</strong> (coordinates hardware use), <strong>Application Programs</strong> (define how resources solve user problems), and <strong>Users</strong> (people, machines, or other computers). The OS sits between hardware and applications, acting as both a resource allocator and a control program.'
        },
        {
          title: 'Interrupts & Computer Startup',
          body: 'When you power on a computer, a <strong>bootstrap program</strong> stored in ROM/EPROM (firmware) initializes the system and loads the OS kernel. Once running, the OS is <strong>interrupt-driven</strong>: hardware devices signal the CPU using interrupts when they finish a task. Each interrupt routes to an <strong>interrupt service routine</strong> via an interrupt vector, allowing the CPU to respond to events efficiently.'
        },
        {
          title: 'Storage Hierarchy & Caching',
          body: 'Computer storage is organized in a hierarchy from fastest/most expensive (registers, cache) to slowest/cheapest (magnetic tape). <strong>Main memory</strong> is the only storage the CPU can access directly, but it is volatile (data lost on power off). <strong>Secondary storage</strong> (hard disks, SSDs) provides large, nonvolatile capacity. <strong>Caching</strong> speeds access by temporarily copying frequently used data into faster storage - cache management involves choosing the right size and replacement policy.'
        },
        {
          title: 'Processes, Dual-Mode & OS Operations',
          body: 'A <strong>process</strong> is a program in execution - an active entity that needs CPU, memory, I/O, and data. The OS manages many processes concurrently through <strong>multiprogramming</strong> (keeping the CPU busy) and <strong>timesharing</strong> (frequent switching for interactive response under 1 second). To protect itself and the system, the OS uses <strong>dual-mode operation</strong>: <strong>user mode</strong> for regular programs and <strong>kernel mode</strong> for privileged OS instructions. A <strong>system call</strong> switches the CPU from user to kernel mode.'
        }
      ],
      quizType: 'multiple-choice',
      quiz: [
        {
          question: 'What is the primary role of the kernel in an operating system?',
          options: [
            'To provide the user interface and manage application windows',
            'To act as the one program running at all times, managing hardware resources',
            'To store permanent data in secondary storage',
            'To execute application programs directly without hardware involvement'
          ],
          answer: 1,
          explanation: 'The kernel is the core of the OS - it runs continuously, manages hardware resources, and handles system calls from user programs.'
        },
        {
          question: 'Which of the following best describes dual-mode operation in an OS?',
          options: [
            'Running two operating systems side by side on the same hardware',
            'Using two CPUs to process instructions simultaneously',
            'Switching between user mode and kernel mode to protect system resources',
            'Dividing memory into two halves for user and OS data'
          ],
          answer: 2,
          explanation: 'Dual-mode operation uses a hardware mode bit to distinguish between user mode and kernel mode, protecting OS resources from regular programs.'
        },
        {
          question: "What is the purpose of caching in a computer system's storage hierarchy?",
          options: [
            'To permanently store data when the computer is turned off',
            'To temporarily copy frequently used data into faster storage to improve performance',
            'To protect sensitive data from unauthorized access',
            'To increase the total capacity of secondary storage'
          ],
          answer: 1,
          explanation: 'Caching places data in faster storage so the system can access it quickly without repeatedly reading from slower storage.'
        }
      ]
    },
    module2: {
      number: 'Module 2',
      title: 'Operating-System Structures',
      summary: 'Module 2 is all about how operating systems expose services and organize their internals.',
      review: [
        {
          title: 'Operating System Services',
          body: 'An OS provides services to programs and users, including a <strong>user interface</strong> (CLI, GUI, or touchscreen), <strong>program execution</strong> (loading and running programs), <strong>I/O operations</strong>, <strong>file-system manipulation</strong>, and <strong>inter-process communications</strong> via shared memory or message passing. It also handles <strong>error detection</strong> to keep the system stable, and provides <strong>resource allocation</strong>, <strong>accounting</strong>, and <strong>protection and security</strong> to ensure fair and safe resource sharing.'
        },
        {
          title: 'System Calls',
          body: 'A <strong>system call</strong> is a programming interface that lets user programs request services from the OS kernel. They are typically written in C or C++ and accessed through a high-level <strong>API</strong>, such as <strong>Win32</strong>, <strong>POSIX</strong>, or the <strong>Java API</strong>. Each system call has an associated number, and the <strong>system-call interface</strong> uses a table indexed by those numbers to route calls into the kernel.'
        },
        {
          title: 'Types of System Calls',
          body: 'System calls are grouped into six categories: <strong>Process control</strong> (create, terminate, allocate memory), <strong>File management</strong> (create, open, read, write), <strong>Device management</strong> (request, release, read/write devices), <strong>Information maintenance</strong> (get/set time and system data), <strong>Communications</strong> (message passing or shared memory), and <strong>Protection</strong> (get/set permissions, control access). These categories cover nearly every service the OS exposes to user programs.'
        },
        {
          title: 'OS Design: Policy vs. Mechanism & Structure Types',
          body: 'A critical OS design principle is separating <strong>Policy</strong> ("what will be done?") from <strong>Mechanism</strong> ("how to do it?") - this separation allows policy decisions to change without rewriting core mechanisms. OSes can be structured in several ways: <strong>Simple</strong> (MS-DOS, not modular), <strong>Monolithic</strong> (UNIX, large single-level kernel), <strong>Layered</strong> (each layer builds on lower layers), <strong>Microkernel</strong> (most functions in user space, communication via message passing), <strong>Modular</strong> (loadable kernel modules), or <strong>Hybrid</strong> (combining approaches, like Mac OS X using Mach + BSD + I/O kit).'
        },
        {
          title: 'System Boot & Debugging',
          body: 'When a computer powers on, a <strong>bootstrap loader</strong> stored in ROM or EEPROM locates the OS kernel, loads it into memory, and starts execution. <strong>GRUB</strong> is a widely used bootstrap loader that supports selecting from multiple kernels. For debugging, the OS generates <strong>log files</strong>, <strong>core dumps</strong> on app failure, and <strong>crash dumps</strong> on OS failure. <strong>DTrace</strong> provides live instrumentation on production systems, and <strong>profiling</strong> periodically samples the instruction pointer to identify performance bottlenecks.'
        }
      ],
      quizType: 'fill-blank',
      quiz: [
        {
          prompt: 'Complete the sentence:',
          sentence: '"A ________ is a programming interface to the services provided by the OS, typically accessed through a high-level API rather than direct use."',
          answers: ['system call', 'system calls'],
          precise: 'system call',
          reinforcement: 'System calls are the formal bridge between user programs and OS kernel services, keeping user programs from directly accessing hardware.'
        },
        {
          prompt: 'Complete the sentence:',
          sentence: '"The OS design principle that separates what will be done from how to do it is called separating ________ from Mechanism."',
          answers: ['policy'],
          precise: 'Policy',
          reinforcement: 'Separating policy from mechanism lets the OS change what it does without rewriting how it does it, making the system more flexible.'
        },
        {
          prompt: 'Complete the sentence:',
          sentence: '"A ________ OS structure moves most services out of the kernel and into user space, using message passing for communication - making the OS easier to extend, port, and keep secure."',
          answers: ['microkernel', 'micro kernel'],
          precise: 'Microkernel',
          reinforcement: 'Microkernels, such as Mach, trade some performance overhead for easier extension, portability, and reliability.'
        }
      ]
    },
    module3: {
      number: 'Module 3',
      title: 'Processes',
      summary: 'Processes are the heart of OS execution: states, scheduling, context switching, creation, termination, IPC, and client-server communication all meet here.',
      review: [
        {
          title: 'What is a Process?',
          body: 'A <strong>process</strong> is a program in execution - it is an active entity, unlike a program which is a passive file sitting on disk. A process consists of the <strong>text section</strong> (executable code), the <strong>program counter</strong> and CPU registers, the <strong>stack</strong> (function parameters, return addresses, local variables), the <strong>data section</strong> (global variables), and the <strong>heap</strong> (memory dynamically allocated at runtime). One program can become many processes, such as multiple users running the same application simultaneously.'
        },
        {
          title: 'Process vs. Program',
          body: 'A <strong>program</strong> is a passive entity - an executable file stored on disk. A <strong>process</strong> is active because it is a program that has been loaded into memory and is executing. The transition happens when an executable is launched through a GUI, command line, or another process. A single program can create multiple processes because each instance receives its own memory space, stack, and execution state.'
        },
        {
          title: 'The Five Process States',
          body: 'As a process executes, it moves through five states. <strong>New</strong> means the process is being created, <strong>Ready</strong> means it is waiting for CPU time, <strong>Running</strong> means its instructions are executing, <strong>Waiting</strong> means it is paused for an event such as I/O completion, and <strong>Terminated</strong> means it has finished execution. A process can only be <strong>running</strong> on one CPU core at a time.'
        },
        {
          title: 'Process Control Block (PCB)',
          body: 'Every process is represented in the OS by a <strong>Process Control Block (PCB)</strong>, also called a <strong>task control block</strong>. The PCB stores the <strong>process state</strong>, <strong>program counter</strong>, <strong>CPU registers</strong>, <strong>CPU scheduling information</strong>, <strong>memory-management information</strong>, <strong>accounting information</strong>, and <strong>I/O status</strong>. When a process pauses, its CPU register values are saved into the PCB so it can resume exactly where it left off.'
        },
        {
          title: 'Process Scheduling Queues',
          body: 'The <strong>process scheduler</strong> selects which process runs next on the CPU to maximize CPU utilization. It manages the <strong>job queue</strong> (all processes), the <strong>ready queue</strong> (processes in memory ready for the CPU), and <strong>device queues</strong> (processes waiting for I/O). Processes migrate among these queues, such as moving from running to a device queue during I/O and back to the ready queue when I/O completes.'
        },
        {
          title: 'Short-Term, Long-Term & Medium-Term Schedulers',
          body: 'The <strong>short-term scheduler</strong>, or CPU scheduler, chooses which ready process gets the CPU next and runs very frequently. The <strong>long-term scheduler</strong>, or job scheduler, admits processes from disk into the ready queue, runs infrequently, and controls the <strong>degree of multiprogramming</strong>. It balances <strong>I/O-bound processes</strong> with <strong>CPU-bound processes</strong>. The <strong>medium-term scheduler</strong> handles <strong>swapping</strong>, temporarily removing processes from memory to disk and restoring them later.'
        },
        {
          title: 'Context Switch',
          body: 'A <strong>context switch</strong> occurs when the CPU switches from one process to another. The OS saves the state of the current process into its <strong>PCB</strong>, then loads the saved state of the next process from its PCB. Context-switch time is pure <strong>overhead</strong> because no useful computation happens during the switch. The duration depends on hardware support, and some systems speed it up with multiple register sets.'
        },
        {
          title: 'Process Creation',
          body: 'A <strong>parent process</strong> creates <strong>child processes</strong>, forming a <strong>tree of processes</strong> identified by <strong>PIDs</strong>. In UNIX/Linux, <strong>fork()</strong> creates a new child as a duplicate of the parent, and <strong>exec()</strong> replaces the child memory space with a new program. The parent may use <strong>wait()</strong> or continue executing concurrently. Resource sharing options include sharing all resources, a subset, or none.'
        },
        {
          title: 'Process Termination',
          body: 'A process ends by calling <strong>exit()</strong>, which returns a status value to its parent through <strong>wait()</strong>. A parent can force a child to terminate using <strong>abort()</strong>, and <strong>cascading termination</strong> means a parent exit can terminate all children and grandchildren. A <strong>zombie</strong> process has exited but its parent has not called wait() yet. An <strong>orphan</strong> process has a parent that terminated without calling wait().'
        },
        {
          title: 'Interprocess Communication (IPC)',
          body: '<strong>Cooperating processes</strong> need <strong>IPC</strong> to share information or coordinate work. Cooperation supports information sharing, computation speedup, modularity, and convenience. The two fundamental IPC models are <strong>Shared Memory</strong>, which is fast but requires synchronization, and <strong>Message Passing</strong>, which uses OS-managed send and receive calls without shared variables.'
        },
        {
          title: 'The Producer-Consumer Problem',
          body: 'The <strong>Producer-Consumer Problem</strong> is a classic IPC pattern where a <strong>producer</strong> creates data and a <strong>consumer</strong> uses it. In a <strong>bounded-buffer</strong> solution, a shared circular array of size <strong>BUFFER_SIZE</strong> is used. The producer writes at <strong>in</strong>, the consumer reads at <strong>out</strong>, the buffer is full when <code>(in + 1) % BUFFER_SIZE == out</code>, and it is empty when <code>in == out</code>. Because of this design, only <strong>BUFFER_SIZE - 1</strong> elements can be stored at once.'
        },
        {
          title: 'Bounded-Buffer Code: Producer & Consumer',
          body: 'The <strong>producer</strong> waits while the buffer is full, places the item at <code>buffer[in]</code>, then advances <code>in</code> with <code>in = (in + 1) % BUFFER_SIZE</code>. The <strong>consumer</strong> waits while the buffer is empty, retrieves <code>buffer[out]</code>, then advances <code>out</code> with <code>out = (out + 1) % BUFFER_SIZE</code>. The modulo <strong>%</strong> operator wraps both indexes around the circular buffer. This is a shared-memory IPC solution because both processes access the same buffer array directly.'
        },
        {
          title: 'Message Passing: Direct vs. Indirect',
          body: 'In <strong>direct communication</strong>, processes name each other explicitly, such as <code>send(P, message)</code> and <code>receive(Q, message)</code>. Each pair of processes has exactly one automatic link. In <strong>indirect communication</strong>, messages go through <strong>mailboxes</strong>, also called <strong>ports</strong>, each with a unique ID. Multiple processes can share a mailbox, and mailbox operations include create, send, receive, and destroy.'
        },
        {
          title: 'Synchronization & Buffering in Message Passing',
          body: 'Message passing can be <strong>blocking (synchronous)</strong> or <strong>non-blocking (asynchronous)</strong>. A <strong>blocking send</strong> waits until the receiver gets the message, while a <strong>blocking receive</strong> waits until a message is available; if both block, it is a <strong>rendezvous</strong>. A <strong>non-blocking send</strong> continues immediately, and a <strong>non-blocking receive</strong> returns a message or null. Link buffers may have <strong>zero capacity</strong>, <strong>bounded capacity</strong>, or <strong>unbounded capacity</strong>.'
        },
        {
          title: 'Client-Server Communication',
          body: 'Client-server communication uses mechanisms such as <strong>Sockets</strong>, <strong>RPC</strong>, <strong>Pipes</strong>, and <strong>RMI</strong>. A socket is an IP address plus port endpoint, ports below 1024 are well-known services, and <strong>127.0.0.1</strong> is loopback. <strong>RPC</strong> uses client and server <strong>stubs</strong> to marshal and unmarshal parameters, often with <strong>XDR</strong> for cross-architecture data. <strong>Ordinary pipes</strong> are unidirectional and require parent-child processes, while <strong>named pipes</strong> are bidirectional and do not require that relationship.'
        }
      ],
      quiz: [
        {
          type: 'fill-blank',
          prompt: 'Complete the sentence:',
          sentence: '"A process is represented in the operating system by a data structure called the ________, which stores the process state, program counter, CPU registers, and scheduling information."',
          answers: ['process control block', 'pcb', 'task control block'],
          precise: 'Process Control Block',
          reinforcement: "The PCB is the OS's complete snapshot of a process - without it, context switching would be impossible."
        },
        {
          type: 'fill-blank',
          prompt: 'Complete the sentence:',
          sentence: '"In UNIX, a parent process uses the ________ system call to create a new child process, and then optionally uses exec() to load a new program into the child memory space."',
          answers: ['fork', 'fork()'],
          precise: 'fork()',
          reinforcement: "fork() duplicates the parent's address space; the child gets a copy of the parent's data, stack, and heap, but has its own PID."
        },
        {
          type: 'multiple-choice',
          question: 'Which process state describes a process that is waiting for I/O to complete before it can continue?',
          options: ['Ready', 'Running', 'Waiting', 'Terminated'],
          answer: 2,
          correctLabel: 'C - Waiting',
          explanation: 'A process moves to the Waiting state when it needs an external event, such as disk I/O or a signal, and cannot use the CPU until that event occurs.'
        },
        {
          type: 'fill-blank',
          prompt: 'Complete the sentence:',
          sentence: '"A child process that has finished execution but whose parent has not yet called wait() is known as a ________ process."',
          answers: ['zombie'],
          precise: 'zombie',
          reinforcement: 'A zombie process keeps its PCB entry in the process table until the parent collects its exit status via wait().'
        },
        {
          type: 'multiple-choice',
          question: 'In the bounded-buffer Producer-Consumer problem, what condition tells the producer that the buffer is full and it must wait?',
          options: ['in == out', '(out + 1) % BUFFER_SIZE == in', '(in + 1) % BUFFER_SIZE == out', 'in == BUFFER_SIZE'],
          answer: 2,
          correctLabel: 'C - (in + 1) % BUFFER_SIZE == out',
          explanation: 'This circular check means the next slot the producer would write to is currently blocked by the consumer position, so only BUFFER_SIZE - 1 elements can be stored.'
        },
        {
          type: 'multiple-choice',
          question: 'Which type of message-passing buffering requires the sender to always wait until the receiver is ready to accept the message?',
          options: ['Unbounded capacity', 'Bounded capacity', 'Zero capacity', 'Variable capacity'],
          answer: 2,
          correctLabel: 'C - Zero capacity',
          explanation: 'With zero capacity, the link holds no queued messages, so the sender must block until the receiver calls receive().'
        },
        {
          type: 'fill-blank',
          prompt: 'Complete the sentence:',
          sentence: '"The ________ scheduler controls the degree of multiprogramming by deciding which processes are admitted from disk into the ready queue, and it runs infrequently - typically every few seconds or minutes."',
          answers: ['long term', 'long-term', 'job scheduler', 'long term scheduler', 'long-term scheduler'],
          precise: 'long-term scheduler',
          reinforcement: "The long-term scheduler makes slower, deliberate decisions about balancing I/O-bound and CPU-bound processes."
        },
        {
          type: 'fill-blank',
          prompt: 'Complete the sentence:',
          sentence: '"In indirect IPC communication, messages are sent to and received from a ________, which is a shared object with a unique ID that multiple processes can access."',
          answers: ['mailbox', 'port', 'mailbox port', 'mailbox/port'],
          precise: 'mailbox',
          reinforcement: 'Mailboxes decouple senders and receivers because processes only need the shared mailbox ID.'
        },
        {
          type: 'multiple-choice',
          question: 'What is the key difference between an ordinary pipe and a named pipe?',
          options: [
            'Ordinary pipes are bidirectional; named pipes are unidirectional',
            'Named pipes require a parent-child relationship; ordinary pipes do not',
            'Ordinary pipes require a parent-child relationship and are unidirectional; named pipes do not require this relationship and are bidirectional',
            'Named pipes can only be used on Windows systems'
          ],
          answer: 2,
          correctLabel: 'C',
          explanation: 'Named pipes are more general because unrelated processes can communicate through them bidirectionally.'
        },
        {
          type: 'multiple-choice',
          coding: true,
          question: 'Study the bounded-buffer Consumer code. Which syntax correctly advances the out pointer in a circular buffer of size BUFFER_SIZE?',
          code: 'item next_consumed;\\n\\nwhile (true) {\\n    while (in == out)\\n        ; /* do nothing - buffer is empty */\\n\\n    next_consumed = buffer[out];\\n    out = ________;           // <-- FILL THIS IN\\n\\n    /* consume the item in next_consumed */\\n}',
          options: ['out + 1', '(out + 1) % BUFFER_SIZE', '(out % BUFFER_SIZE) + 1', 'out % (BUFFER_SIZE + 1)'],
          answer: 1,
          correctLabel: 'B - (out + 1) % BUFFER_SIZE',
          explanation: 'The modulo operator % makes the buffer circular. Option A has no wrap-around, option C can reach BUFFER_SIZE and go out of bounds, and option D uses the wrong modulus.'
        }
      ]
    },
    module4: {
      number: 'Module 4',
      title: 'Threads',
      summary: 'Threads combine OS theory with practical APIs: models, parallelism, cancellation, TLS, and real threading code all meet here.',
      intro: '<div class="lesson-banner"><h3>📘 <strong>Module 4: Threads - Review Phase</strong></h3><p>This review has <strong>25 statements</strong> in two sections:</p><p><strong>Section A (Statements 1-20):</strong> Core Concepts</p><p><strong>Section B (Statements 21-25):</strong> Coding - How Threading Works in Practice</p><p>Press <strong>[Next]</strong> to begin!</p></div>',
      quizIntro: '<div class="lesson-banner"><h3>📝 <strong>Quiz Phase - Module 4: Threads</strong></h3><p><strong>Section A (Questions 1-10):</strong> Concept Questions</p><p><strong>Section B (Questions 11-15):</strong> Coding Questions</p><p>Good luck!</p></div>',
      reviewTransitionIndex: 20,
      reviewTransition: '<div class="lesson-banner"><h3>🖥️ <strong>Entering Section B: Coding Statements (21-25)</strong></h3><p>Now we shift focus to how threading actually works in code. Pay close attention to syntax and structure!</p></div>',
      questionTransitionIndex: 10,
      questionTransition: '<div class="lesson-banner"><h3>🖥️ <strong>Entering Section B: Coding Questions (11-15)</strong></h3><p>Read each code snippet carefully before choosing your answer!</p></div>',
      review: [
        { section: 'concepts', title: 'What is a Thread?', body: 'A <strong>thread</strong> is the fundamental unit of CPU utilization and the backbone of multithreaded computing. Each thread has its own <strong>thread ID</strong>, <strong>program counter</strong>, <strong>register set</strong>, and <strong>stack</strong> - the components needed to independently track and execute instructions. What makes threads powerful is that multiple threads within the same process <strong>share</strong> the process code section, data section, and OS resources such as open files and signals. This sharing makes threads far more lightweight than full processes, so creating or switching between threads is cheaper than doing the same with processes.' },
        { section: 'concepts', title: 'Why Use Threads?', body: 'Most modern applications are <strong>multithreaded</strong> by design. A web browser can render a page, download images, run JavaScript, and handle user input at the same time by using separate threads. A word processor can run spell-checking in the background while the user continues typing. <strong>Thread creation is lightweight</strong> compared to spawning a new process, which means applications can spin up useful parallel work without major system overhead. Even OS kernels are themselves multithreaded.' },
        { section: 'concepts', title: 'The Four Benefits of Multithreading', body: 'Multithreading offers four key benefits. <strong>Responsiveness</strong> keeps an application alive even if one thread blocks on I/O. <strong>Resource Sharing</strong> lets threads naturally share process memory and resources, reducing the need for complex IPC. <strong>Economy</strong> means thread creation and thread context switching are cheaper than process operations. <strong>Scalability</strong> lets applications exploit multiprocessor and multicore hardware by running threads truly in parallel.' },
        { section: 'concepts', title: 'Challenges of Multicore Programming', body: 'Writing correct multithreaded code for multicore systems introduces several challenges. <strong>Dividing activities</strong> means identifying work that can run independently, while <strong>balance</strong> ensures each thread gets roughly equal work. <strong>Data splitting</strong> partitions data so threads do not conflict. <strong>Data dependency</strong> must be managed because a thread that needs another thread output cannot run freely in parallel. Finally, <strong>testing and debugging</strong> parallel programs is harder because timing-dependent bugs such as race conditions may appear inconsistently.' },
        { section: 'concepts', title: 'Parallelism vs. Concurrency', body: '<strong>Parallelism</strong> means a system literally performs multiple tasks at the exact same instant, which requires multiple CPU cores. <strong>Concurrency</strong> means multiple tasks are making progress, but not necessarily at the same moment. A single-core CPU achieves concurrency by rapidly switching between tasks. A multithreaded application on one core is <strong>concurrent but not parallel</strong>; on a multicore system, it can be both. This distinction matters when analyzing performance and choosing a threading strategy.' },
        { section: 'concepts', title: 'Data Parallelism vs. Task Parallelism', body: 'There are two major types of parallelism in multithreaded design. <strong>Data parallelism</strong> distributes subsets of the same data across multiple cores, with each core performing the same operation on its slice. <strong>Task parallelism</strong> distributes different tasks across cores, where each thread performs a unique operation such as sorting, searching, or rendering. Real systems often combine both approaches to keep cores busy and improve throughput.' },
        { section: 'concepts', title: "Amdahl's Law", body: '<strong>Amdahl\'s Law</strong> quantifies the theoretical speedup gained from adding CPU cores. The formula is <strong>Speedup = 1 / (S + (1-S)/N)</strong>, where <strong>S</strong> is the serial fraction and <strong>N</strong> is the number of cores. If 25% of a program is serial and 75% is parallel, moving from 1 to 2 cores gives only <strong>1.6x speedup</strong>, not 2x. As N approaches infinity, speedup approaches <strong>1/S</strong>, meaning the serial portion becomes the permanent bottleneck.' },
        { section: 'concepts', title: 'User Threads vs. Kernel Threads', body: '<strong>User threads</strong> are managed entirely by a user-level thread library, so the OS kernel is unaware of each individual user thread. <strong>Kernel threads</strong> are managed directly by the OS, which can schedule them independently on different cores. The three major thread libraries are <strong>POSIX Pthreads</strong>, <strong>Windows Threads</strong>, and <strong>Java Threads</strong>. Modern systems commonly use kernel-level support so threads can run in true parallelism across multicore hardware.' },
        { section: 'concepts', title: 'Many-to-One Threading Model', body: 'In the <strong>Many-to-One</strong> model, many user-level threads map to a single kernel thread. Because only one thread can enter the kernel at a time, one blocking system call can cause <strong>all threads in the process to block</strong>. The model also cannot run threads in parallel on multicore systems. It is rarely used today, but examples include <strong>Solaris Green Threads</strong> and <strong>GNU Portable Threads</strong>.' },
        { section: 'concepts', title: 'One-to-One Threading Model', body: 'In the <strong>One-to-One</strong> model, every user-level thread maps directly to its own kernel thread. This allows true parallel execution on multicore systems, and one blocking thread does not block all others. Creating a user thread creates a corresponding kernel thread. The main downside is overhead, so systems may restrict how many threads a process can create. This dominant model is used by <strong>Windows</strong>, <strong>Linux</strong>, and <strong>Solaris 9 and later</strong>.' },
        { section: 'concepts', title: 'Many-to-Many & Two-Level Models', body: 'The <strong>Many-to-Many</strong> model maps many user threads to a smaller or equal number of kernel threads, letting the OS create enough kernel threads for useful concurrency. This avoids both the blocking problem of Many-to-One and the overhead limits of One-to-One. The <strong>Two-Level model</strong> extends Many-to-Many by allowing a user thread to be <strong>bound</strong> to a specific kernel thread when needed. Many-to-Many appeared in Solaris before version 9 and Windows with ThreadFiber, while Two-Level appeared in IRIX, HP-UX, Tru64 UNIX, and Solaris 8 and earlier.' },
        { section: 'concepts', title: 'Thread Libraries', body: 'A <strong>thread library</strong> provides APIs for creating and managing threads. A library can run entirely in <strong>user space</strong>, avoiding kernel calls but limiting true parallelism. It can also be implemented as a <strong>kernel-level library</strong>, where API calls involve system calls but the OS can schedule threads independently. The dominant libraries are <strong>Pthreads</strong> on UNIX-like systems, <strong>Windows Threads</strong>, and <strong>Java Threads</strong> managed by the JVM.' },
        { section: 'concepts', title: 'Implicit Threading', body: '<strong>Implicit threading</strong> shifts the responsibility of creating and managing threads from programmers to <strong>compilers and runtime libraries</strong>. As thread counts grow, manual thread management becomes more error-prone, so implicit threading improves correctness and productivity. Three major approaches are <strong>Thread Pools</strong>, <strong>OpenMP</strong>, and <strong>Grand Central Dispatch</strong>. Other ecosystems also provide higher-level concurrency tools, such as Java <code>java.util.concurrent</code>.' },
        { section: 'concepts', title: 'Thread Pools', body: 'A <strong>thread pool</strong> pre-creates a fixed number of threads at startup, and those threads wait for submitted tasks. When a request arrives, the system assigns it to an available pool thread rather than creating a new thread. Benefits include faster response, bounded resource usage because pool size caps thread count, and flexible scheduling for queued or periodic tasks. The <strong>Windows API</strong> includes built-in thread pool support.' },
        { section: 'concepts', title: 'OpenMP', body: '<strong>OpenMP</strong> is a set of compiler directives, library routines, and environment variables for <strong>C</strong>, <strong>C++</strong>, and <strong>FORTRAN</strong> shared-memory parallel programming. A programmer marks <strong>parallel regions</strong> with <code>#pragma omp parallel</code>. OpenMP automatically creates threads to execute the block. For loops, <code>#pragma omp parallel for</code> distributes iterations across threads with no manual thread creation or join. It is widely used in scientific and high-performance computing.' },
        { section: 'concepts', title: 'Grand Central Dispatch (GCD)', body: '<strong>Grand Central Dispatch</strong> is Apple implicit threading technology for <strong>macOS</strong> and <strong>iOS</strong>. Programmers define <strong>blocks</strong> of work using <code>^{ }</code> syntax and submit them to <strong>dispatch queues</strong>. GCD assigns queued blocks to available threads in a thread pool. <strong>Serial dispatch queues</strong> process one block at a time in FIFO order, while <strong>concurrent dispatch queues</strong> can run multiple blocks at once. System-wide concurrent queues provide <strong>low</strong>, <strong>default</strong>, and <strong>high</strong> priorities.' },
        { section: 'concepts', title: 'fork() and exec() in Multithreaded Programs', body: 'The behavior of <strong>fork()</strong> and <strong>exec()</strong> becomes complicated in multithreaded programs. When a multithreaded process calls <code>fork()</code>, some UNIX systems duplicate <strong>only the calling thread</strong>, while others duplicate <strong>all threads</strong>. If <code>exec()</code> is called right after <code>fork()</code>, duplicating all threads is wasteful because <code>exec()</code> replaces the entire process memory anyway. Thread-aware UNIX systems provide variants to support both needs. <code>exec()</code> always replaces the whole process, including all threads.' },
        { section: 'concepts', title: 'Thread Cancellation & Signal Handling', body: '<strong>Thread cancellation</strong> means terminating a thread before it finishes. <strong>Asynchronous cancellation</strong> kills the target thread immediately, which is risky if the thread holds locks or resources. <strong>Deferred cancellation</strong>, the default in Pthreads, lets a thread check for cancellation at safe points using <code>pthread_testcancel()</code> and then run cleanup before exiting. <strong>Signal handling</strong> in multithreaded programs asks which thread receives a signal: the target thread, all threads, selected threads, or a designated handler thread. UNIX allows individual threads to block signals selectively.' },
        { section: 'concepts', title: 'Thread-Local Storage (TLS)', body: '<strong>Thread-Local Storage (TLS)</strong> gives each thread its own private copy of a variable. Unlike <strong>local variables</strong>, TLS can persist across function calls during the same thread lifetime. Unlike <strong>static variables</strong>, TLS is unique per thread rather than shared by every thread. TLS is especially useful with <strong>thread pools</strong>, where programmers may not directly control thread creation but still need per-thread state. In Pthreads, TLS keys are created with <code>pthread_key_create()</code>.' },
        { section: 'concepts', title: 'Windows & Linux Thread Internals', body: '<strong>Windows</strong> implements a one-to-one kernel-level thread model. Each thread has a thread ID, register set, user and kernel stacks, and private TLS storage. Windows represents threads with <strong>ETHREAD</strong> in kernel space, <strong>KTHREAD</strong> for scheduling and synchronization details, and <strong>TEB</strong> in user space for the user-mode stack, thread ID, and TLS. <strong>Linux</strong> calls threads <strong>tasks</strong> and creates them using <strong>clone()</strong>, whose flags control which resources are shared. The Linux <code>task_struct</code> points to shared and unique task data structures.' },
        { section: 'coding', title: 'Pthreads: Basic Thread Creation', body: '<strong><code>pthread_t tid</code></strong> is the thread handle. <strong><code>pthread_attr_init</code></strong> initializes default attributes, and <strong><code>pthread_create</code></strong> launches the thread by passing it the <code>runner</code> function. <strong><code>pthread_join</code></strong> blocks <code>main()</code> until the thread finishes. Without joining, the program may exit before the thread completes.', code: '#include <pthread.h>\n#include <stdio.h>\n\nvoid *runner(void *param) {\n    /* thread work goes here */\n    printf("Hello from thread!\\n");\n    pthread_exit(0);\n}\n\nint main() {\n    pthread_t tid;\n    pthread_attr_t attr;\n\n    pthread_attr_init(&attr);\n    pthread_create(&tid, &attr, runner, NULL);\n    pthread_join(tid, NULL);\n    return 0;\n}' },
        { section: 'coding', title: 'Pthreads: Joining Multiple Threads', body: 'To manage many threads, use an array such as <strong><code>pthread_t workers[NUM_THREADS]</code></strong>. The key pattern is to <strong>create all threads first, then join all threads</strong>. If <code>pthread_join</code> is placed inside the creation loop, each thread must finish before the next one is created, destroying parallelism. The runner function uses the signature <strong><code>void *runner(void *param)</code></strong> and commonly exits with <strong><code>pthread_exit(0)</code></strong>.', code: '#define NUM_THREADS 10\npthread_t workers[NUM_THREADS];\npthread_attr_t attr;\n\npthread_attr_init(&attr);\n\nfor (int i = 0; i < NUM_THREADS; i++) {\n    pthread_create(&workers[i], &attr, runner, NULL);\n}\n\nfor (int i = 0; i < NUM_THREADS; i++) {\n    pthread_join(workers[i], NULL);\n}' },
        { section: 'coding', title: 'Java Threads: Two Creation Methods', body: 'Java provides two ways to create threads: <strong>extend Thread</strong> or <strong>implement Runnable</strong>. In both cases, call <strong><code>.start()</code></strong> to ask the JVM to create a new OS thread and run <code>run()</code> inside it. Calling <code>run()</code> directly executes on the current thread, not a new one. <strong>Runnable</strong> is generally preferred because Java supports only single inheritance.', code: 'class MyThread extends Thread {\n    public void run() {\n        System.out.println("Thread running");\n    }\n}\nMyThread t1 = new MyThread();\nt1.start();\n\nclass MyTask implements Runnable {\n    public void run() {\n        System.out.println("Runnable running");\n    }\n}\nThread t2 = new Thread(new MyTask());\nt2.start();' },
        { section: 'coding', title: 'OpenMP: Parallelizing Code with Directives', body: '<strong>OpenMP</strong> uses compiler directives such as <code>#pragma</code> to mark parallel work. <strong><code>#pragma omp parallel</code></strong> creates a team of threads, each executing the enclosed block. <strong><code>#pragma omp parallel for</code></strong> distributes loop iterations among threads automatically. <strong><code>omp_get_thread_num()</code></strong> returns the calling thread ID, and OpenMP code is commonly compiled with <code>gcc -fopenmp file.c</code>.', code: '#include <omp.h>\n#include <stdio.h>\n\nint main() {\n    #pragma omp parallel\n    {\n        printf("Hello from thread %d\\n", omp_get_thread_num());\n    }\n\n    int a[1000], b[1000], c[1000];\n    #pragma omp parallel for\n    for (int i = 0; i < 1000; i++) {\n        c[i] = a[i] + b[i];\n    }\n\n    return 0;\n}' },
        { section: 'coding', title: 'Windows Threads: CreateThread API', body: '<strong><code>CreateThread()</code></strong> is the Windows equivalent of <code>pthread_create()</code>. <strong><code>WaitForSingleObject(handle, INFINITE)</code></strong> blocks until the thread finishes, acting like <code>pthread_join()</code>. A Windows thread function must return a <strong><code>DWORD</code></strong> and accept an <strong><code>LPVOID</code></strong> parameter. Always call <strong><code>CloseHandle()</code></strong> after waiting to release OS resources.', code: '#include <windows.h>\n#include <stdio.h>\n\nDWORD WINAPI ThreadFunc(LPVOID param) {\n    printf("Windows thread running\\n");\n    return 0;\n}\n\nint main() {\n    DWORD ThreadId;\n    HANDLE ThreadHandle = CreateThread(\n        NULL, 0, ThreadFunc, NULL, 0, &ThreadId\n    );\n\n    WaitForSingleObject(ThreadHandle, INFINITE);\n    CloseHandle(ThreadHandle);\n    return 0;\n}' }
      ],
      quiz: [
        { section: 'concepts', type: 'fill-blank', prompt: 'Fill in the blank:', sentence: '"The four benefits of multithreading are Responsiveness, Resource Sharing, Economy, and ________."', answers: ['scalability'], precise: 'Scalability', reinforcement: 'Scalability allows multithreaded processes to exploit multiple CPU cores, achieving true parallelism on modern hardware.' },
        { section: 'concepts', type: 'multiple-choice', question: "According to Amdahl's Law, if an application is 75% parallel and 25% serial, and you move from 1 to 2 cores, what is the approximate speedup?", options: ['2.0x', '1.6x', '1.3x', '3.0x'], answer: 1, correctLabel: 'B - 1.6x', explanation: "Amdahl's Law gives 1 / (0.25 + 0.75/2) = 1.6, showing how the serial portion limits the speedup." },
        { section: 'concepts', type: 'multiple-choice', question: 'Which multithreading model maps many user threads to a single kernel thread, causing one blocking thread to block all others?', options: ['One-to-One', 'Two-Level', 'Many-to-Many', 'Many-to-One'], answer: 3, correctLabel: 'D - Many-to-One', explanation: 'Many-to-One provides no true parallelism and was used by Solaris Green Threads and GNU Portable Threads.' },
        { section: 'concepts', type: 'fill-blank', prompt: 'Fill in the blank:', sentence: '"The ________ threading model is used by Windows and Linux, where each user thread maps directly to one kernel thread, enabling true parallel execution on multicore systems."', answers: ['one to one', 'one-to-one', '1 to 1', '1:1'], precise: 'One-to-One', reinforcement: 'One-to-One lets the OS schedule each thread independently on any available core.' },
        { section: 'concepts', type: 'multiple-choice', question: 'What is Thread-Local Storage (TLS) and how does it differ from local variables?', options: ['TLS stores data in shared memory accessible by all threads; local variables are private', 'TLS gives each thread its own private copy of a variable that persists across function calls; local variables exist only during one function invocation', 'TLS is identical to static variables; local variables exist only within a block', 'TLS is used only in kernel threads; local variables are for user threads'], answer: 1, correctLabel: 'B', explanation: 'TLS is like a per-thread static variable: it survives function boundaries but remains isolated to each thread.' },
        { section: 'concepts', type: 'fill-blank', prompt: 'Fill in the blank:', sentence: '"________ threading shifts thread creation and management responsibility from the programmer to compilers and runtime libraries, improving correctness as thread counts grow."', answers: ['implicit', 'implicit threading'], precise: 'Implicit threading', reinforcement: 'Implicit threading tools such as OpenMP and GCD let programmers identify parallelism while the system handles thread lifecycle management.' },
        { section: 'concepts', type: 'multiple-choice', question: 'Which implicit threading method uses dispatch queues and blocks (^{ }) to manage parallel work, and is native to macOS and iOS?', options: ['OpenMP', 'Thread Pools', 'Grand Central Dispatch', 'Pthreads'], answer: 2, correctLabel: 'C - Grand Central Dispatch', explanation: 'GCD is Apple technology that manages a thread pool and assigns queued blocks to serial or concurrent dispatch queues.' },
        { section: 'concepts', type: 'fill-blank', prompt: 'Fill in the blank:', sentence: '"In Pthreads, ________ cancellation is the default mode, which allows a thread to check for a pending cancellation request at safe cancellation points before cleaning up and terminating."', answers: ['deferred', 'deferred cancellation'], precise: 'Deferred cancellation', reinforcement: 'Deferred cancellation is safer than asynchronous cancellation because the thread exits only at defined checkpoints.' },
        { section: 'concepts', type: 'multiple-choice', question: 'In Linux, what system call is used to create a new thread (task), and what makes it different from fork()?', options: ['exec() - it replaces the current process with a new one', 'clone() - it allows the child task to selectively share the parent address space using flags', 'pthread_create() - it duplicates the parent process entirely', 'thread_new() - it creates an isolated thread with no shared memory'], answer: 1, correctLabel: 'B - clone()', explanation: 'clone() gives fine-grained control over what is shared, such as address space, file descriptors, and signal handlers.' },
        { section: 'concepts', type: 'multiple-choice', question: 'What are the three data structures that Windows uses to represent a thread internally?', options: ['PCB, TCB, and TEB', 'ETHREAD, KTHREAD, and TEB', 'EPROCESS, KTHREAD, and TLS', 'ThreadBlock, KernelStack, and UserStack'], answer: 1, correctLabel: 'B - ETHREAD, KTHREAD, and TEB', explanation: 'ETHREAD and KTHREAD live in kernel space, while TEB lives in user space and stores the thread ID, user-mode stack, and TLS data.' },
        { section: 'coding', type: 'multiple-choice', coding: true, question: 'Study this incomplete Pthread program. Which line exits the thread cleanly?', code: '#include <pthread.h>\n\nvoid *runner(void *param) {\n    /* do work */\n    ________;      // <-- What goes here?\n}\n\nint main() {\n    pthread_t tid;\n    pthread_attr_t attr;\n    pthread_attr_init(&attr);\n    pthread_create(&tid, &attr, runner, NULL);\n    pthread_join(tid, NULL);\n    return 0;\n}', options: ['return NULL', 'exit(0)', 'pthread_exit(0)', 'thread_end()'], answer: 2, correctLabel: 'C - pthread_exit(0)', explanation: 'pthread_exit(0) explicitly terminates only the calling thread and can pass a return value. A compiles but is not the explicit Pthreads idiom, B exits the entire process, and D is not a Pthreads API function.' },
        { section: 'coding', type: 'multiple-choice', coding: true, question: 'Look at this Java threading code. Which line correctly starts the thread?', code: 'class Task implements Runnable {\n    public void run() {\n        System.out.println("Task running");\n    }\n}\n\npublic class Main {\n    public static void main(String[] args) {\n        Task t = new Task();\n        Thread thread = new Thread(t);\n        ________;\n    }\n}', options: ['t.run();', 'thread.run();', 'thread.start();', 'Thread.execute(t);'], answer: 2, correctLabel: 'C - thread.start();', explanation: 'thread.start() tells the JVM to create a new OS thread and invoke run() inside it. A and B call run() directly on the current thread, and D is not a Java Thread method.' },
        { section: 'coding', type: 'multiple-choice', coding: true, question: 'Which OpenMP directive correctly parallelizes this for loop so loop iterations are distributed across threads?', code: '#include <omp.h>\nint a[500], b[500], c[500];\n\nint main() {\n    ________\n    for (int i = 0; i < 500; i++) {\n        c[i] = a[i] + b[i];\n    }\n    return 0;\n}', options: ['#pragma omp parallel', '#pragma omp parallel for', '#pragma omp for threads', '#pragma omp task'], answer: 1, correctLabel: 'B - #pragma omp parallel for', explanation: '#pragma omp parallel for creates a team and divides loop iterations among them. A creates threads but every thread would run the whole loop, C is invalid syntax, and D creates tasks rather than distributing loop iterations.' },
        { section: 'coding', type: 'multiple-choice', coding: true, question: 'Which Windows API call waits for this thread to complete?', code: 'DWORD WINAPI MyThread(LPVOID param) {\n    printf("Running\\n");\n    return 0;\n}\n\nint main() {\n    DWORD tid;\n    HANDLE h = CreateThread(NULL, 0, MyThread, NULL, 0, &tid);\n    ________;\n    CloseHandle(h);\n    return 0;\n}', options: ['pthread_join(h, NULL);', 'WaitForSingleObject(h, INFINITE);', 'JoinThread(h);', 'ThreadWait(h, 0);'], answer: 1, correctLabel: 'B - WaitForSingleObject(h, INFINITE);', explanation: 'WaitForSingleObject waits on the Windows thread handle until completion. A is POSIX Pthreads and will not compile in Windows-only code, while C and D are not real Windows API calls.' },
        { section: 'coding', type: 'multiple-choice', coding: true, question: 'This Pthread program creates 5 threads but has a structural bug. What is wrong and which fix is correct?', code: 'pthread_t workers[5];\npthread_attr_t attr;\npthread_attr_init(&attr);\n\nfor (int i = 0; i < 5; i++) {\n    pthread_create(&workers[i], &attr, runner, NULL);\n    pthread_join(workers[i], NULL);   // <-- Is this correct placement?\n}', options: ['Nothing is wrong - joining inside the creation loop is the correct pattern', 'pthread_join should be removed entirely - threads never need to be joined', 'pthread_join must be in a separate loop after all threads are created, so threads can run in parallel instead of one at a time', 'pthread_create and pthread_join must always be in separate functions'], answer: 2, correctLabel: 'C', explanation: 'Joining inside the creation loop waits for each thread before creating the next, making execution sequential. A is therefore wrong, B risks main exiting before workers finish, and D invents a rule that does not exist; the correct fix is one loop to create all threads and a second loop to join them.' }
      ]
    }
  };

  const importedCiscoModules = window.OS_ODYSSEY_CISCO_MODULES || {};
  ['module1', 'module2'].forEach((moduleId) => {
    const imported = importedCiscoModules[moduleId];
    if (!imported || !Array.isArray(imported.review) || !Array.isArray(imported.quiz)) return;

    const review = imported.review.length === 16 ? imported.review.slice(1) : imported.review;
    if (review.length !== 15 || imported.quiz.length !== 20) return;

    modules[moduleId] = {
      ...modules[moduleId],
      ...imported,
      review,
      quizType: 'multiple-choice'
    };
  });

  // Expose full module content globally for profile.js to derive stats dynamically
  window.OS_ODYSSEY_MODULES = modules;

  /**
   * Apply lock/unlock visual state to all module buttons
   * (sidebar outline + main "Start Module" action buttons).
   * Called on page load and after a module is completed.
   * Defined at IIFE scope so renderSessionUI & markModuleCompleted can reach it.
   */
  function applyModuleLockState() {
    document.querySelectorAll('[data-start-module]').forEach(button => {
      const mid = button.dataset.startModule;
      const unlocked = isModuleUnlocked(mid);
      const completedModules = (activeProfile && activeProfile.completed_modules) ? activeProfile.completed_modules : [];
      const isDone = completedModules.includes(mid);

      // Toggle locked class
      button.classList.toggle('module-locked', !unlocked);
      button.classList.toggle('module-completed', isDone);
      button.disabled = !unlocked;

      // For main action buttons (Start Module X), update label
      if (button.classList.contains('lesson-button')) {
        const num = mid.replace('module', '');
        if (!unlocked) {
          button.textContent = '\ud83d\udd12 Module ' + num + ' Locked';
        } else if (isDone) {
          button.textContent = '\u2713 Review Module ' + num;
          button.disabled = false;
        } else {
          button.textContent = 'Start Module ' + num;
        }
      }

      // For sidebar outline buttons, add/remove lock indicator
      if (button.classList.contains('course-outline-module')) {
        const checkEl = button.querySelector('.outline-check');
        if (checkEl) {
          const num = mid.replace('module', '');
          if (!unlocked) {
            checkEl.textContent = '\ud83d\udd12';
          } else if (isDone) {
            checkEl.textContent = '\u2713';
          } else {
            checkEl.textContent = num;
          }
        }
      }
    });
  }

  // Apply lock state immediately (before profile loads — locks everything by default)
  applyModuleLockState();

  if (moduleOverlay) {
    const elements = {
      kicker: document.getElementById('lessonModuleKicker'),
      title: document.getElementById('lessonModuleTitle'),
      progress: document.getElementById('lessonProgress'),
      phase: document.getElementById('lessonPhase'),
      status: document.getElementById('moduleStatus'),
      body: document.getElementById('lessonBody'),
      outline: document.getElementById('lessonOutline'),
      readerProgress: document.getElementById('lessonReaderProgress'),
      answerGrid: document.getElementById('answerGrid'),
      fillWrap: document.getElementById('fillAnswer'),
      fillInput: document.getElementById('fillAnswerInput'),
      feedback: document.getElementById('lessonFeedback'),
      primaryAction: document.getElementById('lessonPrimaryAction'),
      backAction: document.getElementById('lessonBackAction'),
      secondaryAction: document.getElementById('lessonSecondaryAction')
    };

    const state = {
      activeModuleId: null,
      mode: 'review',
      reviewIndex: 0,
      quizIndex: 0,
      correct: 0,
      correctConcept: 0,
      correctCoding: 0,
      answered: false,
      summaryRecorded: false,
      topicsCompleted: false
    };

    const MODULE_OUTLINES = {
      module1: [
        { code: '1.1', title: 'What is an Operating System?', pages: 3 },
        { code: '1.2', title: 'Computer System Structure', pages: 3 },
        { code: '1.3', title: 'Interrupts & Computer Startup', pages: 3 },
        { code: '1.4', title: 'Storage Hierarchy & Caching', pages: 3 },
        { code: '1.5', title: 'Processes, Multiprogramming & Protection', pages: 3 }
      ],
      module2: [
        { code: '2.1', title: 'OS Services', pages: 3 },
        { code: '2.2', title: 'System Calls & Parameter Passing', pages: 3 },
        { code: '2.3', title: 'Types of System Calls', pages: 3 },
        { code: '2.4', title: 'OS Design Principles & Structure Types', pages: 3 },
        { code: '2.5', title: 'System Programs, Debugging & Boot', pages: 3 }
      ],
      module3: [
        { code: '3.1', title: 'What is a Process?', pages: 3 },
        { code: '3.2', title: 'Process Scheduling', pages: 3 },
        { code: '3.3', title: 'Process Creation & Termination', pages: 3 },
        { code: '3.4', title: 'Interprocess Communication (IPC)', pages: 3 },
        { code: '3.5', title: 'Client-Server Communication', pages: 3 }
      ],
      module4: [
        { code: 'Section A', title: 'Concepts', pages: 0, heading: true },
        { code: '4.1', title: 'Thread Basics & Benefits', pages: 5 },
        { code: '4.2', title: "Multicore Programming & Amdahl's Law", pages: 4 },
        { code: '4.3', title: 'Multithreading Models & Thread Libraries', pages: 5 },
        { code: '4.4', title: 'Implicit Threading & Threading Issues', pages: 6 },
        { code: 'Section B', title: 'Coding', pages: 0, heading: true },
        { code: '4.5', title: 'Threading Code Walkthroughs', pages: 5 }
      ]
    };

    function currentModule() {
      return modules[state.activeModuleId];
    }

    function outlineRows(moduleId) {
      return MODULE_OUTLINES[moduleId] || [];
    }

    function outlineProgress(index, rows) {
      let cursor = 0;
      return rows.map(row => {
        if (row.heading) return { ...row, start: cursor, end: cursor };
        const start = cursor;
        cursor += row.pages;
        return { ...row, start, end: cursor };
      });
    }

    function syncCourseButtons(moduleId) {
      document.querySelectorAll('.course-outline-module').forEach(button => {
        button.classList.toggle('active', button.dataset.startModule === moduleId);
      });
    }


    function updateLessonOutline() {
      if (!elements.outline) return;
      const module = currentModule();
      if (!module) return;

      const rows = outlineProgress(state.activeModuleId, outlineRows(state.activeModuleId));
      const totalPages = module.review.length;
      const completedPages = state.mode === 'review' ? state.reviewIndex : totalPages;
      const activeReviewIndex = state.mode === 'review' ? state.reviewIndex : -1;
      const percent = state.mode === 'review'
        ? Math.round((state.reviewIndex / totalPages) * 100)
        : 100;

      if (elements.readerProgress) elements.readerProgress.style.width = `${percent}%`;

      const outlineHtml = rows.map(row => {
        if (row.heading) {
          return `<div class="lesson-outline-section">${row.code} - ${row.title}</div>`;
        }

        const done = Math.max(0, Math.min(row.pages, completedPages - row.start));
        const active = activeReviewIndex >= row.start && activeReviewIndex < row.end;
        const complete = done === row.pages;
        return `
          <button class="lesson-outline-item ${active ? 'active' : ''} ${complete ? 'complete' : ''}" type="button" data-outline-start="${row.start}">
            <span class="outline-dot">${complete ? 'OK' : row.code}</span>
            <span>
              <strong>${row.code} ${row.title}</strong>
              <em>${done} / ${row.pages}</em>
            </span>
          </button>
        `;
      }).join('');

      const quizUnlocked = state.mode !== 'review' || state.topicsCompleted;
      elements.outline.innerHTML = `
        ${outlineHtml}
        <button class="lesson-outline-item quiz ${quizUnlocked ? 'complete active' : 'locked'}" type="button" ${quizUnlocked ? '' : 'disabled'}>
          <span class="outline-dot">Q</span>
          <span>
            <strong>Module Quiz</strong>
            <em>${quizUnlocked ? 'Unlocked' : 'Locked'}</em>
          </span>
        </button>
      `;
    }

    function questionType(module, item) {
      return item.type || module.quizType || 'multiple-choice';
    }

    function escapeHtml(value) {
      return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    function itemSectionLabel(kind, index, item) {
      if (item?.section === 'coding' || item?.coding) return 'Section B - Coding';
      if (item?.section === 'concepts') return 'Section A - Concepts';
      if (kind === 'review') return index < 20 ? 'Section A - Concepts' : 'Section B - Coding';
      return index < 10 ? 'Section A - Concepts' : 'Section B - Coding';
    }

    function renderCodeBlock(code) {
      return code ? `<pre class="lesson-code"><code>${escapeHtml(code)}</code></pre>` : '';
    }

    function renderLessonCopy(body) {
      return String(body || '').trim().startsWith('<')
        ? body
        : `<p>${body}</p>`;
    }

    function updateBackAction() {
      if (!elements.backAction) return;
      const canGoBack = (state.mode === 'review' && state.reviewIndex > 0)
        || (state.mode === 'quiz' && !state.answered && state.quizIndex > 0);
      elements.backAction.disabled = !canGoBack;
    }

    function openModule(moduleId) {
      if (!modules[moduleId]) return;

      // Block opening locked modules
      if (!isModuleUnlocked(moduleId)) {
        const idx = MODULE_META.findIndex(m => m.id === moduleId);
        const prevNum = idx > 0 ? idx : 1;
        alert(`Module ${idx + 1} is locked. Complete Module ${prevNum} first to unlock it.`);
        return;
      }

      state.activeModuleId = moduleId;
      state.mode = 'review';
      state.reviewIndex = 0;
      state.quizIndex = 0;
      state.correct = 0;
      state.correctConcept = 0;
      state.correctCoding = 0;
      state.answered = false;
      state.summaryRecorded = false;
      state.topicsCompleted = isModuleTopicsDone(moduleId);
      syncCourseButtons(moduleId);

      // Fade-in the overlay on open
      moduleOverlay.classList.remove('fade-in');
      moduleOverlay.hidden = false;
      // Force reflow so the animation restarts cleanly
      void moduleOverlay.offsetWidth;
      moduleOverlay.classList.add('fade-in');

      document.body.classList.add('lesson-open');
      renderReview();

      // Fade-in the initial content
      applyContentFadeIn();
    }

    function closeModule() {
      moduleOverlay.hidden = true;
      document.body.classList.remove('lesson-open');
    }

    function resetQuestionUI() {
      elements.answerGrid.hidden = true;
      elements.answerGrid.innerHTML = '';
      elements.fillWrap.hidden = true;
      elements.fillInput.value = '';
      elements.fillInput.disabled = false;
      elements.feedback.className = 'lesson-feedback';
      elements.feedback.textContent = '';
      elements.secondaryAction.hidden = true;
      if (elements.backAction) elements.backAction.hidden = false;
      updateBackAction();
    }

    /* -- Content fade helpers -- */
    const contentEls = () => [
      elements.body,
      elements.answerGrid,
      elements.fillWrap,
      elements.feedback
    ];

    function stripFadeClasses() {
      contentEls().forEach(el => {
        el.classList.remove('lesson-content-fade-out', 'lesson-content-fade-in');
      });
    }

    function applyContentFadeIn() {
      stripFadeClasses();
      void elements.body.offsetWidth; // reflow
      contentEls().forEach(el => el.classList.add('lesson-content-fade-in'));
    }

    /**
     * Fade-out current content, call renderFn to update DOM,
     * then fade-in the new content.
     */
    function transitionContent(renderFn) {
      stripFadeClasses();
      void elements.body.offsetWidth;
      contentEls().forEach(el => el.classList.add('lesson-content-fade-out'));

      // After fade-out finishes (220ms matches CSS), render new content and fade in
      setTimeout(() => {
        renderFn();
        applyContentFadeIn();
      }, 230);
    }

    function renderReview() {
      const module = currentModule();
      const statement = module.review[state.reviewIndex];
      const isLastReview = state.reviewIndex === module.review.length - 1;
      state.mode = 'review';
      state.answered = false;
      resetQuestionUI();

      elements.kicker.textContent = module.number;
      elements.title.textContent = module.title;
      elements.progress.textContent = `Statement ${state.reviewIndex + 1} of ${module.review.length} [${itemSectionLabel('review', state.reviewIndex, statement)}]`;
      elements.phase.textContent = 'Review Phase';
      elements.status.textContent = 'Review Mode';
      updateLessonOutline();
      elements.primaryAction.textContent = isLastReview ? 'Start Quiz' : 'Next';
      elements.primaryAction.disabled = false;
      const intro = state.reviewIndex === 0 && module.intro ? module.intro : '';
      const transition = state.reviewIndex === module.reviewTransitionIndex && module.reviewTransition ? module.reviewTransition : '';
      elements.body.innerHTML = `
        ${intro}
        ${transition}
        <h3>${statement.title}</h3>
        ${renderLessonCopy(statement.body)}
        ${renderCodeBlock(statement.code)}
        <p class="lesson-prompt">${isLastReview
          ? `🎉 You've completed all ${module.review.length} review statements! The quiz is now unlocked. Press <strong>[Start Quiz]</strong> to begin.`
          : '→ <em>Press <strong>[Next]</strong> to continue.</em>'}</p>
      `;
    }

    function renderQuestion() {
      const module = currentModule();
      const item = module.quiz[state.quizIndex];
      state.mode = 'quiz';
      state.answered = false;
      resetQuestionUI();
      const type = questionType(module, item);

      elements.progress.textContent = `Question ${state.quizIndex + 1} of ${module.quiz.length} [${itemSectionLabel('quiz', state.quizIndex, item)}]`;
      elements.phase.textContent = 'Quiz Phase';
      elements.status.textContent = 'Quiz Mode';
      updateLessonOutline();
      elements.primaryAction.disabled = type === 'multiple-choice';
      elements.primaryAction.textContent = type === 'multiple-choice' ? 'Choose an answer' : 'Submit Answer';
      const intro = state.quizIndex === 0 && module.quizIntro ? module.quizIntro : '';
      const transition = state.quizIndex === module.questionTransitionIndex && module.questionTransition ? module.questionTransition : '';

      if (type === 'multiple-choice') {
        elements.body.innerHTML = `
          ${intro}
          ${transition}
          <h3>${item.question}</h3>
          ${renderCodeBlock(item.code)}
          <p class="lesson-prompt">Type A, B, C, or D by choosing an answer.</p>
        `;
        elements.answerGrid.hidden = false;
        elements.answerGrid.innerHTML = item.options.map((option, index) => `
          <button class="answer-option" type="button" data-answer-index="${index}">
            <strong>${String.fromCharCode(65 + index)})</strong>
            <span>${option}</span>
          </button>
        `).join('');
        return;
      }

      elements.body.innerHTML = `
        ${intro}
        ${transition}
        <h3>${item.prompt}</h3>
        <blockquote class="blank-sentence">${item.sentence}</blockquote>
        <p class="lesson-prompt">Type your answer.</p>
      `;
      elements.fillWrap.hidden = false;
      elements.fillInput.focus();
    }

    function scoreMessage(module, score) {
      if (state.activeModuleId === 'module1') {
        if (score >= 18) return "Outstanding! You've fully mastered the OS foundations.";
        if (score >= 14) return "Great work! Review the questions you missed and reinforce those concepts.";
        if (score >= 10) return 'Good effort - re-read the relevant pages and try again.';
        return "Re-read all Module 1 sections carefully and retake the quiz. You've got this!";
      }

      if (state.activeModuleId === 'module2') {
        if (score >= 18) return "Outstanding! You've fully mastered OS Structures.";
        if (score >= 14) return 'Great work! Review the questions you missed and reinforce those concepts.';
        if (score >= 10) return 'Good effort - re-read the relevant pages and try again.';
        return "Re-read all Module 2 sections carefully and retake the quiz. You've got this!";
      }

      if (state.activeModuleId === 'module3') {
        if (score >= 9) return 'Outstanding! You have a deep understanding of Processes - well done!';
        if (score >= 7) return "Great work! Review the questions you missed and you'll have this chapter mastered.";
        if (score >= 5) return 'Good effort! Re-reading the statements for the topics you missed will help solidify the concepts.';
        return 'Keep going - OS concepts take time to sink in. Try reviewing all 15 statements again and retry the quiz!';
      }

      if (state.activeModuleId === 'module4') {
        if (score >= 14) return '🏆 Exceptional! You have mastered both the theory and the code of multithreading!';
        if (score >= 11) return '🎉 Great work! Review the questions you missed and this chapter is fully yours.';
        if (score >= 8) return '👍 Solid effort! Re-read the coding statements for any code questions you missed.';
        if (score >= 5) return '📖 Keep going - revisit both Section A and Section B of the review before retrying.';
        return "💪 Don't give up! Start from Statement 1 and take your time - threads take practice.";
      }

      return module.summary;
    }

    function renderSummary() {
      const module = currentModule();
      state.mode = 'summary';
      resetQuestionUI();
      elements.progress.textContent = 'Quiz Complete';
      elements.phase.textContent = 'Summary';
      elements.status.textContent = 'Complete';
      updateLessonOutline();
      elements.primaryAction.textContent = 'Retry Quiz';
      elements.primaryAction.disabled = false;
      elements.secondaryAction.hidden = false;
      if (elements.backAction) elements.backAction.hidden = true;

      if (!state.summaryRecorded) {
        recordQuizAttempt(state.activeModuleId, state.correct, module.quiz.length);
        state.summaryRecorded = true;
      }

      if (state.activeModuleId === 'module4') {
        elements.body.innerHTML = `
          <h3>Your Score: ${state.correct} / ${module.quiz.length}</h3>
          <p><strong>Concept Questions:</strong> ${state.correctConcept} / 10</p>
          <p><strong>Coding Questions:</strong> ${state.correctCoding} / 5</p>
          <p>${scoreMessage(module, state.correct)}</p>
          <div class="summary-options">
            <span>Review again - restart from Statement 1 of 25</span>
            <span>Retry the quiz - restart from Question 1 of 15</span>
            <span>Next module - proceed to Module 5 when available</span>
          </div>
        `;
      } else {
        elements.body.innerHTML = `
          <h3>You got ${state.correct} out of ${module.quiz.length} correct!</h3>
          <p><strong>Score: ${state.correct} / ${module.quiz.length}</strong></p>
          <p>${scoreMessage(module, state.correct)}</p>
          <div class="summary-options">
            <span>Review the ${module.review.length} statements again</span>
            <span>Retry the quiz</span>
            <span>Move to ${state.activeModuleId === 'module3' ? 'Module 4' : 'the next module'} when it is available</span>
          </div>
        `;
      }

      // Mark module as completed once the user finishes the quiz (any score)
      markModuleCompleted(state.activeModuleId);
    }

    async function awardQuestionXp() {
      // Call backend — awards a fixed 15 XP server-side (tamper-proof)
      const result = await backendCall('POST', '/progress/quiz-xp');
      if (result && result.xp != null) {
        activeProfile = {
          ...(activeProfile || {}),
          xp: result.xp,
          level: result.level,
          rank: result.rank
        };
        renderProfileStats(activeProfile);
      }
    }

    function normalizeAnswer(value) {
      return value.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
    }

    function editDistance(a, b) {
      const dp = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));

      for (let i = 0; i <= a.length; i += 1) dp[i][0] = i;
      for (let j = 0; j <= b.length; j += 1) dp[0][j] = j;

      for (let i = 1; i <= a.length; i += 1) {
        for (let j = 1; j <= b.length; j += 1) {
          const cost = a[i - 1] === b[j - 1] ? 0 : 1;
          dp[i][j] = Math.min(
            dp[i - 1][j] + 1,
            dp[i][j - 1] + 1,
            dp[i - 1][j - 1] + cost
          );
        }
      }

      return dp[a.length][b.length];
    }

    function gradeFillAnswer(value, item) {
      const answer = normalizeAnswer(value);
      if (!answer) return 'incorrect';

      const accepted = item.answers.map(normalizeAnswer);
      if (accepted.some(keyword => answer === keyword || answer.includes(keyword))) return 'correct';
      if (accepted.some(keyword => editDistance(answer, keyword) <= 2)) return 'close';
      return 'incorrect';
    }

    function completeAnswer(isCorrect, feedbackText) {
      state.answered = true;
      if (isCorrect) {
        const item = currentModule().quiz[state.quizIndex];
        state.correct += 1;
        if (item.section === 'coding' || item.coding) {
          state.correctCoding += 1;
        } else {
          state.correctConcept += 1;
        }
      }
      awardQuestionXp();

      elements.feedback.className = `lesson-feedback ${isCorrect ? 'correct' : 'incorrect'}`;
      elements.feedback.textContent = feedbackText;
      elements.primaryAction.disabled = false;
      elements.primaryAction.textContent = state.quizIndex === currentModule().quiz.length - 1 ? 'See Summary' : 'Next Question';
      updateBackAction();
    }

    function handlePrimaryAction() {
      const module = currentModule();
      if (!module) return;

      if (state.mode === 'review') {
        if (state.reviewIndex < module.review.length - 1) {
          state.reviewIndex += 1;
          transitionContent(() => renderReview());
          return;
        }

        // Persist that all topics have been reviewed
        markModuleTopicsDone(state.activeModuleId);
        state.topicsCompleted = true;
        state.quizIndex = 0;
        state.correct = 0;
        state.correctConcept = 0;
        state.correctCoding = 0;
        state.summaryRecorded = false;
        transitionContent(() => renderQuestion());
        return;
      }

      if (state.mode === 'quiz' && questionType(module, module.quiz[state.quizIndex]) === 'fill-blank' && !state.answered) {
        const item = module.quiz[state.quizIndex];
        const grade = gradeFillAnswer(elements.fillInput.value, item);
        const isCorrect = grade === 'correct' || grade === 'close';
        const prefix = grade === 'correct'
          ? 'Correct.'
          : grade === 'close'
            ? `Nearly right - the precise term is ${item.precise}.`
            : `Not quite. The correct answer is ${item.precise}.`;

        elements.fillInput.disabled = true;
        completeAnswer(isCorrect, `${prefix} ${item.reinforcement}`);
        return;
      }

      if (state.mode === 'quiz' && state.answered) {
        state.quizIndex += 1;
        if (state.quizIndex < module.quiz.length) {
          transitionContent(() => renderQuestion());
        } else {
          transitionContent(() => renderSummary());
        }
        return;
      }

      if (state.mode === 'summary') {
        state.quizIndex = 0;
        state.correct = 0;
        state.correctConcept = 0;
        state.correctCoding = 0;
        state.summaryRecorded = false;
        transitionContent(() => renderQuestion());
      }
    }

    function handleBackAction() {
      const module = currentModule();
      if (!module) return;

      if (state.mode === 'review' && state.reviewIndex > 0) {
        state.reviewIndex -= 1;
        transitionContent(() => renderReview());
        return;
      }

      if (state.mode === 'quiz' && !state.answered && state.quizIndex > 0) {
        state.quizIndex -= 1;
        transitionContent(() => renderQuestion());
      }
    }

    function handleMultipleChoice(optionButton) {
      const module = currentModule();
      const item = module.quiz[state.quizIndex];
      if (state.mode !== 'quiz' || state.answered || questionType(module, item) !== 'multiple-choice') return;

      const selected = Number(optionButton.dataset.answerIndex);
      const isCorrect = selected === item.answer;

      elements.answerGrid.querySelectorAll('.answer-option').forEach((button) => {
        const index = Number(button.dataset.answerIndex);
        button.disabled = true;
        if (index === item.answer) button.classList.add('correct');
        if (index === selected && !isCorrect) button.classList.add('incorrect');
      });

      completeAnswer(
        isCorrect,
        isCorrect
          ? `Correct. ${item.explanation}`
          : `Not quite. The correct answer is ${item.correctLabel || String.fromCharCode(65 + item.answer)}. ${item.explanation}`
      );
    }

    document.querySelectorAll('[data-start-module]').forEach(button => {
      button.addEventListener('click', () => openModule(button.dataset.startModule));
    });


    document.querySelectorAll('[data-close-module]').forEach(button => {
      button.addEventListener('click', closeModule);
    });

    // Course button — exit learning/quiz mode without page reload
    const courseBtn = document.getElementById('backToCourseBtn');
    if (courseBtn) {
      courseBtn.addEventListener('click', (e) => {
        e.preventDefault();
        closeModule();
        if (window.location.hash) {
          history.replaceState(null, '', window.location.pathname + window.location.search);
        }
      });
    }

    elements.primaryAction.addEventListener('click', handlePrimaryAction);
    if (elements.backAction) {
      elements.backAction.addEventListener('click', handleBackAction);
    }
    elements.secondaryAction.addEventListener('click', () => {
      state.reviewIndex = 0;
      state.quizIndex = 0;
      state.correct = 0;
      state.correctConcept = 0;
      state.correctCoding = 0;
      state.summaryRecorded = false;
      transitionContent(() => renderReview());
    });

    elements.answerGrid.addEventListener('click', (event) => {
      const optionButton = event.target.closest('[data-answer-index]');
      if (optionButton) handleMultipleChoice(optionButton);
    });

    if (elements.outline) {
      elements.outline.addEventListener('click', (event) => {
        // Handle topic outline clicks — always accessible
        const outlineButton = event.target.closest('[data-outline-start]');
        if (outlineButton) {
          state.mode = 'review';
          state.reviewIndex = Number(outlineButton.dataset.outlineStart);
          state.answered = false;
          transitionContent(() => renderReview());
          return;
        }

        // Handle quiz button click (when unlocked)
        const quizButton = event.target.closest('.lesson-outline-item.quiz');
        if (quizButton && !quizButton.disabled) {
          state.quizIndex = 0;
          state.correct = 0;
          state.correctConcept = 0;
          state.correctCoding = 0;
          state.summaryRecorded = false;
          transitionContent(() => renderQuestion());
        }
      });
    }

    document.addEventListener('keydown', (event) => {
      if (moduleOverlay.hidden || state.mode !== 'quiz' || state.answered) return;
      const module = currentModule();
      const item = module.quiz[state.quizIndex];
      if (questionType(module, item) !== 'multiple-choice') return;

      const selected = event.key.toUpperCase().charCodeAt(0) - 65;
      if (selected < 0 || selected > 3) return;
      const optionButton = elements.answerGrid.querySelector(`[data-answer-index="${selected}"]`);
      if (optionButton) handleMultipleChoice(optionButton);
    });

    elements.fillInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') handlePrimaryAction();
    });

    if (window.location.hash === '#module1Tutor' || window.location.hash === '#module1') {
      openModule('module1');
    }

    if (window.location.hash === '#module2') {
      openModule('module2');
    }

    if (window.location.hash === '#module3') {
      openModule('module3');
    }

    if (window.location.hash === '#module4') {
      openModule('module4');
    }
  }

  /* ---- Logout ---- */
  document.querySelectorAll('[data-logout]').forEach(button => {
    button.addEventListener('click', async () => {
      await supa.auth.signOut();
      window.location.href = 'index.html';
    });
  });

  /* ---- Club card dismiss ---- */
  const clubDismiss = document.querySelector('.club-card button');
  if (clubDismiss) {
    clubDismiss.addEventListener('click', () => {
      clubDismiss.closest('.club-card').style.display = 'none';
    });
  }

  document.addEventListener('click', (event) => {
    const lockedSim = event.target.closest('.explore-card-link.kernel-locked');
    if (!lockedSim) return;
    event.preventDefault();
    const systemLabCard = document.getElementById('systemLabCard');
    if (systemLabCard) {
      systemLabCard.classList.add('kernel-attention');
      setTimeout(() => systemLabCard.classList.remove('kernel-attention'), 700);
    }
  });

  /* ---- Easter egg ---- */
  console.log('%c🐧 OS ODYSSEY', 'font-family:monospace;font-size:22px;color:#f5a623;font-weight:bold;');
  console.log('%cTrain like a coder. Think like a kernel.', 'font-family:monospace;font-size:12px;color:#94a3b8;');
  console.log('%c⚡ Powered by Supabase', 'font-family:monospace;font-size:10px;color:#3ecf8e;');

})();
