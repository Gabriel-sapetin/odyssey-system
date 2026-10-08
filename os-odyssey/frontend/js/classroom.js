/**
 * OS Odyssey — Student Classroom JS (Cisco NetAcad Architecture)
 * ─────────────────────────────────────────────────────────────
 * Cisco NetAcad LMS layout with persistent Course Outline sidebar,
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
        currentClassroomId = null;
        loadClassrooms();
      } else {
        toast(data?.error || 'Failed to leave.', 'error');
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

    // Return to hub from reader/quiz
    document.getElementById('readerBackToHub')?.addEventListener('click', () => showCanvasView('hub'));
    document.getElementById('quizBackToHub')?.addEventListener('click', () => {
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
  }

  /* ── Join Classroom ────────────────────────── */
  async function joinClassroom() {
    const input = document.getElementById('joinCodeInput');
    const feedback = document.getElementById('joinFeedback');
    const code = input.value.trim().toUpperCase();

    if (!code || code.length < 4) {
      feedback.textContent = '❌ Please enter a valid join code.';
      feedback.style.color = '#f87171';
      return;
    }

    feedback.textContent = 'Joining…';
    feedback.style.color = 'rgba(255,255,255,0.5)';

    const data = await api('POST', '/classrooms/join', { join_code: code });

    if (data && !data.error) {
      if (data.already_enrolled) {
        feedback.textContent = 'ℹ️ You are already enrolled in this classroom.';
        feedback.style.color = '#60a5fa';
      } else {
        feedback.textContent = `✅ ${data.message}`;
        feedback.style.color = '#4ade80';
        input.value = '';
        loadClassrooms();
      }
    } else {
      feedback.textContent = `❌ ${data?.error || 'Failed to join.'}`;
      feedback.style.color = '#f87171';
    }
  }

  /* ── Classroom List ────────────────────────── */
  async function loadClassrooms() {
    const grid = document.getElementById('studentClassroomGrid');
    grid.innerHTML = '<div class="admin-loading"><div class="admin-spinner"></div></div>';

    const data = await api('GET', '/classrooms/');
    if (!data || data.error) {
      grid.innerHTML = '<div class="admin-empty"><div class="empty-icon">⚠️</div><div class="empty-text">Failed to load classrooms</div></div>';
      return;
    }

    if (!data.classrooms || data.classrooms.length === 0) {
      grid.innerHTML = '<div class="admin-empty"><div class="empty-icon">🏫</div><div class="empty-text">You haven\'t joined any classrooms yet.<br>Enter a join code above to get started!</div></div>';
      return;
    }

    grid.innerHTML = data.classrooms.map(c => `
      <div class="classroom-card" onclick="window._openStudentClass('${c.id}')">
        <h3>${esc(c.name)}</h3>
        ${c.description ? `<p style="font-size:0.78rem;color:rgba(255,255,255,0.45);margin-top:0.2rem">${esc(c.description)}</p>` : ''}
        <div class="classroom-meta">
          <span>👤 Prof. ${esc(c.professor_username || 'Unknown')}</span>
          <span>👥 ${c.member_count || 0} students</span>
        </div>
      </div>
    `).join('');
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

  /* ── Open Classroom (Cisco NetAcad Architecture) ────────── */
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
    modulesList = modRes?.modules || [];
    quizzesList = quizRes?.quizzes || [];

    // Header info
    document.getElementById('studentClassDetailName').textContent = classroomData.name;
    document.getElementById('studentClassDetailMeta').textContent =
      `Prof. ${classroomData.professor_username || 'Instructor'} · ${classroomData.member_count || 0} students`;

    // Render components
    renderSidebarOutline();
    renderSidebarResources();
    renderClassroomHub();
    showCanvasView('hub');
  };

  /* ── Sidebar Tab Management ────────────────── */
  function switchSidebarTab(tab) {
    const outlineBtn = document.getElementById('sidebarTabOutline');
    const resBtn = document.getElementById('sidebarTabResources');
    const navOutline = document.getElementById('navOutlineTab');
    const navRes = document.getElementById('navResourcesTab');

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
      const checkText = isCompleted ? '✓' : String(idx + 1);
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
            <button class="course-outline-subitem ${quiz.last_attempt ? 'completed' : ''}" id="sidebar-subquiz-${quiz.id}" type="button" onclick="window._openModuleQuiz('${m.id}', '${quiz.id}')">
              <span class="subitem-marker">└</span>
              <span class="subitem-icon">${quiz.last_attempt ? '✓' : 'Q'}</span>
              <span class="subitem-title">Quiz: ${esc(quiz.title.replace(/^quiz:\s*/i, ''))}</span>
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

    const pdfModules = modulesList.filter(m => m.file_url && m.file_name);

    if (pdfModules.length === 0) {
      list.innerHTML = '<div style="padding:1.5rem;text-align:center;color:#64748b;font-size:0.85rem;">No downloadable PDF resources uploaded yet.</div>';
      return;
    }

    list.innerHTML = pdfModules.map(m => `
      <div class="course-outline-item" style="cursor:default">
        <span class="outline-badge-circle">📥</span>
        <div>
          <strong>${esc(m.title)}</strong>
          <em>${esc(m.file_name)}</em>
        </div>
        <button class="admin-btn primary" type="button" style="padding:4px 8px;font-size:0.75rem;" onclick="window._downloadPdfFile(this, '${m.file_url}', '${esc(m.file_name)}')">
          Download
        </button>
      </div>
    `).join('');
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
    document.getElementById('hubCourseTitle').textContent = `${classroomData.name} - Curriculum`;
    document.getElementById('hubCourseDesc').textContent =
      classroomData.description || 'Welcome to this classroom. Review the available lessons and materials below, and take the assigned quizzes to assess your understanding.';

    // Quick Action Launch Buttons per module
    const actionArea = document.getElementById('hubQuickActions');
    let actionsHtml = '';

    modulesList.forEach((m, idx) => {
      const isViewed = viewedModuleIds.has(m.id);
      const quiz = findQuizForModule(m.id);
      const isQuizDone = quiz && Boolean(quiz.last_attempt);

      let label = isViewed ? `✓ Review Module ${idx + 1}` : `Start Module ${idx + 1}`;
      let btnClass = isViewed && isQuizDone ? 'module-completed' : 'secondary';

      actionsHtml += `
        <button class="lesson-button ${btnClass}" type="button" onclick="window._openModule('${m.id}')">${label}</button>
      `;
    });

    actionArea.innerHTML = actionsHtml || '<p style="color:#64748b;font-size:0.9rem;">No modules uploaded yet.</p>';

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

    // Update overall top progress bar
    const topBar = document.getElementById('classroomOverallProgress');
    if (topBar) topBar.style.width = `${overallPct}%`;

    // Compute average score of attempted quizzes
    let avgScoreText = '—';
    const scoredQuizzes = quizzesList.filter(q => q.last_attempt && q.last_attempt.max_score);
    if (scoredQuizzes.length > 0) {
      const sumPct = scoredQuizzes.reduce((acc, q) => acc + (q.last_attempt.score / q.last_attempt.max_score), 0);
      avgScoreText = `${Math.round((sumPct / scoredQuizzes.length) * 100)}%`;
    }

    let checklistHtml = '';

    modulesList.forEach((m, idx) => {
      const isViewed = viewedModuleIds.has(m.id);
      const quiz = findQuizForModule(m.id);
      const isQuizDone = quiz && Boolean(quiz.last_attempt);
      const isModuleDone = isViewed && (!quiz || isQuizDone);

      let statusText = 'Pending';
      let statusColor = '#64748b';

      if (isModuleDone) {
        statusText = '✓ Completed';
        statusColor = '#16a34a';
      } else if (isViewed && quiz && !isQuizDone) {
        statusText = 'Quiz Pending';
        statusColor = '#2563eb';
      }

      checklistHtml += `
        <button class="progress-module-row ${isModuleDone ? 'completed' : ''}" type="button" onclick="window._openModule('${m.id}')">
          <span class="progress-module-info">
            <strong>Module ${idx + 1}</strong>
            <em>${esc(m.title)}</em>
          </span>
          <span class="progress-module-status" style="color: ${statusColor}">
            ${statusText}
          </span>
        </button>
      `;
    });

    card.innerHTML = `
      <div class="progress-panel-header">
        <span class="progress-panel-title">Your Progress</span>
        <span class="progress-panel-overall">${overallPct}% Complete</span>
      </div>
      <div class="progress-panel-bar-wrap">
        <div class="progress-panel-bar" style="width: ${overallPct}%"></div>
      </div>
      <div class="progress-panel-stats-row">
        <div class="progress-stat-mini">
          <span class="progress-stat-num">${completedModulesCount} / ${totalModules}</span>
          <span class="progress-stat-label">Modules Done</span>
        </div>
        <div class="progress-stat-mini">
          <span class="progress-stat-num">${scoredQuizzes.length} / ${quizzesList.length}</span>
          <span class="progress-stat-label">Quizzes Taken</span>
        </div>
        <div class="progress-stat-mini">
          <span class="progress-stat-num">${avgScoreText}</span>
          <span class="progress-stat-label">Avg Score</span>
        </div>
      </div>
      ${checklistHtml}
    `;
  }

  /* ── Show Canvas View ──────────────────────── */
  function showCanvasView(view) {
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
      typePill.textContent = 'PDF Document';
      typePill.style.color = '#ef4444';

      dlBtn.style.display = 'inline-block';
      dlBtn.textContent = 'Download PDF';
      dlBtn.onclick = () => window._downloadPdfFile(dlBtn, mod.file_url, fileName);

      tabBtn.style.display = 'inline-block';
      tabBtn.href = mod.file_url;

      contentEl.innerHTML = `
        <div style="position:relative;width:100%;height:75vh;border-radius:8px;overflow:hidden;border:1px solid #cbd5e1;background:#0f172a;box-shadow:0 4px 20px rgba(0,0,0,0.08);margin-top:1rem;">
          <object data="${mod.file_url}#toolbar=1" type="application/pdf" style="width:100%;height:100%">
            <iframe src="${mod.file_url}#toolbar=1" style="width:100%;height:100%;border:none;background:#fff" allowfullscreen>
              <div style="padding:2rem;text-align:center;color:#64748b;">
                <p style="margin-bottom:1rem">PDF preview not supported in this frame.</p>
                <button type="button" onclick="window._downloadPdfFile(this, '${mod.file_url}', '${esc(fileName)}')" class="admin-btn primary">Download PDF</button>
              </div>
            </iframe>
          </object>
        </div>
      `;
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

    // Populate Respective Quiz Section Underneath PDF (Cisco NetAcad Style)
    const quiz = findQuizForModule(modId);
    if (quiz) {
      const attempted = quiz.last_attempt;
      const pct = attempted?.max_score ? Math.round((attempted.score / attempted.max_score) * 100) : 0;
      const isAttempted = Boolean(attempted);

      quizArea.innerHTML = `
        <div class="cisco-module-assessment-card" id="module-quiz-card-${quiz.id}">
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
      nextBtn.textContent = currentLessonIndex < modulesList.length - 1 ? 'Next Lesson →' : 'Back to Outline →';
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
    window._openModule(modId, true);
    // Highlight subitem
    document.querySelectorAll('.course-outline-subitem').forEach(el => el.classList.remove('active'));
    document.getElementById(`sidebar-subquiz-${quizId}`)?.classList.add('active');
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
            <button class="admin-btn" type="button" style="padding:0.75rem 1.8rem;" onclick="showCanvasView('hub')">Course Outline</button>
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

    document.getElementById('submitQuizBtn').dataset.quizId = quizId;

    const container = document.getElementById('quizQuestionsContainer');
    const optionLabels = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

    container.innerHTML = questions.map((q, i) => `
      <div class="quiz-question-card" style="background:#ffffff;border:1px solid #e2e8f0;border-radius:10px;padding:1.5rem;margin-bottom:1.25rem;box-shadow:0 2px 8px rgba(0,0,0,0.04);">
        <div class="q-number" style="font-size:0.75rem;font-weight:800;color:#64748b;letter-spacing:0.5px;margin-bottom:0.5rem;">QUESTION ${i + 1} OF ${questions.length}</div>
        <div class="q-text" style="font-size:1.05rem;font-weight:700;color:#0f172a;line-height:1.5;margin-bottom:1.25rem;">${esc(q.question_text)}</div>
        ${(q.options || []).map((opt, oi) => `
          <div class="quiz-option" data-qid="${q.id}" data-answer="${esc(opt)}" onclick="window._selectAnswer(this)" style="display:flex;align-items:center;gap:12px;padding:10px 14px;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:8px;cursor:pointer;transition:all 0.15s ease;">
            <span class="option-marker" style="width:26px;height:26px;border-radius:50%;background:#f1f5f9;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:0.75rem;color:#475569;">${optionLabels[oi] || oi + 1}</span>
            <span style="font-size:0.92rem;color:#1e293b;">${esc(opt)}</span>
          </div>
        `).join('')}
      </div>
    `).join('');
  };

  window._selectAnswer = function (el) {
    const qid = el.dataset.qid;
    const answer = el.dataset.answer;

    el.parentElement.querySelectorAll(`.quiz-option[data-qid="${qid}"]`).forEach(o => {
      o.style.borderColor = '#e2e8f0';
      o.style.background = '#ffffff';
      const marker = o.querySelector('.option-marker');
      if (marker) { marker.style.background = '#f1f5f9'; marker.style.color = '#475569'; }
    });

    el.style.borderColor = '#3b82f6';
    el.style.background = '#eff6ff';
    const activeMarker = el.querySelector('.option-marker');
    if (activeMarker) { activeMarker.style.background = '#3b82f6'; activeMarker.style.color = '#ffffff'; }

    currentQuizAnswers[qid] = answer;
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
              Course Outline
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
          verdictHtml = '<span class="quiz-review-verdict unanswered">— Unanswered</span>';
        } else if (isCorrect) {
          verdictHtml = '<span class="quiz-review-verdict correct">✓ Correct</span>';
        } else {
          verdictHtml = '<span class="quiz-review-verdict incorrect">✗ Incorrect</span>';
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
                  tagHtml = '<span class="quiz-review-tag correct">Your Answer ✓ (Correct)</span>';
                } else if (isRightAnswer) {
                  optClass += ' is-correct';
                  tagHtml = '<span class="quiz-review-tag correct">Correct Answer</span>';
                } else if (isStudentPick) {
                  optClass += ' is-wrong-student';
                  tagHtml = '<span class="quiz-review-tag wrong">Your Answer ✗</span>';
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
        <button class="admin-btn" type="button" style="padding:0.8rem 2.2rem;" onclick="showCanvasView('hub')">Course Outline</button>
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
