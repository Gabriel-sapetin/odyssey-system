/**
 * Odyssey — Student Classroom UI
 * ─────────────────────────────────────────────────────────────
 * Responsive classroom views with course outline navigation,
 * modules with nested quizzes, integrated PDF viewer with module
 * assessment placed directly underneath the PDF, and 1-attempt guard.
 */
(function () {
  'use strict';

  const BACKEND_API = 'https://os-odyssey-api.onrender.com/api';
  let currentClassroomId = null;
  let classroomData = null;
  let modulesList = [];
  let quizzesList = [];
  let viewedModuleIds = new Set();
  let currentLessonIndex = -1;
  let currentModuleId = null;
  let currentQuizAnswers = {};
  let currentQuizQuestions = [];
  let currentQuizQuestionIndex = 0;

  async function getSession() {
    const { data: { session } } = await supa.auth.getSession();
    return session;
  }

  async function api(method, path, body = null) {
    const session = await getSession();
    if (!session) return null;
    const opts = {
      method,
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
    };
    if (body) opts.body = JSON.stringify(body);
    try {
      const res = await fetch(`${BACKEND_API}${path}`, opts);
      if (!res.ok) {
        const text = await res.text();
        try { return { error: JSON.parse(text).detail || text }; } catch { return { error: text }; }
      }
      return await res.json();
    } catch (err) { return { error: err.message }; }
  }

  /* ── Init ──────────────────────────────────── */
  async function init() {
    const session = await getSession();
    if (!session) { window.location.href = 'login.html'; return; }

    setupEvents();
    loadClassrooms();
  }

  /* ── Events ────────────────────────────────── */
  function setupEvents() {
    // Join classroom
    document.getElementById('joinClassBtn')?.addEventListener('click', joinClassroom);
    document.getElementById('joinCodeInput')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') joinClassroom();
    });

    // Back to class list from shell header
    document.getElementById('backToStudentClasses')?.addEventListener('click', () => {
      hide('studentClassDetail');
      show('studentClassList');
      document.body.dataset.classroomView = 'list';
      currentClassroomId = null;
      loadClassrooms();
    });

    // Leave classroom
    document.getElementById('leaveClassBtn')?.addEventListener('click', async () => {
      if (!currentClassroomId) return;
      if (!confirm('Leave this classroom? You can rejoin with the code later.')) return;

      const data = await api('DELETE', `/classrooms/${currentClassroomId}/leave`);
      if (data && !data.error) {
        toast('Left classroom.', 'success');
        hide('studentClassDetail');
        show('studentClassList');
        document.body.dataset.classroomView = 'list';
        currentClassroomId = null;
        loadClassrooms();
      } else {
        toast(data?.error || 'Failed to leave.', 'error');
      }
    });

    document.getElementById('leaveClassMenuBtn')?.addEventListener('click', () => {
      document.getElementById('classroomMoreMenu')?.setAttribute('hidden', '');
      document.getElementById('classroomMoreToggle')?.setAttribute('aria-expanded', 'false');
      document.getElementById('leaveClassBtn')?.click();
    });
    document.getElementById('classroomMoreToggle')?.addEventListener('click', () => {
      const toggle = document.getElementById('classroomMoreToggle');
      const menu = document.getElementById('classroomMoreMenu');
      if (!toggle || !menu) return;
      const open = menu.hidden;
      menu.hidden = !open;
      toggle.setAttribute('aria-expanded', String(open));
    });
    document.addEventListener('click', event => {
      const menu = document.getElementById('classroomMoreMenu');
      const toggle = document.getElementById('classroomMoreToggle');
      if (menu && !menu.hidden && !menu.contains(event.target) && !toggle?.contains(event.target)) {
        menu.hidden = true;
        toggle?.setAttribute('aria-expanded', 'false');
      }
    });
    document.addEventListener('keydown', event => {
      const menu = document.getElementById('classroomMoreMenu');
      const toggle = document.getElementById('classroomMoreToggle');
      if (event.key === 'Escape' && menu && !menu.hidden) {
        menu.hidden = true;
        toggle?.setAttribute('aria-expanded', 'false');
        toggle?.focus();
      }
    });

    // Sidebar tabs: Outline vs Resources
    document.getElementById('sidebarTabOutline')?.addEventListener('click', () => switchSidebarTab('outline'));
    document.getElementById('sidebarTabResources')?.addEventListener('click', () => switchSidebarTab('resources'));

    // Top shell nav tabs
    document.getElementById('navOutlineTab')?.addEventListener('click', () => {
      switchSidebarTab('outline');
      showCanvasView('hub');
    });
    document.getElementById('navResourcesTab')?.addEventListener('click', () => {
      switchSidebarTab('resources');
      showCanvasView('hub');
    });

    // Sidebar search filter
    document.getElementById('sidebarSearchInput')?.addEventListener('input', (e) => {
      filterSidebar(e.target.value.toLowerCase().trim());
    });

    document.getElementById('quizQuestionsContainer')?.addEventListener('keydown', event => {
      const container = event.currentTarget;
      if (event.target.matches('input, textarea, select, [contenteditable="true"]')) return;
      const question = event.target.closest('.quiz-question-card') || container.querySelector('.quiz-question-card');
      if (!question) return;
      const options = Array.from(question.querySelectorAll('.quiz-option'));
      if (!options.length) return;
      const focusedIndex = options.indexOf(document.activeElement);
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const nextIndex = focusedIndex < 0
          ? 0
          : (focusedIndex + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
        options[nextIndex].focus();
        return;
      }
      if (!/^[a-h]$/i.test(event.key)) return;
      const answerIndex = event.key.toUpperCase().charCodeAt(0) - 65;
      if (options[answerIndex]) {
        event.preventDefault();
        options[answerIndex].focus();
        options[answerIndex].click();
      }
    });

    let responsiveRenderTimer;
    window.addEventListener('resize', () => {
      window.clearTimeout(responsiveRenderTimer);
      responsiveRenderTimer = window.setTimeout(() => {
        const detail = document.getElementById('studentClassDetail');
        if (classroomData && detail && detail.style.display !== 'none') renderClassroomHub();
      }, 120);
    }, { passive: true });

    // Return to hub from reader/quiz
    document.getElementById('readerBackToHub')?.addEventListener('click', () => showCanvasView('hub'));
    document.getElementById('quizBackToHub')?.addEventListener('click', () => {
      delete document.body.dataset.quizFocus;
      if (currentModuleId) {
        window._openModule(currentModuleId, true);
      } else {
        showCanvasView('hub');
      }
    });

    // Lesson reader Prev/Next navigation
    document.getElementById('prevLessonBtn')?.addEventListener('click', () => {
      if (currentLessonIndex > 0) {
        window._openModule(modulesList[currentLessonIndex - 1].id);
      }
    });
    document.getElementById('nextLessonBtn')?.addEventListener('click', () => {
      if (currentLessonIndex < modulesList.length - 1) {
        window._openModule(modulesList[currentLessonIndex + 1].id);
      } else {
        showCanvasView('hub');
      }
    });

    // Submit quiz
    document.getElementById('submitQuizBtn')?.addEventListener('click', submitQuiz);
    document.getElementById('quizPreviousBtn')?.addEventListener('click', () => window._moveQuizQuestion(-1));
    document.getElementById('quizNextBtn')?.addEventListener('click', () => window._moveQuizQuestion(1));
  }

  /* ── Join Classroom ────────────────────────── */
  async function joinClassroom() {
    const input = document.getElementById('joinCodeInput');
    const feedback = document.getElementById('joinFeedback');
    const code = input.value.trim().toUpperCase();

    if (!code || code.length < 4) {
      feedback.textContent = 'Please enter a valid join code.';
      feedback.style.color = '#f87171';
      return;
    }

    feedback.textContent = 'Joining…';
    feedback.style.color = 'var(--accent, #f5a623)';

    const data = await api('POST', '/classrooms/join', { join_code: code });

    if (data && !data.error) {
      if (data.already_enrolled) {
        feedback.textContent = 'You are already enrolled in this classroom.';
        feedback.style.color = '#60a5fa';
      } else {
        feedback.textContent = data.message;
        feedback.style.color = '#4ade80';
        input.value = '';
        loadClassrooms();
      }
    } else {
      feedback.textContent = data?.error || 'Failed to join.';
      feedback.style.color = '#f87171';
    }
  }

  /* ── Classroom List ────────────────────────── */
  async function loadClassrooms() {
    const grid = document.getElementById('studentClassroomGrid');
    grid.innerHTML = '<div class="admin-loading"><div class="admin-spinner"></div></div>';

    const data = await api('GET', '/classrooms/');
    if (!data || data.error) {
      grid.innerHTML = '<div class="admin-empty"><div class="empty-text">Failed to load classrooms</div></div>';
      return;
    }

    if (!data.classrooms || data.classrooms.length === 0) {
      grid.innerHTML = '<div class="admin-empty"><div class="empty-text">You haven\'t joined any classrooms yet.<br>Enter a join code above to get started!</div></div>';
      return;
    }

    // Older API deployments omit professor details for the professor's own
    // class list. Hydrate owned cards from the signed-in user's own profile so
    // the owner never sees the placeholder name or zeroed profile stats.
    try {
      const session = await getSession();
      if (session) {
        const { data: ownProfile } = await supa
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .maybeSingle();
        if (ownProfile) {
          const savedBanner = ownProfile.profile_banner || localStorage.getItem('os-odyssey-profile-banner');
          data.classrooms.forEach(classroom => {
            if (String(classroom.professor_id) !== String(session.user.id)) return;
            classroom.professor_username = ownProfile.username || classroom.professor_username;
            classroom.professor_avatar = ownProfile.avatar || classroom.professor_avatar;
            classroom.professor_character = ownProfile.character || classroom.professor_character;
            classroom.professor_xp = ownProfile.xp ?? classroom.professor_xp;
            classroom.professor_level = ownProfile.level ?? classroom.professor_level;
            classroom.professor_banner = savedBanner || classroom.professor_banner;
          });
        }
      }
    } catch (error) {
      console.warn('Could not load the current professor profile for classroom cards:', error);
    }

    const classroomColors = ['#6757dc', '#e56a32', '#159b75', '#3478c5', '#c34e83'];
    grid.innerHTML = data.classrooms.map((c, index) => {
      // Only accept a CSS hex color from classroom data; avoid injecting arbitrary inline styles.
      const accent = /^#[\da-f]{3}(?:[\da-f]{3})?$/i.test(c.theme_color || '')
        ? c.theme_color
        : classroomColors[index % classroomColors.length];
      const avatar = c.professor_avatar || '../../assets/penguin-flower-removebg-preview.png';
      const professorFace = avatar === 'computer'
        ? '<span class="computer-avatar mini" aria-hidden="true"><span class="screen-face"></span></span>'
        : `<img src="${esc(avatar).replace(/\"/g, '&quot;')}" alt="${esc(c.professor_username || 'Professor')}" loading="lazy" />`;
      const banner = (window.ODYSSEY_PROFILE_BANNER_OPTIONS || [])
        .find(option => option.id === c.professor_banner)
        || (window.ODYSSEY_PROFILE_BANNER_OPTIONS || [])[0]
        || { src: '../../assets/bg-mountains-purple.jpg' };
      const professorLevel = Number(c.professor_level) || 1;
      const professorXp = Number(c.professor_xp) || 0;
      return `
        <button class="classroom-card" type="button" onclick="window._openStudentClass('${c.id}')" style="--class-accent:${accent}" aria-label="Open ${esc(c.name)} classroom">
          <span class="classroom-card-content">
            <span class="classroom-card-subject">${esc(c.subject || 'General')}</span>
            <strong class="classroom-card-title">${esc(c.name)}</strong>
            ${c.description ? `<span class="classroom-card-desc">${esc(c.description)}</span>` : ''}
            <span class="classroom-meta">
              <span>Prof. ${esc(c.professor_username || 'Unknown')}</span>
              <span>${Number(c.member_count) || 0} students</span>
            </span>
            <span class="classroom-card-open">Open classroom</span>
          </span>
          <span class="classroom-professor-panel" aria-label="Professor ${esc(c.professor_username || 'Unknown')}, level ${professorLevel}, ${professorXp} XP">
            <span class="classroom-professor-banner" style="background-image:url('${esc(banner.src).replace(/\"/g, '&quot;')}')"></span>
            <span class="classroom-professor-summary">
              <span class="classroom-professor-avatar">${professorFace}</span>
              <span class="classroom-professor-name">${esc(c.professor_username || 'Professor')}</span>
            </span>
            <span class="classroom-professor-stats">
              <span><small>LEVEL</small><strong>${professorLevel}</strong></span>
              <span><small>XP</small><strong>${professorXp.toLocaleString()}</strong></span>
            </span>
          </span>
        </button>
      `;
    }).join('');
  }

  /* ── Find Quiz For Module Helper ───────────── */
  function findQuizForModule(moduleId) {
    if (!moduleId) return null;
    const targetMod = modulesList.find(m => m.id === moduleId);
    if (!targetMod) return null;

    // 1. Direct module_id foreign key
    let q = quizzesList.find(quiz => quiz.module_id === moduleId);
    if (q) return q;

    // 2. Normalized title match
    const modTitle = targetMod.title.toLowerCase().trim();
    q = quizzesList.find(quiz => {
      const cleanQuizTitle = quiz.title.replace(/^quiz:\s*/i, '').toLowerCase().trim();
      return cleanQuizTitle === modTitle || cleanQuizTitle.includes(modTitle) || modTitle.includes(cleanQuizTitle);
    });
    if (q) return q;

    // 3. Match by order index if equal counts
    const modIdx = modulesList.findIndex(m => m.id === moduleId);
    if (modIdx !== -1 && quizzesList[modIdx] && !quizzesList[modIdx].module_id) {
      return quizzesList[modIdx];
    }
    return null;
  }

  /* ── Open Classroom ─────────────────────────────────────── */
  window._openStudentClass = async function (id) {
    currentClassroomId = id;
    hide('studentClassList');
    show('studentClassDetail');

    // Load saved viewed lessons for this classroom from localStorage
    try {
      const saved = localStorage.getItem(`odyssey_viewed_${id}`);
      viewedModuleIds = saved ? new Set(JSON.parse(saved)) : new Set();
    } catch { viewedModuleIds = new Set(); }

    // Fetch classroom info, modules, and quizzes in parallel
    const [classRes, modRes, quizRes] = await Promise.all([
      api('GET', `/classrooms/${id}`),
      api('GET', `/classrooms/${id}/modules`),
      api('GET', `/classrooms/${id}/quizzes`)
    ]);

    if (!classRes || !classRes.classroom) {
      toast('Failed to load classroom.', 'error');
      return;
    }

    classroomData = classRes.classroom;
    document.body.dataset.classroomView = 'hub';
    document.body.dataset.classroomLibraryView = 'outline';
    modulesList = modRes?.modules || [];
    quizzesList = quizRes?.quizzes || [];

    // Header info
    document.getElementById('studentClassDetailName').textContent = classroomData.name;
    document.getElementById('studentClassDetailMeta').textContent =
      `By ${classroomData.professor_username || 'Instructor'} · ${classroomData.member_count || 0} students`;

    // Expose classroom ID for the AI chat widget
    window.__odysseyClassroomId = classroomData.id || null;
    window.__odysseyClassroomSubject = classroomData.subject || 'General';
    window.__odysseyClassroomPersona = classroomData.ai_persona || 'Odyssey Mentor';

    // Render components
    renderSidebarOutline();
    renderSidebarResources();
    switchSidebarTab('outline');
    renderClassroomHub();
    showCanvasView('hub');
  };

  /* ── Sidebar Tab Management ────────────────── */
  function switchSidebarTab(tab) {
    const outlineBtn = document.getElementById('sidebarTabOutline');
    const resBtn = document.getElementById('sidebarTabResources');
    const navOutline = document.getElementById('navOutlineTab');
    const navRes = document.getElementById('navResourcesTab');
    const workspace = document.getElementById('classroomWorkspace');
    if (workspace) workspace.dataset.libraryView = tab;
    document.body.dataset.classroomLibraryView = tab;

    if (tab === 'outline') {
      outlineBtn?.classList.add('active');
      resBtn?.classList.remove('active');
      navOutline?.classList.add('active');
      navRes?.classList.remove('active');
      show('sidebarOutlineList');
      hide('sidebarResourcesList');
    } else {
      resBtn?.classList.add('active');
      outlineBtn?.classList.remove('active');
      navRes?.classList.add('active');
      navOutline?.classList.remove('active');
      show('sidebarResourcesList');
      hide('sidebarOutlineList');
    }
  }

  /* ── Render Sidebar Outline (Nested Modules & Quizzes) ── */
  function renderSidebarOutline() {
    const list = document.getElementById('sidebarOutlineList');
    if (!list) return;

    if (modulesList.length === 0) {
      list.innerHTML = '<div style="padding:1.5rem;text-align:center;color:#64748b;font-size:0.85rem;">No modules available yet.</div>';
      return;
    }

    let html = '';

    modulesList.forEach((m, idx) => {
      const hasPdf = m.file_url && m.file_name;
      const isViewed = viewedModuleIds.has(m.id);
      const quiz = findQuizForModule(m.id);

      const isCompleted = isViewed && (!quiz || Boolean(quiz.last_attempt));
      const checkText = String(idx + 1);
      const circleClass = isCompleted ? 'outline-badge-circle completed' : 'outline-badge-circle';
      const badgeText = hasPdf ? 'PDF' : 'NOTES';

      html += `
        <div class="sidebar-module-block" id="sidebar-block-${m.id}">
          <button class="course-outline-item" id="sidebar-mod-${m.id}" type="button" onclick="window._openModule('${m.id}')">
            <span class="${circleClass}">${checkText}</span>
            <div>
              <strong>${esc(m.title)}</strong>
              <em>${hasPdf ? esc(m.file_name) : (m.description ? esc(m.description) : 'Lesson Material')}${quiz ? ' · Includes Quiz' : ''}</em>
            </div>
            <span class="course-outline-badge ${isViewed ? 'completed' : ''}">${badgeText}</span>
          </button>
          ${quiz ? `
            <button class="course-outline-subitem ${quiz.last_attempt ? 'completed' : ''}" id="sidebar-subquiz-${quiz.id}" type="button" onclick="window._openModuleQuiz('${m.id}', '${quiz.id}')" aria-label="${quiz.last_attempt ? 'Review' : 'Take'} quiz: ${esc(quiz.title.replace(/^quiz:\s*/i, ''))}">
              <span class="subitem-title">${quiz.last_attempt ? 'Review quiz' : 'Take Quiz'}</span>
              <span class="subitem-description">${esc(quiz.title.replace(/^quiz:\s*/i, ''))}</span>
              <span class="subitem-badge ${quiz.last_attempt ? 'completed' : ''}">
                ${quiz.last_attempt ? `${Math.round((quiz.last_attempt.score / quiz.last_attempt.max_score) * 100)}%` : 'QUIZ'}
              </span>
            </button>
          ` : ''}
        </div>
      `;
    });

    list.innerHTML = html;
  }

  /* ── Render Sidebar Resources ──────────────── */
  function renderSidebarResources() {
    const list = document.getElementById('sidebarResourcesList');
    if (!list) return;

    const resourceModules = modulesList.filter(m => m.file_url || m.content || m.description);

    if (resourceModules.length === 0) {
      list.innerHTML = '<div class="classroom-resource-empty">Your instructor has not added any materials yet.</div>';
      return;
    }

    list.innerHTML = resourceModules.map((m, index) => {
      const fileName = m.file_name || 'Lesson notes';
      const ext = m.file_name?.split('?')[0].split('.').pop().toUpperCase() || 'NOTES';
      const quiz = findQuizForModule(m.id);
      return `
        <article class="classroom-resource-row">
          <span class="classroom-resource-type">${esc(ext)}</span>
          <span class="classroom-resource-copy">
            <strong>${esc(m.title || `Material ${index + 1}`)}</strong>
            <span>${esc(fileName)}${quiz ? ' · Quiz available' : ''}</span>
          </span>
          <span class="classroom-resource-actions">
            <button class="classroom-resource-open" type="button" onclick="window._openModule('${m.id}')">Open material</button>
            ${m.file_url ? `<button class="classroom-resource-download" type="button" onclick="window._downloadPdfFile(this, '${m.file_url}', '${esc(fileName)}')">Download</button>` : ''}
          </span>
        </article>
      `;
    }).join('');
  }

  /* ── Filter Sidebar Items ──────────────────── */
  function filterSidebar(query) {
    document.querySelectorAll('.sidebar-module-block').forEach(el => {
      const text = el.textContent.toLowerCase();
      el.style.display = text.includes(query) ? '' : 'none';
    });
  }

  /* ── Render Classroom Hub (Picture 2 Architecture) ──── */
  function renderClassroomHub() {
    document.getElementById('hubCourseTitle').textContent = 'Class modules';
    document.getElementById('hubCourseDesc').textContent =
      classroomData.description || 'Welcome to this classroom. Review the available lessons and materials below, and take the assigned quizzes to assess your understanding.';

    const actionArea = document.getElementById('hubQuickActions');
    if (actionArea) {
      const states = modulesList.map(m => {
        const quiz = findQuizForModule(m.id);
        return { module: m, done: viewedModuleIds.has(m.id) && (!quiz || Boolean(quiz.last_attempt)) };
      });
      if (window.matchMedia('(max-width: 768px)').matches) {
        // Mobile gets one clear launch action for the next unfinished module.
        const nextIndex = states.findIndex(state => !state.done);
        const targetIndex = nextIndex >= 0 ? nextIndex : states.length - 1;
        const target = states[targetIndex];
        if (target) {
          const number = targetIndex + 1;
          const wasViewed = viewedModuleIds.has(target.module.id);
          const action = target.done ? 'Review' : (wasViewed ? 'Continue' : 'Start');
          actionArea.innerHTML = `<button class="lesson-button hub-primary-cta" type="button" aria-label="${action} Module ${number}: ${esc(target.module.title)}" onclick="window._openModule('${target.module.id}')">${action} Module ${number}</button>`;
        } else {
          actionArea.innerHTML = '<span class="hub-empty-state">No modules available yet.</span>';
        }
      } else {
        actionArea.innerHTML = modulesList.map((m, idx) => {
          const quiz = findQuizForModule(m.id);
          const isViewed = viewedModuleIds.has(m.id);
          const isQuizDone = quiz && Boolean(quiz.last_attempt);
          const btnClass = isViewed && isQuizDone ? 'module-completed' : 'secondary';
          const label = isViewed ? `Review Module ${idx + 1}` : `Start Module ${idx + 1}`;
          return `<button class="lesson-button ${btnClass}" type="button" onclick="window._openModule('${m.id}')">${label}</button>`;
        }).join('') || '<p class="hub-empty-state">No modules uploaded yet.</p>';
      }
    }

    // Render "Your Progress" Card (matching Picture 2)
    renderProgressCard();
  }

  /* ── Render "Your Progress" Card ───────────── */
  function renderProgressCard() {
    const card = document.getElementById('classroomProgressCard');
    if (!card) return;

    const totalModules = modulesList.length;
    let completedModulesCount = 0;

    modulesList.forEach(m => {
      const isViewed = viewedModuleIds.has(m.id);
      const quiz = findQuizForModule(m.id);
      if (isViewed && (!quiz || Boolean(quiz.last_attempt))) {
        completedModulesCount++;
      }
    });

    const overallPct = totalModules > 0 ? Math.round((completedModulesCount / totalModules) * 100) : 0;

    if (!window.matchMedia('(max-width: 768px)').matches) {
      const scoredQuizzes = quizzesList.filter(q => q.last_attempt && q.last_attempt.max_score);
      const avgScoreText = scoredQuizzes.length
        ? `${Math.round((scoredQuizzes.reduce((sum, q) => sum + (q.last_attempt.score / q.last_attempt.max_score), 0) / scoredQuizzes.length) * 100)}%`
        : '—';
      const checklistHtml = modulesList.map((m, idx) => {
        const isViewed = viewedModuleIds.has(m.id);
        const quiz = findQuizForModule(m.id);
        const isQuizDone = quiz && Boolean(quiz.last_attempt);
        const isModuleDone = isViewed && (!quiz || isQuizDone);
        const statusText = isModuleDone ? 'Completed' : (isViewed && quiz ? 'Quiz Pending' : 'Pending');
        return `<div class="progress-module-row${isModuleDone ? ' completed' : ''}"><button class="progress-module-open" type="button" aria-label="Open Module ${idx + 1}: ${esc(m.title)}" onclick="window._openModule('${m.id}')"><span class="progress-module-info"><strong>Module ${idx + 1}</strong><em>${esc(m.title)}</em></span><span class="progress-module-status">${statusText}</span></button>${quiz ? `<button class="progress-module-quiz" type="button" onclick="window._openModuleQuiz('${m.id}', '${quiz.id}')">${quiz.last_attempt ? 'Review Quiz' : 'Take Quiz'}</button>` : ''}</div>`;
      }).join('');
      card.innerHTML = `
        <div class="progress-panel-header"><span class="progress-panel-title">Your Progress</span><span class="progress-panel-overall">${overallPct}% Complete</span></div>
        <div class="progress-panel-bar-wrap"><div class="progress-panel-bar" style="width:${overallPct}%"></div></div>
        <div class="progress-panel-stats-row">
          <div class="progress-stat-mini"><span class="progress-stat-num">${completedModulesCount} / ${totalModules}</span><span class="progress-stat-label">Modules Done</span></div>
          <div class="progress-stat-mini"><span class="progress-stat-num">${scoredQuizzes.length} / ${quizzesList.length}</span><span class="progress-stat-label">Quizzes Taken</span></div>
          <div class="progress-stat-mini"><span class="progress-stat-num">${avgScoreText}</span><span class="progress-stat-label">Avg Score</span></div>
        </div>
        ${checklistHtml}
      `;
      return;
    }

    let roadmapHtml = '';
    const currentIndex = modulesList.findIndex(m => {
      const quiz = findQuizForModule(m.id);
      return !(viewedModuleIds.has(m.id) && (!quiz || Boolean(quiz.last_attempt)));
    });

    modulesList.forEach((m, idx) => {
      const isViewed = viewedModuleIds.has(m.id);
      const quiz = findQuizForModule(m.id);
      const isQuizDone = quiz && Boolean(quiz.last_attempt);
      const isModuleDone = isViewed && (!quiz || isQuizDone);

      let statusText = 'Pending';
      if (isModuleDone) {
        statusText = 'Completed';
      } else if (isViewed && quiz && !isQuizDone) {
        statusText = 'Quiz Pending';
      }

      const isCurrent = idx === currentIndex;
      roadmapHtml += `
        <div class="progress-module-row${isModuleDone ? ' completed' : ''}${isCurrent ? ' is-current' : ''}">
          <button class="progress-module-open" type="button"${isCurrent ? ' aria-current="step"' : ''} aria-label="Module ${idx + 1}: ${esc(m.title)}. ${statusText}. Open material." onclick="window._openModule('${m.id}')">
            <span class="progress-module-number" aria-hidden="true">${idx + 1}</span>
            <span class="progress-module-info"><strong>Module ${idx + 1}</strong><em>${esc(m.title)}</em></span>
            <span class="progress-module-status">${statusText}</span>
          </button>
          ${quiz ? `<button class="progress-module-quiz" type="button" onclick="window._openModuleQuiz('${m.id}', '${quiz.id}')">${quiz.last_attempt ? 'Review Quiz' : 'Take Quiz'}</button>` : ''}
        </div>
      `;
    });

    card.innerHTML = `
      <div class="classroom-progress-summary">
        <span>Your progress</span>
        <span class="classroom-progress-track" role="progressbar" aria-label="Classroom module completion" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${overallPct}">
          <span style="width:${overallPct}%"></span>
        </span>
        <strong>${overallPct}%</strong>
      </div>
      <div class="classroom-roadmap" role="group" aria-label="Class modules">
        ${roadmapHtml || '<p class="hub-empty-state">No modules available yet.</p>'}
      </div>
    `;
    card.dataset.completedModules = String(completedModulesCount);
    card.dataset.totalModules = String(totalModules);
  }

  /* ── Show Canvas View ──────────────────────── */
  function showCanvasView(view) {
    document.body.dataset.classroomView = view;
    delete document.body.dataset.quizFocus;
    hide('classroomHubView');
    hide('classroomLessonView');
    hide('classroomQuizView');
    hide('quizReviewScreen');

    // Deselect outline active styles
    document.querySelectorAll('.course-outline-item, .course-outline-subitem').forEach(el => el.classList.remove('active'));

    if (view === 'hub') {
      show('classroomHubView');
    } else if (view === 'lesson') {
      show('classroomLessonView');
    } else if (view === 'quiz') {
      show('classroomQuizView');
    }
  }
  // Result screens use inline navigation buttons; expose the view switcher for them.
  window.showCanvasView = showCanvasView;

  /* ── Open Lesson Reader (with Quiz Underneath PDF) ──── */
  window._openModule = async function (modId, scrollToQuiz = false) {
    currentModuleId = modId;
    const data = await api('GET', `/classrooms/${currentClassroomId}/modules/${modId}`);
    if (!data || !data.module) {
      toast('Failed to load lesson.', 'error');
      return;
    }

    const mod = data.module;
    currentLessonIndex = modulesList.findIndex(m => m.id === modId);

    showCanvasView('lesson');

    // Mark active in sidebar
    document.querySelectorAll('.course-outline-item, .course-outline-subitem').forEach(el => el.classList.remove('active'));
    document.getElementById(`sidebar-mod-${modId}`)?.classList.add('active');

    // Breadcrumb & title
    document.getElementById('lessonBreadcrumb').textContent = `Lesson: ${mod.title}`;
    document.getElementById('lessonViewTitle').textContent = mod.title;

    const typePill = document.getElementById('lessonTypePill');
    const dlBtn = document.getElementById('readerDownloadBtn');
    const tabBtn = document.getElementById('readerOpenTabBtn');
    const contentEl = document.getElementById('lessonViewContent');
    const quizArea = document.getElementById('lessonModuleQuizArea');

    if (mod.file_url) {
      const fileName = mod.file_name || 'lesson.pdf';
      const ext = fileName.split('?')[0].split('.').pop().toLowerCase();
      const isWord = ext === 'docx' || ext === 'doc';
      const isPdf = ext === 'pdf';

      typePill.textContent = isPdf ? 'PDF Document' : isWord ? 'Word Document' : 'Document';
      typePill.style.color = isPdf ? '#ef4444' : '#38bdf8';

      dlBtn.style.display = 'inline-block';
      dlBtn.textContent = isPdf ? 'Download PDF' : 'Download File';
      dlBtn.onclick = () => window._downloadPdfFile(dlBtn, mod.file_url, fileName);

      tabBtn.style.display = 'inline-block';
      tabBtn.href = mod.file_url;

      if (isWord) {
        contentEl.innerHTML = `
          <div class="odyssey-document-toolbar">
            <div style="display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap;">
              <span class="odyssey-document-label">View</span>
              <button type="button" class="admin-btn active-doc-mode" id="studentModePages">Page Layout</button>
              <button type="button" class="admin-btn" id="studentModeGoogle">Google View</button>
              <button type="button" class="admin-btn" id="studentModeOffice">Office View</button>
              <button type="button" class="admin-btn" id="studentModeText">Clean Text</button>
            </div>
            <span class="odyssey-document-label">Document reader</span>
          </div>
          <div id="studentDocCanvas" class="odyssey-document-canvas">
            <div id="studentDocLoading" class="odyssey-document-loading">
              <div class="admin-spinner"></div> Loading document pages
            </div>
            <div id="studentDocWrap" class="odyssey-document-content"></div>
          </div>
        `;

        const btnPages = document.getElementById('studentModePages');
        const btnGoogle = document.getElementById('studentModeGoogle');
        const btnOffice = document.getElementById('studentModeOffice');
        const btnText = document.getElementById('studentModeText');
        const docLoading = document.getElementById('studentDocLoading');
        const docWrap = document.getElementById('studentDocWrap');

        let studentBuffer = null;

        const setStudentActiveBtn = (active) => {
          [btnPages, btnGoogle, btnOffice, btnText].forEach(b => {
            if (!b) return;
            if (b === active) b.classList.add('active-doc-mode');
            else b.classList.remove('active-doc-mode');
          });
        };

        const renderGoogle = () => {
          setStudentActiveBtn(btnGoogle);
          if (docLoading) docLoading.style.display = 'none';
          if (docWrap) {
            docWrap.style.display = 'block';
            docWrap.innerHTML = `<iframe src="https://docs.google.com/viewer?url=${encodeURIComponent(mod.file_url)}&embedded=true" style="width:100%;height:75vh;border:none;background:#fff;" allowfullscreen></iframe>`;
          }
        };

        const renderOffice = () => {
          setStudentActiveBtn(btnOffice);
          if (docLoading) docLoading.style.display = 'none';
          if (docWrap) {
            docWrap.style.display = 'block';
            docWrap.innerHTML = `<iframe src="https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(mod.file_url)}" style="width:100%;height:75vh;border:none;background:#fff;" allowfullscreen></iframe>`;
          }
        };

        const renderText = async () => {
          setStudentActiveBtn(btnText);
          if (docLoading) docLoading.style.display = 'flex';
          if (docWrap) docWrap.style.display = 'none';
          try {
            if (!studentBuffer) {
              const res = await fetch(mod.file_url);
              if (!res.ok) throw new Error();
              studentBuffer = await res.arrayBuffer();
            }
            if (window.mammoth && typeof window.mammoth.convertToHtml === 'function') {
              const res = await window.mammoth.convertToHtml({ arrayBuffer: studentBuffer });
              if (docLoading) docLoading.style.display = 'none';
              if (docWrap) {
                docWrap.style.display = 'block';
                docWrap.innerHTML = `<div class="docx-document-paper" style="margin:1.5rem auto;">${res.value || '<p>Document has no readable text.</p>'}</div>`;
              }
            } else {
              throw new Error('Mammoth unavailable');
            }
          } catch (err) {
            renderGoogle();
          }
        };

        const renderPages = async () => {
          setStudentActiveBtn(btnPages);
          if (docLoading) docLoading.style.display = 'flex';
          if (docWrap) docWrap.style.display = 'none';

          try {
            if (!studentBuffer) {
              const res = await fetch(mod.file_url);
              if (!res.ok) throw new Error();
              studentBuffer = await res.arrayBuffer();
            }

            if (window.docx && typeof window.docx.renderAsync === 'function') {
              if (docWrap) docWrap.innerHTML = '';
              if (docLoading) docLoading.style.display = 'none';
              if (docWrap) {
                docWrap.style.display = 'block';
                await window.docx.renderAsync(studentBuffer, docWrap, null, {
                  inWrapper: true,
                  // Mobile page layouts otherwise preserve the document's fixed
                  // paper width and force students to pan across a tiny page.
                  ignoreWidth: window.matchMedia('(max-width: 768px)').matches,
                  ignoreHeight: false,
                  breakPages: true,
                  experimental: true,
                  useBase64URL: true,
                  renderHeaders: true,
                  renderFooters: true
                });
              }
            } else {
              throw new Error('docx-preview unavailable');
            }
          } catch (err) {
            console.warn('docx-preview fallback:', err);
            renderGoogle();
          }
        };

        if (btnPages) btnPages.onclick = renderPages;
        if (btnGoogle) btnGoogle.onclick = renderGoogle;
        if (btnOffice) btnOffice.onclick = renderOffice;
        if (btnText) btnText.onclick = renderText;

        if (ext === 'doc') {
          if (btnPages) btnPages.style.display = 'none';
          if (btnText) btnText.style.display = 'none';
          renderGoogle();
        } else {
          // Reflow Word content on phones by default. The page-layout mode is
          // still available for documents where exact pagination matters.
          if (window.matchMedia('(max-width: 768px)').matches) renderText();
          else renderPages();
        }
      } else {
        contentEl.innerHTML = `
          <div class="odyssey-pdf-reader">
            <div class="odyssey-pdf-controls" role="group" aria-label="PDF viewing controls">
              <span class="odyssey-pdf-page-count" aria-live="polite">Loading PDF…</span>
              <div>
                <button type="button" class="admin-btn" data-pdf-zoom="out" aria-label="Zoom out">−</button>
                <button type="button" class="admin-btn" data-pdf-zoom="fit">Fit width</button>
                <button type="button" class="admin-btn" data-pdf-zoom="in" aria-label="Zoom in">+</button>
              </div>
            </div>
            <div class="odyssey-document-canvas odyssey-pdf-canvas" id="studentPdfCanvas" aria-label="PDF document pages">
              <div class="odyssey-pdf-pages" id="studentPdfPages"></div>
            </div>
          </div>
        `;

        const pdfCanvas = document.getElementById('studentPdfCanvas');
        const pdfPages = document.getElementById('studentPdfPages');
        const pageCount = contentEl.querySelector('.odyssey-pdf-page-count');
        let pdfDocument = null;
        let pdfZoom = 1;
        let renderFrame = 0;
        let rendering = false;
        let renderAgain = false;
        let pdfPageObserver = null;

        const renderPdfPages = async () => {
          if (!pdfDocument || !pdfPages) return;
          if (rendering) { renderAgain = true; return; }
          rendering = true;
          try {
            const pageGutter = window.matchMedia('(max-width: 768px)').matches ? 16 : 28;
            const availableWidth = Math.max(240, pdfCanvas.clientWidth - pageGutter);
            const outputScale = Math.min(window.devicePixelRatio || 1, 2);
            pdfPageObserver?.disconnect();
            pdfPages.innerHTML = '';
            if (pageCount) pageCount.textContent = `${pdfDocument.numPages} page${pdfDocument.numPages === 1 ? '' : 's'}`;
            const drawPage = async (page, canvas, viewport) => {
              if (canvas.dataset.rendered === 'true') return;
              canvas.dataset.rendered = 'true';
              canvas.width = Math.ceil(viewport.width * outputScale);
              canvas.height = Math.ceil(viewport.height * outputScale);
              const context = canvas.getContext('2d', { alpha: false });
              try {
                await page.render({
                  canvasContext: context,
                  viewport,
                  transform: outputScale === 1 ? null : [outputScale, 0, 0, outputScale, 0, 0]
                }).promise;
              } catch (error) {
                canvas.dataset.rendered = 'false';
                throw error;
              }
            };
            if ('IntersectionObserver' in window) {
              const pageObserver = new IntersectionObserver(entries => {
                entries.forEach(entry => {
                  if (!entry.isIntersecting) return;
                  pageObserver.unobserve(entry.target);
                  drawPage(entry.target._pdfPage, entry.target, entry.target._pdfViewport)
                    .catch(error => console.warn('PDF page render failed:', error));
                });
              }, { root: pdfCanvas, rootMargin: '500px 0px' });
              pdfPageObserver = pageObserver;
            }
            for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber++) {
              const page = await pdfDocument.getPage(pageNumber);
              const baseViewport = page.getViewport({ scale: 1 });
              const scale = (availableWidth / baseViewport.width) * pdfZoom;
              const viewport = page.getViewport({ scale });
              const pageNode = document.createElement('section');
              pageNode.className = 'odyssey-pdf-page';
              pageNode.setAttribute('aria-label', `Page ${pageNumber} of ${pdfDocument.numPages}`);
              const canvas = document.createElement('canvas');
              canvas.style.width = `${viewport.width}px`;
              canvas.style.height = `${viewport.height}px`;
              canvas.setAttribute('role', 'img');
              canvas.setAttribute('aria-label', `PDF page ${pageNumber}`);
              canvas._pdfPage = page;
              canvas._pdfViewport = viewport;
              pageNode.appendChild(canvas);
              const accessibleText = await page.getTextContent();
              const textSummary = document.createElement('div');
              textSummary.className = 'odyssey-pdf-accessible-text';
              textSummary.setAttribute('aria-label', `Text from page ${pageNumber}`);
              textSummary.textContent = accessibleText.items
                .map(item => item && typeof item.str === 'string' ? item.str : '')
                .filter(Boolean)
                .join(' ');
              pageNode.appendChild(textSummary);
              pdfPages.appendChild(pageNode);
              if (pdfPageObserver) pdfPageObserver.observe(canvas);
              else await drawPage(page, canvas, viewport);
            }
          } catch (error) {
            console.warn('PDF page rendering failed:', error);
            if (pageCount) pageCount.textContent = 'PDF preview unavailable';
            pdfPages.innerHTML = `<div class="odyssey-pdf-fallback">
              <p>This browser could not preview the PDF here.</p>
              <a class="admin-btn primary" href="${esc(mod.file_url)}" target="_blank" rel="noopener">Open PDF</a>
            </div>`;
          } finally {
            rendering = false;
            if (renderAgain) { renderAgain = false; renderPdfPages(); }
          }
        };

        const schedulePdfRender = () => {
          cancelAnimationFrame(renderFrame);
          renderFrame = requestAnimationFrame(renderPdfPages);
        };

        contentEl.querySelectorAll('[data-pdf-zoom]').forEach(button => {
          button.addEventListener('click', () => {
            const action = button.dataset.pdfZoom;
            pdfZoom = action === 'fit' ? 1 : Math.max(0.75, Math.min(2.5, pdfZoom * (action === 'in' ? 1.2 : 1 / 1.2)));
            schedulePdfRender();
          });
        });

        if (window.ResizeObserver && pdfCanvas) {
          const resizeObserver = new ResizeObserver(schedulePdfRender);
          resizeObserver.observe(pdfCanvas);
        }

        const loadPdf = async () => {
          if (!window.pdfjsLib) throw new Error('PDF.js unavailable');
          if (!window.pdfjsLib.GlobalWorkerOptions.workerSrc) {
            window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
          }
          const loadingTask = window.pdfjsLib.getDocument({ url: mod.file_url });
          pdfDocument = await loadingTask.promise;
          await renderPdfPages();
        };

        loadPdf().catch(error => {
          console.warn('PDF preview failed:', error);
          if (pageCount) pageCount.textContent = 'PDF preview unavailable';
          if (pdfPages) pdfPages.innerHTML = `<div class="odyssey-pdf-fallback">
            <p>Open or download this PDF to view it on your device.</p>
            <a class="admin-btn primary" href="${esc(mod.file_url)}" target="_blank" rel="noopener">Open PDF</a>
          </div>`;
        });
      }
    } else {
      typePill.textContent = 'Lesson Notes';
      typePill.style.color = '#3b82f6';
      dlBtn.style.display = 'none';
      tabBtn.style.display = 'none';

      contentEl.innerHTML = `
        <div style="font-family:'Nunito',sans-serif;font-size:1.05rem;color:#1e293b;line-height:1.8;white-space:pre-wrap;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:2rem;margin-top:1rem;">
          ${esc(mod.content || 'No text content available for this lesson.')}
        </div>
      `;
    }

    // Populate the lesson's assigned quiz section.
    const quiz = findQuizForModule(modId);
    if (quiz) {
      const attempted = quiz.last_attempt;
      const pct = attempted?.max_score ? Math.round((attempted.score / attempted.max_score) * 100) : 0;
      const isAttempted = Boolean(attempted);

      quizArea.innerHTML = `
      <div class="odyssey-assessment-card" id="module-quiz-card-${quiz.id}">
          <div class="assessment-card-header">
            <div class="assessment-kicker">MODULE ASSESSMENT</div>
            <h3 class="assessment-title">${esc(quiz.title)}</h3>
            <p class="assessment-desc">${esc(quiz.description || 'Test your knowledge on this module. Complete the assessment to finalize your grade.')}</p>
            <div class="assessment-meta-tags">
              <span class="meta-tag">${quiz.question_count || 0} Questions</span>
              <span class="meta-tag">${quiz.time_limit_minutes ? `${quiz.time_limit_minutes} Mins` : 'Untimed'}</span>
              <span class="meta-tag">1 Attempt Only</span>
            </div>
          </div>
          <div class="assessment-card-body">
            ${isAttempted ? `
              <div class="assessment-completed-box" style="display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;">
                <div>
                  <div class="score-pill-row">
                    <span class="status-pill-green">COMPLETED</span>
                    <span class="score-text">Total Score: <strong>${attempted.score} / ${attempted.max_score} (${pct}%)</strong></span>
                  </div>
                  <p class="score-policy-msg">Assessment finalized · 1 of 1 attempt used.</p>
                </div>
                <button class="admin-btn secondary" type="button" style="padding:0.6rem 1.4rem;font-weight:700;font-size:0.85rem;" onclick="window._reviewQuiz('${quiz.id}', '${modId}')">
                  Review Quiz
                </button>
              </div>
            ` : `
              <div class="assessment-pending-box">
                <p class="policy-warning">Notice: Exactly 1 attempt is allowed. Once submitted, your score will be recorded permanently.</p>
                <button class="take-quiz-action-btn" type="button" onclick="window._openQuiz('${quiz.id}', '${modId}')">
                  Take Quiz
                </button>
              </div>
            `}
          </div>
        </div>
      `;
    } else {
      quizArea.innerHTML = '';
    }

    // Prev / Next button state
    const prevBtn = document.getElementById('prevLessonBtn');
    const nextBtn = document.getElementById('nextLessonBtn');
    if (prevBtn) prevBtn.disabled = currentLessonIndex <= 0;
    if (nextBtn) {
      nextBtn.textContent = currentLessonIndex < modulesList.length - 1 ? 'Next Lesson' : 'Back to Lessons';
    }

    // Mark as viewed
    if (!viewedModuleIds.has(modId)) {
      viewedModuleIds.add(modId);
      try {
        localStorage.setItem(`odyssey_viewed_${currentClassroomId}`, JSON.stringify([...viewedModuleIds]));
      } catch {}
      renderSidebarOutline();
      renderProgressCard();
    }

    if (scrollToQuiz) {
      setTimeout(() => {
        document.getElementById('lessonModuleQuizArea')?.scrollIntoView({ behavior: 'smooth' });
      }, 250);
    }
  };

  /* ── Open Module Quiz from Subitem ─────────── */
  window._openModuleQuiz = function (modId, quizId) {
    // Quizzes have their own focused view, separate from opening lesson materials.
    window._openQuiz(quizId, modId);
  };

  /* ── Open Quiz Assessment Player ───────────── */
  window._openQuiz = async function (quizId, sourceModuleId = null) {
    if (sourceModuleId) currentModuleId = sourceModuleId;
    currentQuizAnswers = {};

    const data = await api('GET', `/classrooms/${currentClassroomId}/quizzes/${quizId}`);
    if (!data || !data.quiz) {
      toast('Failed to load quiz.', 'error');
      return;
    }

    const quiz = data.quiz;
    const attempted = data.last_attempt || quizzesList.find(q => q.id === quizId)?.last_attempt;

    showCanvasView('quiz');

    // Breadcrumb
    document.getElementById('quizBreadcrumb').textContent = `Assessment: ${quiz.title}`;

    const statusPill = document.getElementById('quizAttemptStatusPill');
    const briefingTitle = document.getElementById('quizBriefingTitle');
    const briefingDesc = document.getElementById('quizBriefingDesc');
    const briefingQuestions = document.getElementById('quizBriefingQuestions');
    const briefingTime = document.getElementById('quizBriefingTime');
    const briefingStatus = document.getElementById('quizBriefingStatus');
    const briefingActions = document.getElementById('quizBriefingActionArea');

    briefingTitle.textContent = quiz.title;
    briefingDesc.textContent = quiz.description || 'Complete this assessment to test your understanding of the covered lessons.';
    briefingQuestions.textContent = (quiz.questions || []).length;
    briefingTime.textContent = quiz.time_limit_minutes ? `${quiz.time_limit_minutes} Mins` : 'Untimed';

    // Check if already attempted (Single Attempt Rule)
    if (attempted || data.already_attempted) {
      const att = attempted || data.last_attempt;
      const pct = att?.max_score ? Math.round((att.score / att.max_score) * 100) : 0;

      statusPill.textContent = 'Completed (1 of 1 attempt used)';
      statusPill.className = 'quiz-status-badge completed';
      briefingStatus.textContent = `Completed (${pct}%)`;

      // Show completed summary card
      briefingActions.innerHTML = `
        <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:1.5rem;text-align:center;">
          <h3 style="color:#16a34a;margin-bottom:0.5rem;font-size:1.2rem;">Assessment Finalized</h3>
          <p style="font-size:1.1rem;font-weight:800;color:#1e293b;margin-bottom:0.5rem;">
            Total Score: ${att.score} / ${att.max_score} (${pct}%)
          </p>
          <p style="font-size:0.85rem;color:#64748b;margin-bottom:1.5rem;">
            You have already used your 1 allowed attempt for this quiz.
          </p>
          <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;">
            <button class="admin-btn secondary" type="button" style="padding:0.75rem 1.8rem;" onclick="window._reviewQuiz('${quizId}', '${currentModuleId}')">Review Quiz</button>
            ${currentModuleId ? `<button class="admin-btn primary" type="button" style="padding:0.75rem 1.8rem;" onclick="window._openModule('${currentModuleId}', true)">Back to Lesson</button>` : ''}
            <button class="admin-btn" type="button" style="padding:0.75rem 1.8rem;" onclick="showCanvasView('hub')">Modules</button>
          </div>
        </div>
      `;

      hide('quizTakingScreen');
      hide('quizResultArea');
      hide('quizReviewScreen');
      show('quizBriefingScreen');
      return;
    }

    // Unattempted: Show "Take Quiz" briefing
    statusPill.textContent = '1 Attempt Allowed';
    statusPill.className = 'quiz-status-badge';
    briefingStatus.textContent = 'Available';

    briefingActions.innerHTML = `
      <button class="admin-btn primary" type="button" style="padding:0.85rem 2.5rem;font-size:0.95rem;" onclick="window._startTakingQuiz('${quizId}')">
        Take Quiz
      </button>
    `;

    hide('quizTakingScreen');
    hide('quizResultArea');
    hide('quizReviewScreen');
    show('quizBriefingScreen');
  };

  /* ── Start Taking Quiz ─────────────────────── */
  window._startTakingQuiz = async function (quizId) {
    const data = await api('GET', `/classrooms/${currentClassroomId}/quizzes/${quizId}`);
    if (!data || !data.quiz) {
      toast('Failed to start quiz.', 'error');
      return;
    }

    const quiz = data.quiz;
    const questions = quiz.questions || [];

    if (questions.length === 0) {
      toast('This quiz has no questions yet.', 'info');
      return;
    }

    hide('quizBriefingScreen');
    show('quizTakingScreen');
    hide('quizResultArea');
    document.body.dataset.quizFocus = 'true';

    currentQuizAnswers = {};
    currentQuizQuestions = questions;
    currentQuizQuestionIndex = 0;
    const submitButton = document.getElementById('submitQuizBtn');
    if (submitButton) submitButton.dataset.quizId = quizId;
    renderActiveQuizQuestion(true);
    updateQuizProgress();
  };

  function renderActiveQuizQuestion(moveFocus = false) {
    const container = document.getElementById('quizQuestionsContainer');
    const question = currentQuizQuestions[currentQuizQuestionIndex];
    if (!container || !question) return;

    const total = currentQuizQuestions.length;
    const position = currentQuizQuestionIndex + 1;
    const selectedAnswer = currentQuizAnswers[question.id];
    const optionLabels = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
    container.innerHTML = `
      <section class="quiz-question-card" role="group" aria-label="Question ${position} of ${total}: ${esc(question.question_text)}">
        <div class="q-number">QUESTION ${position} OF ${total}</div>
        <div class="q-text" tabindex="-1">${esc(question.question_text)}</div>
        <div class="quiz-answer-list" role="group" aria-label="Answer choices">
          ${(question.options || []).map((option, optionIndex) => `
            <button class="quiz-option${selectedAnswer === option ? ' selected' : ''}" type="button" data-qid="${question.id}" data-answer="${esc(option)}" aria-label="Option ${optionLabels[optionIndex] || optionIndex + 1}: ${esc(option)}" aria-pressed="${selectedAnswer === option}" onclick="window._selectAnswer(this)">
              <span class="option-marker">${optionLabels[optionIndex] || optionIndex + 1}</span>
              <span class="quiz-option-text">${esc(option)}</span>
            </button>
          `).join('')}
        </div>
      </section>
    `;

    const previousButton = document.getElementById('quizPreviousBtn');
    const nextButton = document.getElementById('quizNextBtn');
    const submitButton = document.getElementById('submitQuizBtn');
    const isLastQuestion = currentQuizQuestionIndex === total - 1;
    if (previousButton) previousButton.disabled = currentQuizQuestionIndex === 0;
    if (nextButton) nextButton.hidden = isLastQuestion;
    if (submitButton) submitButton.hidden = !isLastQuestion;

    const answeredMeta = document.getElementById('quizAnsweredMeta');
    if (answeredMeta) answeredMeta.textContent = `${Object.keys(currentQuizAnswers).length} answered`;
    const questionMeta = document.getElementById('quizQuestionMeta');
    if (questionMeta) questionMeta.textContent = `Question ${position} of ${total}`;
    if (moveFocus) {
      const questionTitle = container.querySelector('.q-text');
      questionTitle?.focus({ preventScroll: true });
      questionTitle?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  window._moveQuizQuestion = function (offset) {
    const nextIndex = currentQuizQuestionIndex + offset;
    if (nextIndex < 0 || nextIndex >= currentQuizQuestions.length) return;
    currentQuizQuestionIndex = nextIndex;
    renderActiveQuizQuestion(true);
    updateQuizProgress();
  };

  function updateQuizProgress() {
    const total = currentQuizQuestions.length;
    const percent = total ? Math.round(((currentQuizQuestionIndex + 1) / total) * 100) : 0;
    const bar = document.getElementById('quizProgressBar');
    const track = document.getElementById('quizProgressTrack');
    if (bar) bar.style.width = `${percent}%`;
    if (track) track.setAttribute('aria-valuenow', String(percent));
  }

  window._selectAnswer = function (el) {
    const qid = el.dataset.qid;
    const answer = el.dataset.answer;

    el.parentElement.querySelectorAll(`.quiz-option[data-qid="${qid}"]`).forEach(o => {
      o.classList.remove('selected');
      o.setAttribute('aria-pressed', 'false');
    });
    el.classList.add('selected');
    el.setAttribute('aria-pressed', 'true');

    currentQuizAnswers[qid] = answer;
    const answeredMeta = document.getElementById('quizAnsweredMeta');
    if (answeredMeta) answeredMeta.textContent = `${Object.keys(currentQuizAnswers).length} answered`;
    updateQuizProgress();
  };

  /* ── Submit Quiz ───────────────────────────── */
  async function submitQuiz() {
    const quizId = document.getElementById('submitQuizBtn').dataset.quizId;
    if (!quizId) return;

    if (Object.keys(currentQuizAnswers).length === 0) {
      toast('Please answer at least one question.', 'error');
      return;
    }

    const data = await api('POST', `/classrooms/${currentClassroomId}/quizzes/${quizId}/submit`, {
      answers: currentQuizAnswers,
    });

    if (data && !data.error) {
      hide('quizTakingScreen');
      delete document.body.dataset.quizFocus;
      const resultArea = document.getElementById('quizResultArea');
      show('quizResultArea');

      const pct = data.percentage || 0;
      let color = pct >= 80 ? '#16a34a' : pct >= 50 ? '#f59e0b' : '#ef4444';

      // Update quiz record in quizzesList
      const targetQuiz = quizzesList.find(q => q.id === quizId);
      if (targetQuiz) {
        targetQuiz.last_attempt = {
          score: data.score,
          max_score: data.max_score,
          submitted_at: new Date().toISOString()
        };
      }

      resultArea.innerHTML = `
        <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:2.5rem;text-align:center;box-shadow:0 4px 16px rgba(0,0,0,0.06);margin-top:1.5rem;">
          <div style="width:100px;height:100px;border-radius:50%;border:4px solid ${color};display:flex;flex-direction:column;align-items:center;justify-content:center;margin:0 auto 1.5rem;">
            <div style="font-size:1.6rem;font-weight:900;color:${color}">${pct}%</div>
            <div style="font-size:0.65rem;font-weight:800;color:#64748b;">SCORE</div>
          </div>
          <h3 style="font-size:1.3rem;font-weight:800;color:#0f172a;margin-bottom:0.5rem;">
            ${data.score} / ${data.max_score} Correct
          </h3>
          <p style="font-size:0.9rem;color:#64748b;margin-bottom:1.5rem;">
            ${pct >= 80 ? 'Excellent work! Assessment completed successfully.' : pct >= 50 ? 'Good effort! Review the lesson materials.' : 'Assessment completed.'}
          </p>
          <p style="font-size:0.8rem;color:#94a3b8;margin-bottom:2rem;">
            Notice: Only 1 attempt is allowed. Your grade is finalized.
          </p>
          <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;">
            <button class="admin-btn secondary" type="button" style="padding:0.8rem 2.2rem;" onclick="window._reviewQuiz('${quizId}', '${currentModuleId || ''}')">Review Quiz</button>
            ${currentModuleId ? `<button class="admin-btn primary" type="button" style="padding:0.8rem 2.2rem;" onclick="window._openModule('${currentModuleId}', true)">Back to Lesson</button>` : ''}
            <button class="admin-btn" type="button" style="padding:0.8rem 2.2rem;" onclick="showCanvasView('hub')">
              Modules
            </button>
          </div>
        </div>
      `;

      // Clear answers in memory
      currentQuizAnswers = {};

      // Refresh sidebar and progress panel
      renderSidebarOutline();
      renderProgressCard();
    } else {
      toast(data?.error || 'Failed to submit quiz.', 'error');
    }
  }

  /* ── Review Quiz (Read-Only) ────────────────── */
  window._reviewQuiz = async function (quizId, sourceModuleId = null) {
    const targetModId = sourceModuleId || currentModuleId || null;
    showCanvasView('quiz');

    hide('quizBriefingScreen');
    hide('quizTakingScreen');
    hide('quizResultArea');

    const reviewScreen = document.getElementById('quizReviewScreen');
    show('quizReviewScreen');
    reviewScreen.innerHTML = `
      <div style="text-align:center;padding:3rem;color:#64748b;">
        <div style="font-size:1.5rem;margin-bottom:0.5rem;">⏳</div>
        <div>Loading quiz review...</div>
      </div>
    `;

    const data = await api('GET', `/classrooms/${currentClassroomId}/quizzes/${quizId}`);
    if (!data || !data.quiz) {
      toast('Failed to load quiz review.', 'error');
      showCanvasView('hub');
      return;
    }

    const quiz = data.quiz;
    const questions = quiz.questions || [];
    const lastAttempt = data.last_attempt || quizzesList.find(q => q.id === quizId)?.last_attempt || {};
    const studentAnswers = lastAttempt.answers || {};

    const score = lastAttempt.score ?? 0;
    const maxScore = lastAttempt.max_score ?? questions.length;
    const pct = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;

    // Update breadcrumb and status badge
    const breadcrumb = document.getElementById('quizBreadcrumb');
    if (breadcrumb) breadcrumb.textContent = `Review: ${quiz.title}`;

    const statusPill = document.getElementById('quizAttemptStatusPill');
    if (statusPill) {
      statusPill.textContent = 'Review Mode (Read-Only)';
      statusPill.className = 'quiz-status-badge completed';
    }

    const optionLabels = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

    reviewScreen.innerHTML = `
      <div class="quiz-review-header-card">
        <div class="quiz-review-header-left">
          <h3>${esc(quiz.title)} &mdash; Review</h3>
          <p>Completed assessment review &middot; Submitted answers and correct solutions (Read-Only)</p>
        </div>
        <div class="quiz-review-score-pill">
          Score: ${score} / ${maxScore} (${pct}%)
        </div>
      </div>

      ${questions.length === 0 ? `
        <div style="text-align:center;padding:2rem;color:#64748b;">No questions found for this quiz.</div>
      ` : questions.map((q, i) => {
        const studentAns = studentAnswers[q.id] !== undefined ? studentAnswers[q.id] : (studentAnswers[String(q.id)] ?? null);
        const correctAns = q.correct_answer;

        const isAnswered = studentAns !== null && studentAns !== undefined && String(studentAns).trim() !== '';
        const isCorrect = isAnswered && correctAns !== null && correctAns !== undefined &&
          String(studentAns).trim().toLowerCase() === String(correctAns).trim().toLowerCase();

        let verdictHtml = '';
        if (!isAnswered) {
          verdictHtml = '<span class="quiz-review-verdict unanswered">Unanswered</span>';
        } else if (isCorrect) {
          verdictHtml = '<span class="quiz-review-verdict correct">Correct</span>';
        } else {
          verdictHtml = '<span class="quiz-review-verdict incorrect">Incorrect</span>';
        }

        return `
          <div class="quiz-review-question-card">
            <div class="quiz-review-q-top">
              <span class="quiz-review-q-num">QUESTION ${i + 1} OF ${questions.length}</span>
              ${verdictHtml}
            </div>
            <div class="q-text" style="font-size:1.05rem;font-weight:700;color:#0f172a;line-height:1.5;margin-bottom:1.25rem;">
              ${esc(q.question_text)}
            </div>
            <div class="quiz-review-options-list">
              ${(q.options || []).map((opt, oi) => {
                const isStudentPick = isAnswered && String(studentAns).trim().toLowerCase() === String(opt).trim().toLowerCase();
                const isRightAnswer = correctAns !== null && correctAns !== undefined && String(correctAns).trim().toLowerCase() === String(opt).trim().toLowerCase();

                let optClass = 'quiz-review-option';
                let tagHtml = '';

                if (isRightAnswer && isStudentPick) {
                  optClass += ' is-correct';
                  tagHtml = '<span class="quiz-review-tag correct">Your Answer (Correct)</span>';
                } else if (isRightAnswer) {
                  optClass += ' is-correct';
                  tagHtml = '<span class="quiz-review-tag correct">Correct Answer</span>';
                } else if (isStudentPick) {
                  optClass += ' is-wrong-student';
                  tagHtml = '<span class="quiz-review-tag wrong">Your Answer</span>';
                }

                return `
                  <div class="${optClass}">
                    <div style="display:flex;align-items:center;gap:12px;">
                      <span class="option-marker" style="width:26px;height:26px;border-radius:50%;background:#f1f5f9;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:0.75rem;color:#475569;flex-shrink:0;">
                        ${optionLabels[oi] || oi + 1}
                      </span>
                      <span>${esc(opt)}</span>
                    </div>
                    ${tagHtml}
                  </div>
                `;
              }).join('')}
              ${(!q.options || q.options.length === 0) ? `
                <div style="font-size:0.9rem;color:#475569;margin-bottom:8px;">
                  <strong>Your Answer:</strong> ${studentAns ? esc(studentAns) : '<em>No answer submitted</em>'}
                </div>
                ${correctAns ? `
                  <div style="font-size:0.9rem;color:#15803d;margin-bottom:8px;">
                    <strong>Correct Answer:</strong> ${esc(correctAns)}
                  </div>
                ` : ''}
              ` : ''}
            </div>
            ${q.explanation ? `
              <div class="review-explanation-box">
                <strong>Explanation:</strong> ${esc(q.explanation)}
              </div>
            ` : ''}
          </div>
        `;
      }).join('')}

      <div style="display:flex;gap:12px;justify-content:center;margin-top:2rem;margin-bottom:2rem;flex-wrap:wrap;">
        ${targetModId ? `<button class="admin-btn primary" type="button" style="padding:0.8rem 2.2rem;" onclick="window._openModule('${targetModId}', true)">Back to Lesson</button>` : ''}
        <button class="admin-btn" type="button" style="padding:0.8rem 2.2rem;" onclick="showCanvasView('hub')">Modules</button>
      </div>
    `;
  };

  /* ── Download PDF File Helper ──────────────── */
  window._downloadPdfFile = async function (btn, url, fileName) {
    const originalText = btn.innerHTML;
    try {
      btn.innerHTML = '⏳ Downloading...';
      btn.style.pointerEvents = 'none';

      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = fileName || 'module.pdf';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setTimeout(() => URL.revokeObjectURL(blobUrl), 3000);

      btn.innerHTML = '✅ Saved to Device!';
      setTimeout(() => {
        btn.innerHTML = originalText;
        btn.style.pointerEvents = '';
      }, 2000);
    } catch (err) {
      console.warn('Direct blob download failed, falling back:', err);
      btn.innerHTML = originalText;
      btn.style.pointerEvents = '';
      window.open(url, '_blank');
    }
  };

  /* ── View Helpers ──────────────────────────── */
  function show(id) { const el = document.getElementById(id); if (el) el.style.display = ''; }
  function hide(id) { const el = document.getElementById(id); if (el) el.style.display = 'none'; }

  function esc(str) {
    if (!str) return '';
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  function toast(msg, type = 'info') {
    const t = document.getElementById('adminToast');
    if (!t) return;
    t.textContent = msg;
    t.className = `admin-toast ${type} visible`;
    setTimeout(() => t.classList.remove('visible'), 3500);
  }

  /* ── Boot ──────────────────────────────────── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(init, 200));
  } else {
    setTimeout(init, 200);
  }
})();
