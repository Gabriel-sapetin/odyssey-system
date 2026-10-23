/**
 * Odyssey — Professor Dashboard JS
 * ─────────────────────────────────────
 * Classroom management: create/view classrooms, manage modules,
 * create quizzes with questions, view student results.
 */
(function () {
  'use strict';

  const BACKEND_API = 'https://os-odyssey-api.onrender.com/api';
  let currentClassroomId = null;
  let questionCount = 0;
  let activePreviewQuiz = null;
  let pendingDeletedQuestionIds = [];
  const currentModulesMap = new Map();

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
      if (res.status === 401) {
        // Session revoked or expired on Supabase — clear and redirect
        await supa.auth.signOut();
        localStorage.clear();
        window.location.href = 'login.html';
        return null;
      }
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

    let role = profile?.role || 'student';

    if (role !== 'professor' && role !== 'admin') {
      // Check if user has an approved instructor application
      try {
        const { data: approvedApps } = await supa
          .from('instructor_applications')
          .select('id, status')
          .eq('user_id', session.user.id)
          .eq('status', 'approved')
          .limit(1);

        if (approvedApps && approvedApps.length > 0) {
          role = 'professor';
          // Auto-promote in profiles table
          await supa.from('profiles').update({ role: 'professor' }).eq('id', session.user.id);
        }
      } catch (e) {
        console.warn('Could not verify approved instructor application:', e);
      }
    }

    if (role !== 'professor' && role !== 'admin') {
      toast('Access denied — professors only.', 'error');
      setTimeout(() => { window.location.href = 'dashboard.html'; }, 1500);
      return;
    }

    setupEvents();
    loadClassrooms();
  }

  /* ── Document Text Extraction (PDF & Word DOCX) ──────── */
  async function extractPdfText(buf) {
    // 1. Try PDF.js
    if (window.pdfjsLib) {
      let pdf = null;
      try {
        if (!window.pdfjsLib.GlobalWorkerOptions.workerSrc) {
          try {
            const workerBlob = new Blob(
              [`importScripts('https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js');`],
              { type: 'application/javascript' }
            );
            window.pdfjsLib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(workerBlob);
          } catch {
            window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
          }
        }

        const loadingTask = window.pdfjsLib.getDocument({
          data: new Uint8Array(buf),
          cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/cmaps/',
          cMapPacked: true,
        });

        pdf = await loadingTask.promise;
        const maxPages = Math.min(pdf.numPages, 40);
        const parts = [];

        for (let i = 1; i <= maxPages; i++) {
          try {
            const page = await pdf.getPage(i);
            const content = await page.getTextContent();
            const text = content.items
              .map(item => (item && typeof item.str === 'string' ? item.str : ''))
              .filter(s => s.trim().length > 0)
              .join(' ')
              .trim();
            if (text) parts.push(text);
          } catch (pe) {
            console.warn(`PDF page ${i} extraction error:`, pe);
          }
        }

        const full = parts.join('\n\n').trim();
        if (full.length >= 50) return full;
      } catch (err) {
        console.warn('PDF.js extraction failed, falling back to raw stream parsing:', err);
      } finally {
        // Clean up PDF.js document to prevent async error leaks
        if (pdf) {
          try { pdf.destroy(); } catch (_) { /* ignore cleanup errors */ }
        }
      }
    }

    // 2. Fallback: Extract text from raw PDF stream
    try {
      const bytes = new Uint8Array(buf);
      let binary = '';
      const len = bytes.byteLength;
      const chunk = 8192;
      for (let i = 0; i < len; i += chunk) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + chunk, len)));
      }
      const matches = binary.match(/\(([^\)\\]*(?:\\.[^\)\\]*)*)\)\s*(?:Tj|'|")/g) || [];
      const strings = [];
      for (const m of matches) {
        const inner = m.replace(/^\(/, '').replace(/\)\s*(?:Tj|'|")$/, '').trim();
        if (inner.length > 2 && !inner.startsWith('/') && !inner.startsWith('%')) {
          strings.push(inner);
        }
      }
      const rawText = strings.join(' ').trim();
      if (rawText.length >= 50) return rawText;
    } catch (e) {
      console.warn('Raw PDF stream fallback notice:', e);
    }

    return '';
  }

  async function extractDocxText(buf) {
    if (window.mammoth && typeof window.mammoth.extractRawText === 'function') {
      try {
        const resText = await window.mammoth.extractRawText({ arrayBuffer: buf });
        return (resText?.value || '').trim();
      } catch (e) {
        console.warn('Mammoth extraction notice:', e);
      }
    }
    return '';
  }

  async function extractDocumentText(fileOrUrl, fileName = '') {
    try {
      let buf = null;
      let name = (fileName || '').toLowerCase();

      if (fileOrUrl instanceof Blob || fileOrUrl instanceof File) {
        name = (fileOrUrl.name || name).toLowerCase();
        buf = await fileOrUrl.arrayBuffer();
      } else if (typeof fileOrUrl === 'string' && fileOrUrl) {
        name = (name || fileOrUrl.split('?')[0]).toLowerCase();
        const res = await fetch(fileOrUrl);
        if (!res.ok) return '';
        buf = await res.arrayBuffer();
      }

      if (!buf) return '';

      const isWord = name.includes('.docx') || name.includes('.doc');
      const isPdf = name.includes('.pdf');

      if (isWord) {
        return await extractDocxText(buf);
      } else if (isPdf) {
        return await extractPdfText(buf);
      } else if (name.endsWith('.txt') || name.endsWith('.md')) {
        const dec = new TextDecoder('utf-8');
        return dec.decode(buf).trim();
      }
    } catch (err) {
      console.warn('extractDocumentText error:', err);
    }
    return '';
  }

  /* ── Events ────────────────────────────────── */
  function setupEvents() {
    // Create classroom
    document.getElementById('createClassBtn')?.addEventListener('click', () => {
      document.getElementById('createClassModal').classList.add('visible');
    });

    // Emoji picker
    document.getElementById('emojiPicker')?.addEventListener('click', (e) => {
      const btn = e.target.closest('.emoji-pick');
      if (!btn) return;
      document.querySelectorAll('.emoji-pick').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });

    // Subject dropdown — show custom input when "Custom" selected
    document.getElementById('classSubject')?.addEventListener('change', (e) => {
      const custom = document.getElementById('classSubjectCustom');
      if (custom) custom.style.display = e.target.value === 'Custom' ? '' : 'none';
    });

    document.getElementById('createClassForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('className').value.trim();
      const desc = document.getElementById('classDesc').value.trim();
      if (!name) return;

      // Gather new fields
      let subject = document.getElementById('classSubject')?.value || 'General';
      if (subject === 'Custom') {
        subject = document.getElementById('classSubjectCustom')?.value?.trim() || 'General';
      }
      const activeEmoji = document.querySelector('.emoji-pick.active');
      const theme_emoji = activeEmoji?.dataset?.emoji || '📚';
      const theme_color = document.getElementById('classThemeColor')?.value || '#6366f1';
      const ai_persona = document.getElementById('classAiPersona')?.value?.trim() || 'Odyssey Mentor';
      const ai_subject_context = document.getElementById('classAiContext')?.value?.trim() || null;

      const data = await api('POST', '/classrooms/', {
        name,
        description: desc || null,
        subject,
        theme_color,
        theme_emoji,
        ai_persona,
        ai_subject_context,
      });
      if (data && !data.error) {
        toast('Classroom created!', 'success');
        document.getElementById('createClassModal').classList.remove('visible');
        document.getElementById('createClassForm').reset();
        // Reset emoji picker
        document.querySelectorAll('.emoji-pick').forEach(b => b.classList.remove('active'));
        document.querySelector('.emoji-pick[data-emoji="📚"]')?.classList.add('active');
        document.getElementById('classSubjectCustom').style.display = 'none';
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

    document.getElementById('addPreviewQuestion')?.addEventListener('click', () => {
      const container = document.getElementById('quizPreviewQuestions');
      container.insertAdjacentHTML('beforeend', renderEditableQuestion({ question_text: '', question_type: 'multiple_choice', options: [], correct_answer: '', explanation: '' }, container.children.length));
      bindQuestionCard(container.lastElementChild);
      container.lastElementChild.querySelector('.qp-edit-text').focus();
    });
    document.getElementById('savePreviewQuestions')?.addEventListener('click', savePreviewQuestions);

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
      let extractedContent = null;

      // Upload Document to Supabase Storage if selected
      if (file) {
        if (file.size > 10 * 1024 * 1024) {
          toast('File too large. Max 10MB.', 'error');
          saveBtn.disabled = false;
          saveBtn.textContent = 'Save Module';
          return;
        }

        statusEl.textContent = 'Extracting document text…';
        statusEl.style.color = '#60a5fa';
        try {
          extractedContent = await extractDocumentText(file, file.name);
        } catch (extErr) {
          console.warn('Initial document text extraction warning:', extErr);
        }

        statusEl.textContent = 'Uploading document…';
        statusEl.style.color = '#60a5fa';

        const ext = file.name.split('.').pop();
        const path = `classrooms/${currentClassroomId}/${Date.now()}_${file.name}`;
        const mimeType = file.type || (ext.toLowerCase() === 'pdf' ? 'application/pdf' : 'application/octet-stream');

        const { data: uploadData, error: uploadError } = await supa.storage
          .from('classroom-files')
          .upload(path, file, { contentType: mimeType, upsert: false });

        if (uploadError) {
          statusEl.textContent = 'Upload failed: ' + (uploadError.message || 'Unknown error');
          statusEl.style.color = '#f87171';
          saveBtn.disabled = false;
          saveBtn.textContent = 'Save Module';
          return;
        }

        // Get public URL
        const { data: urlData } = supa.storage.from('classroom-files').getPublicUrl(path);
        file_url = urlData?.publicUrl || null;
        file_name = file.name;

        statusEl.textContent = 'Uploaded!';
        statusEl.style.color = '#4ade80';
      }

      const body = {
        title: document.getElementById('modTitle').value.trim(),
        description: document.getElementById('modDesc').value.trim() || null,
        content: extractedContent ? extractedContent.slice(0, 30000) : null,
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
      grid.innerHTML = '<div class="admin-empty"><div class="empty-text">Failed to load classrooms</div></div>';
      return;
    }

    if (!data.classrooms || data.classrooms.length === 0) {
      grid.innerHTML = '<div class="admin-empty"><div class="empty-text">No classrooms yet. Create one to get started!</div></div>';
      return;
    }

    grid.innerHTML = data.classrooms.map(c => {
      const avatar = c.professor_avatar || '../../assets/penguin-flower-removebg-preview.png';
      const professorFace = avatar === 'computer'
        ? '<span class="computer-avatar mini" aria-hidden="true"><span class="screen-face"></span></span>'
        : `<img src="${esc(avatar).replace(/\"/g, '&quot;')}" alt="Your profile avatar" loading="lazy" />`;
      const banner = (window.ODYSSEY_PROFILE_BANNER_OPTIONS || [])
        .find(option => option.id === c.professor_banner)
        || (window.ODYSSEY_PROFILE_BANNER_OPTIONS || [])[0]
        || { src: '../../assets/bg-mountains-purple.jpg' };
      const professorLevel = Number(c.professor_level) || 1;
      const professorXp = Number(c.professor_xp) || 0;
      return `
      <div class="classroom-card professor-classroom-card" onclick="window._openClass('${c.id}')" style="border-left:3px solid ${c.theme_color || '#6366f1'}">
        <span class="classroom-professor-panel">
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
        <h3>${c.theme_emoji ? c.theme_emoji + ' ' : ''}${esc(c.name)}</h3>
        <span style="display:inline-block;font-size:0.7rem;padding:0.15rem 0.5rem;border-radius:20px;background:${c.theme_color || '#6366f1'}22;color:${c.theme_color || '#6366f1'};border:1px solid ${c.theme_color || '#6366f1'}44;margin-top:0.3rem;font-family:'Nunito',sans-serif;">${esc(c.subject || 'General')}</span>
        ${c.description ? `<p style="font-size:0.8rem;color:rgba(255,255,255,0.5);margin-top:0.2rem">${esc(c.description)}</p>` : ''}
        <div class="classroom-meta">
          <span>${c.member_count || 0} students</span>
          <span>${c.is_active ? 'Active' : 'Archived'}</span>
        </div>
        <span class="join-code">${esc(c.join_code)}</span>
      </div>
    `;
    }).join('');
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
      body.innerHTML = '<tr><td colspan="6"><div class="admin-empty"><div class="empty-text">Failed to load members</div></div></td></tr>';
      return;
    }

    if (!data.members || data.members.length === 0) {
      body.innerHTML = '<tr><td colspan="6"><div class="admin-empty"><div class="empty-text">No students enrolled yet. Share the join code!</div></div></td></tr>';
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
      container.innerHTML = '<div class="admin-empty"><div class="empty-text">Failed to load modules</div></div>';
      return;
    }

    if (!data.modules || data.modules.length === 0) {
      currentModulesMap.clear();
      container.innerHTML = '<div class="admin-empty"><div class="empty-text">No modules yet. Create your first lesson!</div></div>';
      return;
    }

    currentModulesMap.clear();
    data.modules.forEach(m => currentModulesMap.set(m.id, m));

    container.innerHTML = data.modules.map(m => {
      const hasFile = Boolean(m.file_url);
      const fileName = m.file_name || (hasFile ? 'Lesson Document' : '');
      const ext = fileName ? fileName.split('?')[0].split('.').pop().toLowerCase() : '';
      const isWord = ext === 'docx' || ext === 'doc';
      const isPdf = ext === 'pdf';
      const fileBadge = isPdf ? 'PDF' : isWord ? 'DOCX' : (ext ? ext.toUpperCase() : 'DOCUMENT');
      const btnLabel = isPdf ? 'View PDF' : isWord ? 'View Document' : 'View File';

      return `
      <div class="content-card">
        <div>
          <div style="display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap;">
            <h4>${esc(m.title)}</h4>
            ${hasFile ? `<span style="font-size:0.65rem;padding:0.12rem 0.45rem;border-radius:4px;background:rgba(56,189,248,0.15);color:#38bdf8;font-weight:700;">${fileBadge}</span>` : ''}
          </div>
          <div class="content-meta">${m.is_published ? 'Published' : 'Draft'} · Order: ${m.order_index} · ${esc(fileName || 'Text content')}</div>
          ${hasFile ? `
            <div style="margin-top:0.45rem">
              <button type="button" class="admin-btn" style="padding:0.3rem 0.8rem;font-size:0.75rem;background:rgba(56,189,248,0.15);color:#38bdf8;border:1px solid rgba(56,189,248,0.3);border-radius:6px;cursor:pointer;font-weight:700;" onclick="window._openDocViewer('${esc(m.file_url)}', '${esc(fileName)}', '${esc(m.title)}')">
                ${btnLabel}
              </button>
            </div>
          ` : ''}
        </div>
        <div class="admin-actions">
          <button class="admin-btn success" onclick="window._aiGenerateQuiz('${m.id}', '${esc(m.title)}', '${esc(m.file_url || '')}', '${esc(fileName)}')" title="AI Generate Quiz">AI Quiz</button>
          <button class="admin-btn" onclick="window._toggleModPub('${m.id}', ${!m.is_published})">${m.is_published ? 'Unpublish' : 'Publish'}</button>
          <button class="admin-btn danger" onclick="window._deleteModule('${m.id}')">REMOVE</button>
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
  window._aiGenerateQuiz = async function (moduleId, moduleTitle, fileUrl = '', fileName = '') {
    const numQ = prompt(`AI Quiz Generator\n\nGenerate a quiz from "${moduleTitle}".\n\nHow many questions? (3-20)`, '10');
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
    overlay.style.display = 'flex';
    document.getElementById('aiGenModuleTitle').textContent = `Module: ${moduleTitle} · ${num} questions`;

    const statusTextEl = document.getElementById('aiGenStatusText');

    try {
      if (statusTextEl) {
        statusTextEl.innerHTML = 'Reading lesson document…<br>This may take 10–20 seconds.';
      }

      let extractedText = '';

      // 1. Check if module already has content cached in memory or loaded from database
      const cachedMod = currentModulesMap.get(moduleId);
      if (cachedMod?.content && cachedMod.content.trim().length >= 50) {
        extractedText = cachedMod.content.trim();
      }

      // 2. If an uploaded document exists and we don't have text yet, extract it client-side (Word & PDF)
      if (!extractedText && fileUrl) {
        if (statusTextEl) {
          statusTextEl.innerHTML = 'Analyzing and reading PDF/document…<br>Pengu is preparing key concepts.';
        }

        try {
          extractedText = await extractDocumentText(fileUrl, fileName);
          if (extractedText && extractedText.length >= 50) {
            // Cache content in Supabase classroom_modules so subsequent quiz runs are instant
            supa.from('classroom_modules').update({ content: extractedText.slice(0, 30000) }).eq('id', moduleId).then(() => {});
            if (cachedMod) cachedMod.content = extractedText;
          }
        } catch (err) {
          console.warn('Client-side document text extraction warning:', err);
          // Continue — the backend will attempt server-side extraction as fallback
        }
      }

      if (statusTextEl) {
        statusTextEl.innerHTML = extractedText
          ? 'Pengu is reading notes & drafting quiz questions…<br>This may take 15–30 seconds.'
          : 'Sending document to server for processing…<br>This may take 30–60 seconds.';
      }

      const payload = {
        num_questions: num,
        quiz_title: `Quiz: ${moduleTitle}`,
      };
      if (extractedText && extractedText.length >= 50) {
        payload.content = extractedText.slice(0, 30000);
      }

      const data = await api('POST', `/classrooms/${currentClassroomId}/modules/${moduleId}/generate-quiz`, payload);

      overlay.style.display = 'none';

      if (data && !data.error) {
        toast(`${data.message} Quiz saved as draft.`, 'success');
        // Show the generated quiz preview
        showQuizPreview(data.quiz, data.questions);
      } else {
        // Go back to class detail
        document.getElementById('profClassDetail').style.display = '';
        toast(data?.error || 'AI quiz generation failed. Try again.', 'error');
      }
    } catch (err) {
      console.error('AI quiz generation error:', err);
      overlay.style.display = 'none';
      document.getElementById('profClassDetail').style.display = '';
      toast('AI quiz generation encountered an unexpected error. Please try again.', 'error');
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
    activePreviewQuiz = quiz;
    pendingDeletedQuestionIds = [];
    document.getElementById('profClassDetail').style.display = 'none';
    document.getElementById('aiGeneratingOverlay').style.display = 'none';
    const view = document.getElementById('quizPreviewView');
    view.style.display = '';

    document.getElementById('quizPreviewTitle').textContent = quiz.title || 'Quiz';
    document.getElementById('quizPreviewMeta').textContent =
      `${questions.length} questions · ${quiz.is_published ? 'Published' : 'Draft'}${quiz.is_ai_generated ? ' · AI Generated' : ''}`;

    // Action buttons
    document.getElementById('quizPreviewActions').innerHTML = `
      <button class="admin-btn ${quiz.is_published ? '' : 'primary'}" onclick="window._toggleQuizPub('${quiz.id}', ${!quiz.is_published})">
        ${quiz.is_published ? 'Unpublish' : 'Publish Quiz'}
      </button>
    `;

    const container = document.getElementById('quizPreviewQuestions');
    container.innerHTML = questions.map(renderEditableQuestion).join('');
    container.querySelectorAll('.quiz-preview-card').forEach(bindQuestionCard);
  }

  function renderEditableQuestion(question, index) {
    const options = Array.isArray(question.options) ? question.options.join('\n') : '';
    return `
      <section class="quiz-preview-card quiz-edit-card" data-question-id="${esc(question.id || '')}" data-question-type="${esc(question.question_type || 'multiple_choice')}" draggable="true">
        <div class="qp-number"><span class="qp-drag-handle" aria-label="Drag to reorder">Drag to reorder</span><span class="qp-position">Question ${index + 1}</span>
          <button class="admin-btn danger qp-remove-question" type="button">Remove</button>
        </div>
        <label>Question<input class="qp-edit-text" type="text" maxlength="2000" value="${esc(question.question_text || '')}" /></label>
        <label>Options, one per line<textarea class="qp-edit-options" rows="4">${esc(options)}</textarea></label>
        <label>Correct answer<input class="qp-edit-answer" type="text" maxlength="1000" value="${esc(question.correct_answer || '')}" /></label>
        <label>Explanation<textarea class="qp-edit-explanation" rows="2">${esc(question.explanation || '')}</textarea></label>
      </section>`;
  }

  function bindQuestionCard(card) {
    card.querySelector('.qp-remove-question')?.addEventListener('click', () => {
      if (card.dataset.questionId) pendingDeletedQuestionIds.push(card.dataset.questionId);
      card.remove();
      renumberPreviewQuestions();
    });
    card.addEventListener('dragstart', (event) => {
      card.classList.add('dragging');
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', card.dataset.questionId || 'new-question');
    });
    card.addEventListener('dragend', () => card.classList.remove('dragging'));
    card.addEventListener('dragover', (event) => {
      event.preventDefault();
      const dragging = document.querySelector('.quiz-edit-card.dragging');
      if (!dragging || dragging === card) return;
      const bounds = card.getBoundingClientRect();
      const insertAfter = event.clientY > bounds.top + bounds.height / 2;
      card.parentNode.insertBefore(dragging, insertAfter ? card.nextSibling : card);
      renumberPreviewQuestions();
    });
  }

  function renumberPreviewQuestions() {
    document.querySelectorAll('#quizPreviewQuestions .qp-position').forEach((el, index) => {
      el.textContent = `Question ${index + 1}`;
    });
  }

  async function savePreviewQuestions() {
    if (!activePreviewQuiz) return;
    const container = document.getElementById('quizPreviewQuestions');
    const cards = [...container.querySelectorAll('.quiz-edit-card')];
    const pending = cards.map(card => ({
      card,
      question_text: card.querySelector('.qp-edit-text').value.trim(),
      options: card.querySelector('.qp-edit-options').value.split('\n').map(value => value.trim()).filter(Boolean),
      correct_answer: card.querySelector('.qp-edit-answer').value.trim(),
      explanation: card.querySelector('.qp-edit-explanation').value.trim() || null,
    }));
    if (pending.some(question => !question.question_text || !question.correct_answer)) {
      toast('Each question needs question text and a correct answer.', 'error');
      return;
    }

    const saveButton = document.getElementById('savePreviewQuestions');
    saveButton.disabled = true;
    try {
      for (const question of pending) {
        const body = {
          question_text: question.question_text,
          question_type: question.card.dataset.questionType || 'multiple_choice',
          options: question.options,
          correct_answer: question.correct_answer,
          explanation: question.explanation,
        };
        const id = question.card.dataset.questionId;
        const result = id
          ? await api('PATCH', `/classrooms/${currentClassroomId}/quizzes/${activePreviewQuiz.id}/questions/${id}`, body)
          : await api('POST', `/classrooms/${currentClassroomId}/quizzes/${activePreviewQuiz.id}/questions`, body);
        if (!result || result.error) throw new Error(result?.error || 'Failed to save a question.');
        if (result.question?.id) question.card.dataset.questionId = result.question.id;
      }
      for (const id of pendingDeletedQuestionIds) {
        const result = await api('DELETE', `/classrooms/${currentClassroomId}/quizzes/${activePreviewQuiz.id}/questions/${id}`);
        if (!result || result.error) throw new Error(result?.error || 'Failed to remove a question.');
      }
      const reorder = await api('PATCH', `/classrooms/${currentClassroomId}/quizzes/${activePreviewQuiz.id}/questions/reorder`, {
        question_ids: [...container.querySelectorAll('.quiz-edit-card')].map(card => card.dataset.questionId),
      });
      if (!reorder || reorder.error) throw new Error(reorder?.error || 'Failed to save question order.');
      toast('Quiz questions saved.', 'success');
      await window._previewQuiz(activePreviewQuiz.id);
    } catch (err) {
      toast(err.message || 'Failed to save quiz questions.', 'error');
    } finally {
      saveButton.disabled = false;
    }
  }

  /* ── Quizzes ───────────────────────────────── */
  async function loadQuizzes() {
    const container = document.getElementById('quizzesList');
    container.innerHTML = '<div class="admin-loading"><div class="admin-spinner"></div></div>';

    const data = await api('GET', `/classrooms/${currentClassroomId}/quizzes`);
    if (!data || data.error) {
      container.innerHTML = '<div class="admin-empty"><div class="empty-text">Failed to load quizzes</div></div>';
      return;
    }

    if (!data.quizzes || data.quizzes.length === 0) {
      container.innerHTML = '<div class="admin-empty"><div class="empty-text">No quizzes yet. Create one for your students!</div></div>';
      return;
    }

    container.innerHTML = data.quizzes.map(q => `
      <div class="content-card" style="cursor:pointer" onclick="window._previewQuiz('${q.id}')">
        <div>
          <h4>${esc(q.title)}</h4>
          <div class="content-meta">${q.question_count || 0} questions · ${q.is_published ? 'Published' : 'Draft'}${q.time_limit_minutes ? ` · ${q.time_limit_minutes} min` : ''}${q.is_ai_generated ? ' · AI Generated' : ''}</div>
        </div>
        <div class="admin-actions">
          <button class="admin-btn" onclick="event.stopPropagation();window._toggleQuizPub('${q.id}', ${!q.is_published})">${q.is_published ? 'Unpublish' : 'Publish'}</button>
          <button class="admin-btn danger" onclick="event.stopPropagation();window._deleteQuiz('${q.id}')">REMOVE</button>
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
        <button type="button" class="admin-btn danger" style="float:right;padding:0.2rem 0.4rem;font-size:0.65rem" onclick="this.closest('.quiz-question-card').remove()">Remove</button>
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
      body.innerHTML = '<tr><td colspan="4"><div class="admin-empty"><div class="empty-text">Failed to load results</div></div></td></tr>';
      return;
    }

    if (!data.results || data.results.length === 0) {
      body.innerHTML = '<tr><td colspan="4"><div class="admin-empty"><div class="empty-text">No submissions yet</div></div></td></tr>';
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

  /* ── In-App Document Viewer (No Download, Authentic Multi-Page & Zero Crampiness) ── */
  window._openDocViewer = function(url, fileName, title) {
    const modal = document.getElementById('docViewerModal');
    const titleEl = document.getElementById('docViewerTitle');
    const badgeEl = document.getElementById('docViewerBadge');
    const loadingEl = document.getElementById('docViewerLoading');
    const frameWrap = document.getElementById('docViewerFrameWrap');
    const modeSwitch = document.getElementById('docViewerModes');
    const btnPages = document.getElementById('docViewerBtnPages');
    const btnGoogle = document.getElementById('docViewerBtnGoogle');
    const btnOffice = document.getElementById('docViewerBtnOffice');
    const btnText = document.getElementById('docViewerBtnText');

    if (!modal || !frameWrap) {
      window.open(`https://docs.google.com/viewer?url=${encodeURIComponent(url)}&embedded=true`, '_blank');
      return;
    }

    const cleanName = fileName || 'document';
    const ext = cleanName.split('?')[0].split('.').pop().toLowerCase();
    const isDocx = ext === 'docx';
    const isDoc = ext === 'doc';
    const isPdf = ext === 'pdf';
    const isImg = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(ext);

    titleEl.textContent = title || cleanName;
    badgeEl.textContent = isPdf ? 'PDF' : (isDocx || isDoc) ? 'WORD DOCUMENT' : isImg ? 'IMAGE' : 'DOCUMENT';

    modal.classList.add('visible');
    loadingEl.style.display = 'flex';
    frameWrap.style.display = 'none';
    frameWrap.innerHTML = '';

    // In-memory buffer cache for instant view mode toggling without re-downloading
    let cachedBuffer = null;

    const setActiveModeBtn = (activeBtn) => {
      [btnPages, btnGoogle, btnOffice, btnText].forEach(b => {
        if (!b) return;
        if (b === activeBtn) {
          b.classList.add('active-doc-mode');
        } else {
          b.classList.remove('active-doc-mode');
        }
      });
    };

    const renderGoogleView = () => {
      setActiveModeBtn(btnGoogle);
      loadingEl.style.display = 'none';
      frameWrap.style.display = 'block';
      frameWrap.innerHTML = `<iframe src="https://docs.google.com/viewer?url=${encodeURIComponent(url)}&embedded=true" style="width:100%;height:100%;border:none;background:#fff;" allowfullscreen></iframe>`;
    };

    const renderOfficeView = () => {
      setActiveModeBtn(btnOffice);
      loadingEl.style.display = 'none';
      frameWrap.style.display = 'block';
      frameWrap.innerHTML = `<iframe src="https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}" style="width:100%;height:100%;border:none;background:#fff;" allowfullscreen></iframe>`;
    };

    const renderMammothTextView = async () => {
      setActiveModeBtn(btnText);
      loadingEl.style.display = 'flex';
      frameWrap.style.display = 'none';
      try {
        if (!cachedBuffer) {
          const res = await fetch(url);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          cachedBuffer = await res.arrayBuffer();
        }
        if (window.mammoth && typeof window.mammoth.convertToHtml === 'function') {
          const res = await window.mammoth.convertToHtml({ arrayBuffer: cachedBuffer });
          loadingEl.style.display = 'none';
          frameWrap.style.display = 'block';
          frameWrap.innerHTML = `
            <div class="docx-document-paper">
              ${res.value || '<p>Document has no readable text.</p>'}
            </div>
          `;
        } else {
          throw new Error('Mammoth parser unavailable');
        }
      } catch (err) {
        console.warn('Mammoth text render error, switching to Google Docs:', err);
        renderGoogleView();
      }
    };

    const renderDocxPagesView = async () => {
      setActiveModeBtn(btnPages);
      loadingEl.style.display = 'flex';
      frameWrap.style.display = 'none';

      try {
        if (!cachedBuffer) {
          const res = await fetch(url);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          cachedBuffer = await res.arrayBuffer();
        }

        if (window.docx && typeof window.docx.renderAsync === 'function') {
          frameWrap.innerHTML = '';
          loadingEl.style.display = 'none';
          frameWrap.style.display = 'block';
          await window.docx.renderAsync(cachedBuffer, frameWrap, null, {
            inWrapper: true,
            ignoreWidth: false,
            ignoreHeight: false,
            breakPages: true,
            experimental: true,
            useBase64URL: true,
            renderHeaders: true,
            renderFooters: true
          });
        } else {
          throw new Error('docx-preview parser unavailable');
        }
      } catch (err) {
        console.warn('docx-preview render error, falling back to Google Docs View:', err);
        renderGoogleView();
      }
    };

    if (isDocx || isDoc) {
      if (modeSwitch) modeSwitch.style.display = 'flex';

      // Setup button click events
      if (btnPages) {
        btnPages.style.display = isDocx ? 'inline-block' : 'none';
        btnPages.onclick = renderDocxPagesView;
      }
      if (btnGoogle) {
        btnGoogle.style.display = 'inline-block';
        btnGoogle.onclick = renderGoogleView;
      }
      if (btnOffice) {
        btnOffice.style.display = 'inline-block';
        btnOffice.onclick = renderOfficeView;
      }
      if (btnText) {
        btnText.style.display = isDocx ? 'inline-block' : 'none';
        btnText.onclick = renderMammothTextView;
      }

      // Default rendering:
      if (isDocx && window.docx && typeof window.docx.renderAsync === 'function') {
        renderDocxPagesView();
      } else {
        renderGoogleView();
      }
    } else {
      if (modeSwitch) modeSwitch.style.display = 'none';

      if (isPdf) {
        loadingEl.style.display = 'none';
        frameWrap.style.display = 'block';
        frameWrap.innerHTML = `
          <object data="${url}#toolbar=1" type="application/pdf" style="width:100%;height:100%;">
            <iframe src="${url}#toolbar=1" style="width:100%;height:100%;border:none;background:#fff;" allowfullscreen>
              <div style="padding:2rem;text-align:center;color:#94a3b8;font-family:'Nunito',sans-serif;">
                <iframe src="https://docs.google.com/viewer?url=${encodeURIComponent(url)}&embedded=true" style="width:100%;height:600px;border:none;" allowfullscreen></iframe>
              </div>
            </iframe>
          </object>
        `;
      } else if (isImg) {
        loadingEl.style.display = 'none';
        frameWrap.style.display = 'flex';
        frameWrap.innerHTML = `
          <div style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;padding:2rem;">
            <img src="${url}" alt="${esc(cleanName)}" style="max-width:100%;max-height:100%;object-fit:contain;border-radius:8px;box-shadow:0 10px 30px rgba(0,0,0,0.5);" />
          </div>
        `;
      } else {
        renderGoogleView();
      }
    }
  };

  /* ── Boot ──────────────────────────────────── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(init, 200));
  } else {
    setTimeout(init, 200);
  }
})();
