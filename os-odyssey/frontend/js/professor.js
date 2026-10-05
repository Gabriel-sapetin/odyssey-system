/**
 * OS Odyssey — Professor Dashboard JS
 * ─────────────────────────────────────
 * Classroom management: create/view classrooms, manage modules,
 * create quizzes with questions, view student results.
 */
(function () {
  'use strict';

  const BACKEND_API = 'https://os-odyssey-api.onrender.com/api';
  let currentClassroomId = null;
  let questionCount = 0;

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

    // Check role via Supabase directly (avoids CORS issues with backend)
    const { data: profile, error } = await supa
      .from('profiles')
      .select('role')
      .eq('id', session.user.id)
      .single();

    if (error || !profile) { window.location.href = 'dashboard.html'; return; }

    const role = profile.role;
    if (role !== 'professor' && role !== 'admin') {
      toast('Access denied — professors only.', 'error');
      setTimeout(() => { window.location.href = 'dashboard.html'; }, 1500);
      return;
    }

    setupEvents();
    loadClassrooms();
  }

  /* ── Events ────────────────────────────────── */
  function setupEvents() {
    // Create classroom
    document.getElementById('createClassBtn')?.addEventListener('click', () => {
      document.getElementById('createClassModal').classList.add('visible');
    });

    document.getElementById('createClassForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('className').value.trim();
      const desc = document.getElementById('classDesc').value.trim();
      if (!name) return;

      const data = await api('POST', '/classrooms/', { name, description: desc || null });
      if (data && !data.error) {
        toast('Classroom created!', 'success');
        document.getElementById('createClassModal').classList.remove('visible');
        document.getElementById('createClassForm').reset();
        loadClassrooms();
      } else {
        toast(data?.error || 'Failed to create classroom.', 'error');
      }
    });

    // Back button
    document.getElementById('backToClasses')?.addEventListener('click', () => {
      document.getElementById('profClassDetail').style.display = 'none';
      document.getElementById('profClassList').style.display = '';
      document.getElementById('quizPreviewView').style.display = 'none';
      document.getElementById('aiGeneratingOverlay').style.display = 'none';
      currentClassroomId = null;
      loadClassrooms();
    });

    // Back from quiz preview
    document.getElementById('backToQuizList')?.addEventListener('click', () => {
      document.getElementById('quizPreviewView').style.display = 'none';
      document.getElementById('profClassDetail').style.display = '';
      // Reset to quizzes tab
      document.querySelectorAll('.classroom-inner-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.classroom-inner-panel').forEach(p => p.classList.remove('active'));
      document.querySelector('[data-inner="quizzes"]').classList.add('active');
      document.getElementById('inner-quizzes').classList.add('active');
      loadQuizzes();
    });

    // Inner tabs
    document.querySelectorAll('.classroom-inner-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.classroom-inner-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.classroom-inner-panel').forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        const panel = document.getElementById(`inner-${tab.dataset.inner}`);
        if (panel) panel.classList.add('active');

        switch (tab.dataset.inner) {
          case 'members': loadMembers(); break;
          case 'modules': loadModules(); break;
          case 'quizzes': loadQuizzes(); break;
          case 'results': loadResultsQuizList(); break;
        }
      });
    });

    // Delete classroom
    document.getElementById('deleteClassBtn')?.addEventListener('click', async () => {
      if (!currentClassroomId) return;
      if (!confirm('Delete this classroom? All modules, quizzes, and student enrollments will be removed.')) return;

      const data = await api('DELETE', `/classrooms/${currentClassroomId}`);
      if (data && !data.error) {
        toast('Classroom deleted.', 'success');
        document.getElementById('profClassDetail').style.display = 'none';
        document.getElementById('profClassList').style.display = '';
        currentClassroomId = null;
        loadClassrooms();
      } else {
        toast(data?.error || 'Failed to delete.', 'error');
      }
    });

    // Add module
    document.getElementById('addModuleBtn')?.addEventListener('click', () => {
      document.getElementById('addModuleForm').reset();
      document.getElementById('addModuleModal').classList.add('visible');
    });

    document.getElementById('addModuleForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const saveBtn = document.getElementById('saveModuleBtn');
      const statusEl = document.getElementById('modUploadStatus');
      const fileInput = document.getElementById('modFile');
      const file = fileInput?.files?.[0];

      saveBtn.disabled = true;
      saveBtn.textContent = 'Uploading…';

      let file_url = null;
      let file_name = null;

      // Upload PDF to Supabase Storage if selected
      if (file) {
        if (file.size > 10 * 1024 * 1024) {
          toast('File too large. Max 10MB.', 'error');
          saveBtn.disabled = false;
          saveBtn.textContent = 'Save Module';
          return;
        }

        statusEl.textContent = '📤 Uploading PDF…';
        statusEl.style.color = '#60a5fa';

        const ext = file.name.split('.').pop();
        const path = `classrooms/${currentClassroomId}/${Date.now()}_${file.name}`;

        const { data: uploadData, error: uploadError } = await supa.storage
          .from('classroom-files')
          .upload(path, file, { contentType: 'application/pdf', upsert: false });

        if (uploadError) {
          statusEl.textContent = '❌ Upload failed: ' + (uploadError.message || 'Unknown error');
          statusEl.style.color = '#f87171';
          saveBtn.disabled = false;
          saveBtn.textContent = 'Save Module';
          return;
        }

        // Get public URL
        const { data: urlData } = supa.storage.from('classroom-files').getPublicUrl(path);
        file_url = urlData?.publicUrl || null;
        file_name = file.name;

        statusEl.textContent = '✅ Uploaded!';
        statusEl.style.color = '#4ade80';
      }

      const body = {
        title: document.getElementById('modTitle').value.trim(),
        description: document.getElementById('modDesc').value.trim() || null,
        content: null,
        file_url: file_url,
        file_name: file_name,
        order_index: parseInt(document.getElementById('modOrder').value) || 1,
        is_published: document.getElementById('modPublished').checked,
      };

      const data = await api('POST', `/classrooms/${currentClassroomId}/modules`, body);
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save Module';

      if (data && !data.error) {
        toast('Module created!', 'success');
        document.getElementById('addModuleModal').classList.remove('visible');
        loadModules();
      } else {
        toast(data?.error || 'Failed to create module.', 'error');
      }
    });

    // Add quiz
    document.getElementById('addQuizBtn')?.addEventListener('click', () => {
      document.getElementById('addQuizForm').reset();
      document.getElementById('questionsContainer').innerHTML = '';
      questionCount = 0;
      addQuestionField();
      document.getElementById('addQuizModal').classList.add('visible');
    });

    document.getElementById('addQuestionBtn')?.addEventListener('click', addQuestionField);

    document.getElementById('addQuizForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const questions = collectQuestions();

      const body = {
        title: document.getElementById('quizTitle').value.trim(),
        description: document.getElementById('quizDesc').value.trim() || null,
        time_limit_minutes: parseInt(document.getElementById('quizTimeLimit').value) || null,
        is_published: document.getElementById('quizPublished').checked,
        questions,
      };

      const data = await api('POST', `/classrooms/${currentClassroomId}/quizzes`, body);
      if (data && !data.error) {
        toast('Quiz created!', 'success');
        document.getElementById('addQuizModal').classList.remove('visible');
        loadQuizzes();
      } else {
        toast(data?.error || 'Failed to create quiz.', 'error');
      }
    });

    // Results quiz filter
    document.getElementById('resultsQuizFilter')?.addEventListener('change', (e) => {
      if (e.target.value) loadResults(e.target.value);
    });
  }

  /* ── Classrooms List ───────────────────────── */
  async function loadClassrooms() {
    const grid = document.getElementById('profClassroomGrid');
    grid.innerHTML = '<div class="admin-loading"><div class="admin-spinner"></div></div>';

    const data = await api('GET', '/classrooms/');
    if (!data || data.error) {
      grid.innerHTML = '<div class="admin-empty"><div class="empty-icon">⚠️</div><div class="empty-text">Failed to load classrooms</div></div>';
      return;
    }

    if (!data.classrooms || data.classrooms.length === 0) {
      grid.innerHTML = '<div class="admin-empty"><div class="empty-icon">🏫</div><div class="empty-text">No classrooms yet. Create one to get started!</div></div>';
      return;
    }

    grid.innerHTML = data.classrooms.map(c => `
      <div class="classroom-card" onclick="window._openClass('${c.id}')">
        <h3>${esc(c.name)}</h3>
        ${c.description ? `<p style="font-size:0.8rem;color:rgba(255,255,255,0.5);margin-top:0.2rem">${esc(c.description)}</p>` : ''}
        <div class="classroom-meta">
          <span>👥 ${c.member_count || 0} students</span>
          <span>${c.is_active ? '🟢 Active' : '🔴 Archived'}</span>
        </div>
        <span class="join-code">${esc(c.join_code)}</span>
      </div>
    `).join('');
  }

  /* ── Open Classroom Detail ─────────────────── */
  window._openClass = async function (id) {
    currentClassroomId = id;
    document.getElementById('profClassList').style.display = 'none';
    document.getElementById('profClassDetail').style.display = '';

    const data = await api('GET', `/classrooms/${id}`);
    if (!data || !data.classroom) {
      toast('Failed to load classroom.', 'error');
      return;
    }

    const c = data.classroom;
    document.getElementById('classDetailName').textContent = c.name;
    const codeEl = document.getElementById('classDetailCode');
    codeEl.textContent = c.join_code;
    codeEl.onclick = () => { navigator.clipboard.writeText(c.join_code); toast('Join code copied!', 'info'); };
    document.getElementById('classDetailMeta').textContent = `${c.member_count || 0} students · Created ${fmtDate(c.created_at)}`;

    // Reset to members tab
    document.querySelectorAll('.classroom-inner-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.classroom-inner-panel').forEach(p => p.classList.remove('active'));
    document.querySelector('[data-inner="members"]').classList.add('active');
    document.getElementById('inner-members').classList.add('active');

    loadMembers();
  };

  /* ── Members ───────────────────────────────── */
  async function loadMembers() {
    const body = document.getElementById('membersTableBody');
    body.innerHTML = '<tr><td colspan="6"><div class="admin-loading"><div class="admin-spinner"></div></div></td></tr>';

    const data = await api('GET', `/classrooms/${currentClassroomId}/members`);
    if (!data || data.error) {
      body.innerHTML = '<tr><td colspan="6"><div class="admin-empty"><div class="empty-icon">⚠️</div><div class="empty-text">Failed to load members</div></div></td></tr>';
      return;
    }

    if (!data.members || data.members.length === 0) {
      body.innerHTML = '<tr><td colspan="6"><div class="admin-empty"><div class="empty-icon">👻</div><div class="empty-text">No students enrolled yet. Share the join code!</div></div></td></tr>';
      return;
    }

    body.innerHTML = data.members.map(m => `
      <tr>
        <td>
          <div class="user-cell">
            <img src="${esc(m.avatar || '../../assets/penguin-flower-removebg-preview.png')}" alt="" />
            <div class="user-info">
              <span class="user-name">${esc(m.username)}</span>
              <span class="user-email">${esc(m.email || '')}</span>
            </div>
          </div>
        </td>
        <td>${m.xp || 0}</td>
        <td>${m.level || 1}</td>
        <td><span class="rank-badge ${m.rank || 'Bronze'}">${m.rank || 'Bronze'}</span></td>
        <td>${fmtDate(m.joined_at)}</td>
        <td><button class="admin-btn danger" onclick="window._removeMember('${m.id}', '${esc(m.username)}')">Remove</button></td>
      </tr>
    `).join('');
  }

  window._removeMember = async function (studentId, name) {
    if (!confirm(`Remove "${name}" from this classroom?`)) return;
    const data = await api('DELETE', `/classrooms/${currentClassroomId}/members/${studentId}`);
    if (data && !data.error) {
      toast(`${name} removed.`, 'success');
      loadMembers();
    } else {
      toast(data?.error || 'Failed to remove student.', 'error');
    }
  };

  /* ── Modules ───────────────────────────────── */
  async function loadModules() {
    const container = document.getElementById('modulesList');
    container.innerHTML = '<div class="admin-loading"><div class="admin-spinner"></div></div>';

    const data = await api('GET', `/classrooms/${currentClassroomId}/modules`);
    if (!data || data.error) {
      container.innerHTML = '<div class="admin-empty"><div class="empty-icon">⚠️</div><div class="empty-text">Failed to load modules</div></div>';
      return;
    }

    if (!data.modules || data.modules.length === 0) {
      container.innerHTML = '<div class="admin-empty"><div class="empty-icon">📝</div><div class="empty-text">No modules yet. Create your first lesson!</div></div>';
      return;
    }

    container.innerHTML = data.modules.map(m => {
      const hasPdf = m.file_url && m.file_name;
      const fileInfo = hasPdf ? `📄 ${esc(m.file_name)}` : 'Text content';
      return `
      <div class="content-card" style="flex-wrap:wrap">
        <div style="flex:1;min-width:200px">
          <h4><span class="status-dot ${m.is_published ? 'published' : 'draft'}"></span>${esc(m.title)}</h4>
          <div class="content-meta">${m.is_published ? 'Published' : 'Draft'} · Order: ${m.order_index} · ${fileInfo}</div>
          ${hasPdf ? `<a href="${m.file_url}" target="_blank" style="font-size:0.72rem;color:#60a5fa;text-decoration:none">🔗 View PDF</a>` : ''}
        </div>
        <div class="admin-actions" style="flex-wrap:wrap;gap:0.3rem">
          <button class="admin-btn success" onclick="window._aiGenerateQuiz('${m.id}', '${esc(m.title)}')" title="AI Generate Quiz">🤖 AI Quiz</button>
          <button class="admin-btn" onclick="window._toggleModPub('${m.id}', ${!m.is_published})">${m.is_published ? '📥 Unpublish' : '📤 Publish'}</button>
          <button class="admin-btn danger" onclick="window._deleteModule('${m.id}')">🗑️</button>
        </div>
      </div>`;
    }).join('');
  }

  window._toggleModPub = async function (modId, published) {
    await api('PATCH', `/classrooms/${currentClassroomId}/modules/${modId}`, { is_published: published });
    toast(published ? 'Module published!' : 'Module unpublished.', 'success');
    loadModules();
  };

  window._deleteModule = async function (modId) {
    if (!confirm('Delete this module?')) return;
    await api('DELETE', `/classrooms/${currentClassroomId}/modules/${modId}`);
    toast('Module deleted.', 'success');
    loadModules();
  };

  /* ── AI Quiz Generation ────────────────────── */
  window._aiGenerateQuiz = async function (moduleId, moduleTitle) {
    const numQ = prompt(`🤖 AI Quiz Generator\n\nGenerate a quiz from "${moduleTitle}".\n\nHow many questions? (3-20)`, '10');
    if (!numQ) return;

    const num = parseInt(numQ);
    if (isNaN(num) || num < 3 || num > 20) {
      toast('Please enter a number between 3 and 20.', 'error');
      return;
    }

    // Show AI generating overlay
    document.getElementById('profClassDetail').style.display = 'none';
    document.getElementById('quizPreviewView').style.display = 'none';
    const overlay = document.getElementById('aiGeneratingOverlay');
    overlay.style.display = '';
    document.getElementById('aiGenModuleTitle').textContent = `Module: ${moduleTitle} · ${num} questions`;

    const data = await api('POST', `/classrooms/${currentClassroomId}/modules/${moduleId}/generate-quiz`, {
      num_questions: num,
      quiz_title: `Quiz: ${moduleTitle}`,
    });

    overlay.style.display = 'none';

    if (data && !data.error) {
      toast(`✅ ${data.message} Quiz saved as draft.`, 'success');
      // Show the generated quiz preview
      showQuizPreview(data.quiz, data.questions);
    } else {
      // Go back to class detail
      document.getElementById('profClassDetail').style.display = '';
      toast(data?.error || 'AI quiz generation failed. Try again.', 'error');
    }
  };

  /* ── Quiz Preview ──────────────────────────── */
  window._previewQuiz = async function (quizId) {
    const data = await api('GET', `/classrooms/${currentClassroomId}/quizzes/${quizId}`);
    if (!data || !data.quiz) {
      toast('Failed to load quiz.', 'error');
      return;
    }
    showQuizPreview(data.quiz, data.quiz.questions || []);
  };

  function showQuizPreview(quiz, questions) {
    document.getElementById('profClassDetail').style.display = 'none';
    document.getElementById('aiGeneratingOverlay').style.display = 'none';
    const view = document.getElementById('quizPreviewView');
    view.style.display = '';

    document.getElementById('quizPreviewTitle').textContent = quiz.title || 'Quiz';
    document.getElementById('quizPreviewMeta').textContent =
      `${questions.length} questions · ${quiz.is_published ? 'Published' : 'Draft'}${quiz.is_ai_generated ? ' · 🤖 AI Generated' : ''}`;

    // Action buttons
    document.getElementById('quizPreviewActions').innerHTML = `
      <button class="admin-btn ${quiz.is_published ? '' : 'primary'}" onclick="window._toggleQuizPub('${quiz.id}', ${!quiz.is_published});document.getElementById('backToQuizList').click()">
        ${quiz.is_published ? '📥 Unpublish' : '📤 Publish Quiz'}
      </button>
    `;

    const optionLabels = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

    document.getElementById('quizPreviewQuestions').innerHTML = questions.map((q, i) => {
      const options = q.options || [];
      return `
        <div class="quiz-preview-card">
          <div class="qp-number">Question ${i + 1}</div>
          <div class="qp-text">${esc(q.question_text)}</div>
          ${options.map((opt, oi) => {
            const isCorrect = opt === q.correct_answer;
            return `
              <div class="qp-option ${isCorrect ? 'correct' : ''}">
                <span class="qp-marker">${isCorrect ? '✓' : optionLabels[oi] || oi + 1}</span>
                <span>${esc(opt)}</span>
              </div>`;
          }).join('')}
          ${q.explanation ? `<div class="qp-explanation">💡 ${esc(q.explanation)}</div>` : ''}
        </div>`;
    }).join('');
  }

  /* ── Quizzes ───────────────────────────────── */
  async function loadQuizzes() {
    const container = document.getElementById('quizzesList');
    container.innerHTML = '<div class="admin-loading"><div class="admin-spinner"></div></div>';

    const data = await api('GET', `/classrooms/${currentClassroomId}/quizzes`);
    if (!data || data.error) {
      container.innerHTML = '<div class="admin-empty"><div class="empty-icon">⚠️</div><div class="empty-text">Failed to load quizzes</div></div>';
      return;
    }

    if (!data.quizzes || data.quizzes.length === 0) {
      container.innerHTML = '<div class="admin-empty"><div class="empty-icon">📋</div><div class="empty-text">No quizzes yet. Create one for your students!</div></div>';
      return;
    }

    container.innerHTML = data.quizzes.map(q => `
      <div class="content-card" style="cursor:pointer" onclick="window._previewQuiz('${q.id}')">
        <div>
          <h4><span class="status-dot ${q.is_published ? 'published' : 'draft'}"></span>${esc(q.title)}</h4>
          <div class="content-meta">${q.question_count || 0} questions · ${q.is_published ? 'Published' : 'Draft'}${q.time_limit_minutes ? ` · ${q.time_limit_minutes} min` : ''}${q.is_ai_generated ? ' · 🤖 AI Generated' : ''}</div>
        </div>
        <div class="admin-actions">
          <button class="admin-btn" onclick="event.stopPropagation();window._toggleQuizPub('${q.id}', ${!q.is_published})">${q.is_published ? '📥 Unpublish' : '📤 Publish'}</button>
          <button class="admin-btn danger" onclick="event.stopPropagation();window._deleteQuiz('${q.id}')">🗑️</button>
        </div>
      </div>
    `).join('');
  }

  window._toggleQuizPub = async function (quizId, published) {
    await api('PATCH', `/classrooms/${currentClassroomId}/quizzes/${quizId}`, { is_published: published });
    toast(published ? 'Quiz published!' : 'Quiz unpublished.', 'success');
    loadQuizzes();
  };

  window._deleteQuiz = async function (quizId) {
    if (!confirm('Delete this quiz and all its questions/attempts?')) return;
    await api('DELETE', `/classrooms/${currentClassroomId}/quizzes/${quizId}`);
    toast('Quiz deleted.', 'success');
    loadQuizzes();
  };

  /* ── Question Builder ──────────────────────── */
  function addQuestionField() {
    questionCount++;
    const n = questionCount;
    const container = document.getElementById('questionsContainer');

    const div = document.createElement('div');
    div.className = 'quiz-question-card';
    div.id = `qCard-${n}`;
    div.innerHTML = `
      <div class="q-number">QUESTION ${n}
        <button type="button" class="admin-btn danger" style="float:right;padding:0.2rem 0.4rem;font-size:0.65rem" onclick="this.closest('.quiz-question-card').remove()">✕ Remove</button>
      </div>
      <div class="admin-form-group">
        <label>Question Text</label>
        <input type="text" class="q-text-input" required placeholder="Enter question..." />
      </div>
      <div class="admin-form-group">
        <label>Type</label>
        <select class="q-type-input">
          <option value="multiple_choice">Multiple Choice</option>
          <option value="true_false">True / False</option>
        </select>
      </div>
      <div class="admin-form-group q-options-group">
        <label>Options (one per line)</label>
        <textarea class="q-options-input" rows="4" placeholder="Option A\nOption B\nOption C\nOption D"></textarea>
      </div>
      <div class="admin-form-group">
        <label>Correct Answer</label>
        <input type="text" class="q-answer-input" required placeholder="Exact text of the correct answer" />
      </div>
      <div class="admin-form-group">
        <label>Explanation (shown after answering)</label>
        <input type="text" class="q-explanation-input" placeholder="Why this is correct…" />
      </div>
    `;

    container.appendChild(div);

    // Toggle options for true/false
    const typeSelect = div.querySelector('.q-type-input');
    const optionsGroup = div.querySelector('.q-options-group');
    typeSelect.addEventListener('change', () => {
      if (typeSelect.value === 'true_false') {
        optionsGroup.style.display = 'none';
        div.querySelector('.q-options-input').value = 'True\nFalse';
      } else {
        optionsGroup.style.display = '';
      }
    });
  }

  function collectQuestions() {
    const cards = document.querySelectorAll('#questionsContainer .quiz-question-card');
    const questions = [];

    cards.forEach((card, i) => {
      const text = card.querySelector('.q-text-input').value.trim();
      const type = card.querySelector('.q-type-input').value;
      const optionsRaw = card.querySelector('.q-options-input').value;
      const answer = card.querySelector('.q-answer-input').value.trim();
      const explanation = card.querySelector('.q-explanation-input').value.trim();

      if (!text || !answer) return;

      const options = optionsRaw.split('\n').map(o => o.trim()).filter(Boolean);

      questions.push({
        question_text: text,
        question_type: type,
        options: options.length ? options : (type === 'true_false' ? ['True', 'False'] : []),
        correct_answer: answer,
        explanation: explanation || null,
        order_index: i + 1,
        points: 1,
      });
    });

    return questions;
  }

  /* ── Results ───────────────────────────────── */
  async function loadResultsQuizList() {
    const select = document.getElementById('resultsQuizFilter');
    const data = await api('GET', `/classrooms/${currentClassroomId}/quizzes`);
    if (!data || !data.quizzes) return;

    select.innerHTML = '<option value="">Select a quiz</option>';
    data.quizzes.forEach(q => {
      select.innerHTML += `<option value="${q.id}">${esc(q.title)} (${q.question_count || 0}q)</option>`;
    });
  }

  async function loadResults(quizId) {
    const body = document.getElementById('resultsTableBody');
    body.innerHTML = '<tr><td colspan="4"><div class="admin-loading"><div class="admin-spinner"></div></div></td></tr>';

    const data = await api('GET', `/classrooms/${currentClassroomId}/quizzes/${quizId}/results`);
    if (!data || data.error) {
      body.innerHTML = '<tr><td colspan="4"><div class="admin-empty"><div class="empty-icon">⚠️</div><div class="empty-text">Failed to load results</div></div></td></tr>';
      return;
    }

    if (!data.results || data.results.length === 0) {
      body.innerHTML = '<tr><td colspan="4"><div class="admin-empty"><div class="empty-icon">📊</div><div class="empty-text">No submissions yet</div></div></td></tr>';
      return;
    }

    body.innerHTML = data.results.map(r => {
      const pct = r.max_score ? Math.round((r.score / r.max_score) * 100) : 0;
      return `
        <tr>
          <td><strong>${esc(r.student_username || 'Unknown')}</strong></td>
          <td>${r.score} / ${r.max_score}</td>
          <td><span class="rank-badge ${pct >= 80 ? 'Gold' : pct >= 50 ? 'Silver' : 'Bronze'}">${pct}%</span></td>
          <td>${fmtDate(r.submitted_at)}</td>
        </tr>
      `;
    }).join('');
  }

  /* ── Utils ─────────────────────────────────── */
  function esc(str) {
    if (!str) return '';
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  function fmtDate(iso) {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
    catch { return '—'; }
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
