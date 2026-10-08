/**
 * OS Odyssey — Student Classroom JS
 * ───────────────────────────────────
 * Join classrooms, view lessons, take quizzes.
 */
(function () {
  'use strict';

  const BACKEND_API = 'https://os-odyssey-api.onrender.com/api';
  let currentClassroomId = null;
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

    // Back to class list
    document.getElementById('backToStudentClasses')?.addEventListener('click', () => {
      hideAll();
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
        hideAll();
        show('studentClassList');
        currentClassroomId = null;
        loadClassrooms();
      } else {
        toast(data?.error || 'Failed to leave.', 'error');
      }
    });

    // Inner tabs
    document.querySelectorAll('.classroom-inner-tab[data-stab]').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.classroom-inner-tab[data-stab]').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.classroom-inner-panel').forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        const panel = document.getElementById(`student-${tab.dataset.stab}`);
        if (panel) panel.classList.add('active');

        if (tab.dataset.stab === 'modules') loadModules();
        if (tab.dataset.stab === 'quizzes') loadQuizzes();
      });
    });

    // Back from module view
    document.getElementById('backToClassModules')?.addEventListener('click', () => {
      hide('studentModuleView');
      show('studentClassDetail');
    });

    // Back from quiz view
    document.getElementById('backToClassQuizzes')?.addEventListener('click', () => {
      hide('studentQuizView');
      show('studentClassDetail');
      // Reset to quizzes tab
      document.querySelectorAll('.classroom-inner-tab[data-stab]').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.classroom-inner-panel').forEach(p => p.classList.remove('active'));
      document.querySelector('[data-stab="quizzes"]').classList.add('active');
      document.getElementById('student-quizzes').classList.add('active');
      loadQuizzes();
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
        feedback.textContent = 'ℹ️ You\'re already enrolled in this classroom.';
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

  /* ── Open Classroom ────────────────────────── */
  window._openStudentClass = async function (id) {
    currentClassroomId = id;
    hideAll();
    show('studentClassDetail');

    const data = await api('GET', `/classrooms/${id}`);
    if (!data || !data.classroom) {
      toast('Failed to load classroom.', 'error');
      return;
    }

    const c = data.classroom;
    document.getElementById('studentClassDetailName').textContent = c.name;
    document.getElementById('studentClassDetailMeta').textContent =
      `Prof. ${c.professor_username || 'Unknown'} · ${c.member_count || 0} students`;

    // Reset to modules tab
    document.querySelectorAll('.classroom-inner-tab[data-stab]').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.classroom-inner-panel').forEach(p => p.classList.remove('active'));
    document.querySelector('[data-stab="modules"]').classList.add('active');
    document.getElementById('student-modules').classList.add('active');

    loadModules();
  };

  /* ── Modules ───────────────────────────────── */
  async function loadModules() {
    const container = document.getElementById('studentModulesList');
    container.innerHTML = '<div class="admin-loading"><div class="admin-spinner"></div></div>';

    const data = await api('GET', `/classrooms/${currentClassroomId}/modules`);
    if (!data || data.error) {
      container.innerHTML = '<div class="admin-empty"><div class="empty-icon">⚠️</div><div class="empty-text">Failed to load lessons</div></div>';
      return;
    }

    if (!data.modules || data.modules.length === 0) {
      container.innerHTML = '<div class="admin-empty"><div class="empty-icon">📝</div><div class="empty-text">No lessons available yet.</div></div>';
      return;
    }

    container.innerHTML = data.modules.map(m => {
      const hasPdf = m.file_url && m.file_name;
      return `
      <div class="content-card" style="cursor:pointer" onclick="window._openModule('${m.id}')">
        <div>
          <h4>${hasPdf ? '📄' : '📖'} ${esc(m.title)}</h4>
          ${m.description ? `<div class="content-meta">${esc(m.description)}</div>` : ''}
          ${hasPdf ? `<div style="font-size:0.72rem;color:rgba(255,255,255,0.35);margin-top:0.2rem">${esc(m.file_name)}</div>` : ''}
        </div>
        <div class="admin-btn" style="flex-shrink:0">${hasPdf ? 'Open PDF →' : 'Read →'}</div>
      </div>`;
    }).join('');
  }

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
      // Direct navigation fallback
      window.open(url, '_blank');
    }
  };

  window._openModule = async function (modId) {
    const data = await api('GET', `/classrooms/${currentClassroomId}/modules/${modId}`);
    if (!data || !data.module) {
      toast('Failed to load module.', 'error');
      return;
    }

    hideAll();
    show('studentModuleView');

    const mod = data.module;
    document.getElementById('moduleViewTitle').textContent = mod.title;

    const contentEl = document.getElementById('moduleViewContent');

    if (mod.file_url) {
      const fileName = mod.file_name || 'module.pdf';
      contentEl.innerHTML = `
        <div style="display:flex;gap:0.75rem;align-items:center;margin-bottom:1rem;flex-wrap:wrap">
          <button type="button" onclick="window._downloadPdfFile(this, '${mod.file_url}', '${esc(fileName)}')" class="admin-btn primary" style="display:inline-flex;align-items:center;gap:0.5rem;cursor:pointer">
            📥 Download to Device (${esc(fileName)})
          </button>
          <a href="${mod.file_url}" target="_blank" class="admin-btn secondary" style="display:inline-flex;align-items:center;gap:0.5rem;text-decoration:none">
            ↗️ Open in New Tab
          </a>
        </div>
        <div style="position:relative;width:100%;height:80vh;border-radius:12px;overflow:hidden;border:1px solid rgba(255,255,255,0.15);background:#0f172a;box-shadow:0 8px 32px rgba(0,0,0,0.4)">
          <object data="${mod.file_url}#toolbar=1" type="application/pdf" style="width:100%;height:100%">
            <iframe src="${mod.file_url}#toolbar=1" style="width:100%;height:100%;border:none;background:#fff" allowfullscreen>
              <div style="padding:2rem;text-align:center;color:rgba(255,255,255,0.8)">
                <p style="margin-bottom:1rem">Your browser does not support embedded PDF preview.</p>
                <button type="button" onclick="window._downloadPdfFile(this, '${mod.file_url}', '${esc(fileName)}')" class="admin-btn primary">Download PDF</button>
              </div>
            </iframe>
          </object>
        </div>
      `;
    } else {
      contentEl.textContent = mod.content || 'No content available.';
    }
  };

  /* ── Quizzes ───────────────────────────────── */
  async function loadQuizzes() {
    const container = document.getElementById('studentQuizzesList');
    container.innerHTML = '<div class="admin-loading"><div class="admin-spinner"></div></div>';

    const data = await api('GET', `/classrooms/${currentClassroomId}/quizzes`);
    if (!data || data.error) {
      container.innerHTML = '<div class="admin-empty"><div class="empty-icon">⚠️</div><div class="empty-text">Failed to load quizzes</div></div>';
      return;
    }

    if (!data.quizzes || data.quizzes.length === 0) {
      container.innerHTML = '<div class="admin-empty"><div class="empty-icon">📋</div><div class="empty-text">No quizzes available yet.</div></div>';
      return;
    }

    container.innerHTML = data.quizzes.map(q => {
      const attempted = q.last_attempt;
      let statusHtml = '';
      if (attempted) {
        const pct = attempted.max_score ? Math.round((attempted.score / attempted.max_score) * 100) : 0;
        statusHtml = `<span class="rank-badge ${pct >= 80 ? 'Gold' : pct >= 50 ? 'Silver' : 'Bronze'}">${pct}% (${attempted.score}/${attempted.max_score})</span>`;
      } else {
        statusHtml = '<span style="font-size:0.72rem;color:rgba(255,255,255,0.35)">Not attempted</span>';
      }

      return `
        <div class="content-card" style="cursor:pointer" onclick="window._openQuiz('${q.id}')">
          <div>
            <h4>📋 ${esc(q.title)}</h4>
            <div class="content-meta">${q.question_count || 0} questions${q.time_limit_minutes ? ` · ${q.time_limit_minutes} min` : ''}</div>
            <div style="margin-top:0.35rem">${statusHtml}</div>
          </div>
          <div class="admin-btn" style="flex-shrink:0">${attempted ? 'Retake →' : 'Start →'}</div>
        </div>
      `;
    }).join('');
  }

  /* ── Take Quiz ─────────────────────────────── */
  window._openQuiz = async function (quizId) {
    currentQuizAnswers = {};

    const data = await api('GET', `/classrooms/${currentClassroomId}/quizzes/${quizId}`);
    if (!data || !data.quiz) {
      toast('Failed to load quiz.', 'error');
      return;
    }

    hideAll();
    show('studentQuizView');

    const quiz = data.quiz;
    document.getElementById('quizViewTitle').textContent = quiz.title;
    document.getElementById('quizViewDesc').textContent = quiz.description || '';
    document.getElementById('quizSubmitArea').style.display = '';
    document.getElementById('quizResultArea').style.display = 'none';

    const container = document.getElementById('quizQuestionsContainer');
    const questions = quiz.questions || [];

    if (questions.length === 0) {
      container.innerHTML = '<div class="admin-empty"><div class="empty-icon">📋</div><div class="empty-text">This quiz has no questions yet.</div></div>';
      document.getElementById('quizSubmitArea').style.display = 'none';
      return;
    }

    // Store quiz ID for submission
    document.getElementById('submitQuizBtn').dataset.quizId = quizId;

    container.innerHTML = questions.map((q, i) => {
      const options = q.options || [];
      const optionLabels = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

      return `
        <div class="quiz-question-card">
          <div class="q-number">QUESTION ${i + 1}</div>
          <div class="q-text">${esc(q.question_text)}</div>
          ${options.map((opt, oi) => `
            <div class="quiz-option" data-qid="${q.id}" data-answer="${esc(opt)}" onclick="window._selectAnswer(this)">
              <span class="option-marker">${optionLabels[oi] || oi + 1}</span>
              <span>${esc(opt)}</span>
            </div>
          `).join('')}
        </div>
      `;
    }).join('');
  };

  window._selectAnswer = function (el) {
    const qid = el.dataset.qid;
    const answer = el.dataset.answer;

    // Deselect siblings
    el.parentElement.querySelectorAll(`.quiz-option[data-qid="${qid}"]`).forEach(o => o.classList.remove('selected'));
    el.classList.add('selected');

    currentQuizAnswers[qid] = answer;
  };

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
      document.getElementById('quizSubmitArea').style.display = 'none';
      const resultArea = document.getElementById('quizResultArea');
      resultArea.style.display = '';

      const pct = data.percentage || 0;
      let color = '#ef4444';
      if (pct >= 80) color = '#22c55e';
      else if (pct >= 50) color = '#f59e0b';

      resultArea.innerHTML = `
        <div class="quiz-result">
          <div class="score-circle" style="border-color:${color}">
            <div class="score-value" style="color:${color}">${pct}%</div>
            <div class="score-label">SCORE</div>
          </div>
          <p style="font-family:'Nunito',sans-serif;font-size:1.1rem;font-weight:700;color:#fff;margin:1rem 0 0.5rem">
            ${data.score} / ${data.max_score} correct
          </p>
          <p style="font-family:'Nunito',sans-serif;font-size:0.85rem;color:rgba(255,255,255,0.5)">
            ${pct >= 80 ? '🎉 Excellent work!' : pct >= 50 ? '👍 Good effort, keep studying!' : '📚 Review the material and try again!'}
          </p>
          <button class="admin-btn primary" style="margin-top:1.5rem" onclick="window._openQuiz('${quizId}')">Retake Quiz</button>
        </div>
      `;
    } else {
      toast(data?.error || 'Failed to submit quiz.', 'error');
    }
  }

  /* ── View Helpers ──────────────────────────── */
  function hideAll() {
    ['studentClassList', 'studentClassDetail', 'studentModuleView', 'studentQuizView'].forEach(id => hide(id));
  }
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
