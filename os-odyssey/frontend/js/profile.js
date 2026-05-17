
(function () {
  'use strict';

  /* ---- Module metadata — dynamically derived from main.js ---- */
  function buildModuleList() {
    const meta = window.OS_ODYSSEY_MODULE_META || [];
    const content = window.OS_ODYSSEY_MODULES || {};

    return meta.map((m, idx) => {
      const mod = content[m.id] || {};
      return {
        id: m.id,
        number: mod.number || `Module ${idx + 1}`,
        title: mod.title || 'Untitled Module',
        topics: m.statements || 0,
        quizQuestions: (mod.quiz && mod.quiz.length) || 0
      };
    });
  }

  // Build once on load; if main.js hasn't run yet, fallback to empty
  let MODULES = buildModuleList();
  let TOTAL_MODULES = MODULES.length;
  let TOTAL_TOPICS = MODULES.reduce((s, m) => s + m.topics, 0);

  /* ---- Available banner backgrounds ---- */
  const BANNER_BG_OPTIONS = [
    { id: 'bg-mountains-purple', src: '../../assets/bg-mountains-purple.jpg', label: 'Purple Mountains' },
    { id: 'bg-mountains-day', src: '../../assets/bg-mountains-day.jpg', label: 'Daytime Mountains' },
    { id: 'bg-mountains-sunrise', src: '../../assets/bg-mountains-sunrise.jpg', label: 'Sunrise Mountains' },
    { id: 'bg-forest-lantern', src: '../../assets/bg-forest-lantern.jpg', label: 'Forest Lantern' },
    { id: 'hero-bg-day', src: '../../assets/hero-bg-day.jpg', label: 'Snowy Day' },
    { id: 'hero-bg-night', src: '../../assets/hero-bg-night.jpg', label: 'Starry Night' }
  ];

  const BANNER_PREF_KEY = 'os-odyssey-profile-banner';

  /* ---- Helpers ---- */
  const $id = id => document.getElementById(id);

  function calculateLevel(xp) {
    return Math.max(1, Math.floor(Number(xp || 0) / 20));
  }

  function calculateRank(level) {
    if (level >= 75) return 'Gold';
    if (level >= 30) return 'Silver';
    return 'Bronze';
  }

  /* ---- Wait for Supabase auth, then populate ---- */
  async function initProfile() {
    // Guard: only run on profile page
    if (!$id('profUsername')) return;

    // Rebuild module list from main.js globals (main.js runs first per script order)
    MODULES = buildModuleList();
    TOTAL_MODULES = MODULES.length;
    TOTAL_TOPICS = MODULES.reduce((s, m) => s + m.topics, 0);

    // Apply saved banner immediately (before auth loads)
    applySavedBanner();
    setupBannerPicker();

    try {
      const { data: { session } } = await supa.auth.getSession();
      if (!session) {
        window.location.href = 'login.html';
        return;
      }

      const { data: user, error } = await supa
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single();

      if (error || !user) {
        console.error('Profile fetch error:', error);
        return;
      }

      const level = calculateLevel(user.xp);
      const rank = calculateRank(level);
      const completed = user.completed_modules || [];

      renderHeader(user, level, rank);
      renderStats(user, level, rank);
      renderXpProgress(user.xp, level);
      renderOverview(completed);
      renderModuleCards(completed);
      renderModulesList(completed);
      renderBadges(user.earned_badges || []);

    } catch (e) {
      console.error('Profile init error:', e);
    }
  }

  /* ---- Header ---- */
  function renderHeader(user, level, rank) {
    $id('profUsername').textContent = user.username || 'Kernel Cadet';
    $id('profLevel').textContent = `Level ${level} · ${rank}`;

    // Join date
    if (user.created_at) {
      const d = new Date(user.created_at);
      $id('profJoinDate').textContent = `Joined ${d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`;
    }

    // Avatar
    const avatarImg = $id('profAvatarImg');
    if (user.avatar && user.avatar !== 'computer') {
      avatarImg.src = user.avatar;
      avatarImg.alt = user.character || 'Avatar';
    }

    // Setup username editor
    setupUsernameEditor(user.username || '');
  }

  /* ---- Username Editor ---- */
  function setupUsernameEditor(currentName) {
    const renameBtn = $id('profRenameBtn');
    if (!renameBtn) return;

    renameBtn.addEventListener('click', () => openUsernameEditor(currentName));
  }

  function openUsernameEditor(currentName) {
    const usernameRow = document.querySelector('.prof-username-row');
    if (!usernameRow || usernameRow.querySelector('.prof-rename-editor')) return;

    const h1 = $id('profUsername');
    const renameBtn = $id('profRenameBtn');
    h1.style.display = 'none';
    renameBtn.style.display = 'none';

    const editor = document.createElement('div');
    editor.className = 'prof-rename-editor';
    editor.innerHTML = `
      <input type="text" class="prof-rename-input" value="${currentName}" maxlength="20" placeholder="Enter username" autofocus />
      <button class="prof-rename-save" type="button">Save</button>
      <button class="prof-rename-cancel" type="button">Cancel</button>
    `;
    usernameRow.appendChild(editor);

    const statusEl = document.createElement('p');
    statusEl.className = 'prof-rename-status';
    usernameRow.parentElement.insertBefore(statusEl, usernameRow.nextSibling);

    const input = editor.querySelector('.prof-rename-input');
    const saveBtn = editor.querySelector('.prof-rename-save');
    const cancelBtn = editor.querySelector('.prof-rename-cancel');

    input.focus();
    input.select();

    function closeEditor() {
      editor.remove();
      statusEl.remove();
      h1.style.display = '';
      renameBtn.style.display = '';
    }

    cancelBtn.addEventListener('click', closeEditor);

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeEditor();
      if (e.key === 'Enter') saveUsername();
    });

    async function saveUsername() {
      const newName = input.value.trim();
      if (!newName) {
        statusEl.textContent = 'Username cannot be empty';
        statusEl.className = 'prof-rename-status error';
        return;
      }
      if (newName === currentName) {
        closeEditor();
        return;
      }

      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving...';
      statusEl.textContent = '';

      try {
        const { data: { session } } = await supa.auth.getSession();
        if (!session) return;

        const { error } = await supa
          .from('profiles')
          .update({ username: newName })
          .eq('id', session.user.id);

        if (error) {
          statusEl.textContent = 'Failed to save. Try again.';
          statusEl.className = 'prof-rename-status error';
          saveBtn.disabled = false;
          saveBtn.textContent = 'Save';
          return;
        }

        // Success — update UI
        h1.textContent = newName;
        currentName = newName;
        closeEditor();

        // Brief success flash
        const flash = document.createElement('p');
        flash.className = 'prof-rename-status success';
        flash.textContent = 'Username saved!';
        usernameRow.parentElement.insertBefore(flash, usernameRow.nextSibling);
        setTimeout(() => flash.remove(), 2500);

        // Re-bind the edit button with the new name
        const newRenameBtn = $id('profRenameBtn');
        const newBtn = newRenameBtn.cloneNode(true);
        newRenameBtn.parentNode.replaceChild(newBtn, newRenameBtn);
        newBtn.id = 'profRenameBtn';
        newBtn.addEventListener('click', () => openUsernameEditor(newName));

      } catch (e) {
        console.error('Username update error:', e);
        statusEl.textContent = 'Error saving username';
        statusEl.className = 'prof-rename-status error';
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save';
      }
    }

    saveBtn.addEventListener('click', saveUsername);
  }

  /* ---- Stats ---- */
  function renderStats(user, level, rank) {
    $id('profXp').textContent = user.xp || 0;
    $id('profRank').textContent = rank;
    $id('profBadges').textContent = (user.earned_badges || []).length;
    $id('profStreak').textContent = user.streak || 0;
  }

  /* ---- XP Progress Bar ---- */
  function renderXpProgress(xp, level) {
    const xpNum = Number(xp || 0);
    const levelXp = level * 20;
    const nextLevelXp = (level + 1) * 20;
    const progress = ((xpNum - levelXp) / 20) * 100;

    $id('profLevelNum').textContent = level;
    $id('profNextLevel').textContent = level + 1;
    $id('profXpCurrent').textContent = xpNum;
    $id('profXpNeeded').textContent = nextLevelXp;

    // Animate bar after short delay
    setTimeout(() => {
      $id('profXpFill').style.width = Math.max(0, Math.min(100, progress)) + '%';
    }, 300);
  }

  /* ---- Overview ---- */
  function renderOverview(completed) {
    const count = completed.length;
    const pct = Math.round((count / TOTAL_MODULES) * 100);

    $id('profCompletedPct').textContent = pct + '%';
    $id('profModulesCompleted').textContent = count;
    $id('profTotalModules').textContent = TOTAL_MODULES;
    $id('profTotalTopics').textContent = TOTAL_TOPICS;

    // Animate ring
    const circumference = 2 * Math.PI * 52; // r=52
    const offset = circumference - (pct / 100) * circumference;
    setTimeout(() => {
      $id('profRingFill').style.strokeDashoffset = offset;
    }, 400);

    // Color the ring percentage
    if (pct === 100) {
      $id('profCompletedPct').style.color = '#22c55e';
    } else if (pct > 0) {
      $id('profCompletedPct').style.color = '#f5a623';
    }
  }

  /* ---- Module Cards (Overview tab) ---- */
  function renderModuleCards(completed) {
    const grid = $id('profModuleGrid');
    if (!grid) return;

    grid.innerHTML = MODULES.map(m => {
      const done = completed.includes(m.id);
      return `
        <div class="prof-module-card ${done ? 'completed' : ''}">
          <div class="prof-mc-header">
            <span class="prof-mc-chip">${m.number}</span>
            <span class="prof-mc-status ${done ? 'done' : 'pending'}">${done ? '✓ Completed' : 'In Progress'}</span>
          </div>
          <h3>${m.title}</h3>
          <div class="prof-mc-meta">
            <span><strong>${m.topics}</strong> topics</span>
            <span><strong>${m.quizQuestions}</strong> quiz questions</span>
          </div>
          <div class="prof-mc-bar">
            <div class="prof-mc-fill ${done ? 'done' : 'pending'}" style="width:${done ? 100 : 0}%"></div>
          </div>
        </div>
      `;
    }).join('');

    // Animate bars
    setTimeout(() => {
      grid.querySelectorAll('.prof-mc-fill.pending').forEach(bar => {
        bar.style.width = '15%'; // show a little progress for "in progress"
      });
    }, 500);
  }

  /* ---- Modules List (Modules tab) ---- */
  function renderModulesList(completed) {
    const list = $id('profModulesList');
    if (!list) return;

    list.innerHTML = MODULES.map(m => {
      const done = completed.includes(m.id);
      return `
        <a href="dashboard.html#${m.id}" class="prof-mod-row">
          <span class="prof-mod-num">${m.number}</span>
          <span class="prof-mod-title">${m.title}</span>
          <span class="prof-mod-topics">${m.topics} topics</span>
          <span class="prof-mod-badge ${done ? 'done' : 'pending'}">${done ? '✓ Completed' : 'Start →'}</span>
        </a>
      `;
    }).join('');
  }

  /* ---- Badges Grid (Badges tab) ---- */
  function renderBadges(earnedBadgeIds) {
    const grid = $id('profBadgesGrid');
    if (!grid) return;

    const badgeDefs = window.OS_ODYSSEY_BADGE_DEFS || [];
    if (badgeDefs.length === 0) {
      grid.innerHTML = '<p class="sim-empty-msg">Badge definitions not loaded.</p>';
      return;
    }

    grid.innerHTML = badgeDefs.map(badge => {
      const earned = earnedBadgeIds.includes(badge.id);
      return `
        <div class="prof-badge-card ${earned ? 'earned' : 'locked'}" style="--badge-color: ${badge.color}">
          <div class="prof-badge-icon ${earned ? 'earned' : ''}" style="${earned ? `background: ${badge.color}22; border-color: ${badge.color}` : ''}">
            ${badge.icon}
          </div>
          <h4 class="prof-badge-name" style="${earned ? `color: ${badge.color}` : ''}">${badge.name}</h4>
          <p class="prof-badge-desc">${badge.desc}</p>
          <span class="prof-badge-status ${earned ? 'earned' : 'locked'}">
            ${earned ? '✓ Earned' : '🔒 Locked'}
          </span>
        </div>
      `;
    }).join('');
  }

  /* ---- Tab Switching ---- */
  document.querySelectorAll('.prof-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.prof-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.prof-tab-content').forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      const target = $id('profTab-' + tab.dataset.profTab);
      if (target) {
        target.classList.add('active');
        // Re-trigger animation
        target.style.animation = 'none';
        void target.offsetWidth;
        target.style.animation = '';
      }
    });
  });

  /* ============================================================
     BANNER BACKGROUND PICKER
     ============================================================ */

  function applySavedBanner() {
    const saved = localStorage.getItem(BANNER_PREF_KEY);
    const bannerBg = $id('profBannerBg');
    if (!bannerBg) return;

    const chosen = BANNER_BG_OPTIONS.find(b => b.id === saved) || BANNER_BG_OPTIONS[0];
    bannerBg.style.background = `
      linear-gradient(135deg, rgba(32,167,255,0.18) 0%, rgba(138,241,255,0.06) 40%, rgba(245,166,35,0.08) 100%),
      url('${chosen.src}') center / cover
    `;
  }

  function setupBannerPicker() {
    const changeBtn = $id('changeBannerBtn');
    if (!changeBtn) return;

    changeBtn.addEventListener('click', openBannerPicker);
  }

  function openBannerPicker() {
    // Don't open twice
    if (document.querySelector('.prof-bg-picker-overlay')) return;

    const currentId = localStorage.getItem(BANNER_PREF_KEY) || BANNER_BG_OPTIONS[0].id;

    const overlay = document.createElement('div');
    overlay.className = 'prof-bg-picker-overlay';
    overlay.innerHTML = `
      <div class="prof-bg-picker-backdrop"></div>
      <div class="prof-bg-picker">
        <button class="prof-bg-picker-close" type="button" aria-label="Close">×</button>
        <h3>Choose Banner Background</h3>
        <p class="prof-bg-picker-sub">Pick a background image for your profile banner.</p>
        <div class="prof-bg-grid">
          ${BANNER_BG_OPTIONS.map(bg => `
            <div class="prof-bg-option ${bg.id === currentId ? 'selected' : ''}"
                 data-bg-id="${bg.id}"
                 style="background-image: url('${bg.src}')">
              <span class="prof-bg-option-label">${bg.label}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    // Close handlers
    const closeBtn = overlay.querySelector('.prof-bg-picker-close');
    const backdrop = overlay.querySelector('.prof-bg-picker-backdrop');

    function close() {
      overlay.style.opacity = '0';
      overlay.style.transition = 'opacity 0.2s ease';
      setTimeout(() => overlay.remove(), 220);
    }

    closeBtn.addEventListener('click', close);
    backdrop.addEventListener('click', close);

    // Select handler
    overlay.querySelectorAll('.prof-bg-option').forEach(opt => {
      opt.addEventListener('click', () => {
        const bgId = opt.dataset.bgId;

        // Update selection visually
        overlay.querySelectorAll('.prof-bg-option').forEach(o => o.classList.remove('selected'));
        opt.classList.add('selected');

        // Save and apply
        localStorage.setItem(BANNER_PREF_KEY, bgId);
        applySavedBanner();

        // Close after brief delay
        setTimeout(close, 350);
      });
    });
  }

  /* ---- Init ---- */
  initProfile();

})();
