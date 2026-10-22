/**
 * Odyssey — Admin Dashboard JS
 * ────────────────────────────────
 * Full admin panel logic: stats, user management, classroom oversight, audit log.
 * Uses the same backendCall() helper from main.js.
 */
(function () {
  'use strict';

  const BACKEND_API = 'https://os-odyssey-api.onrender.com/api';

  /* ── Auth helper ───────────────────────────── */
  async function getSession() {
    const { data: { session } } = await supa.auth.getSession();
    return session;
  }

  async function apiCall(method, path, body = null) {
    const session = await getSession();
    if (!session) return null;
    const opts = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
    };
    if (body) opts.body = JSON.stringify(body);
    try {
      const res = await fetch(`${BACKEND_API}${path}`, opts);
      if (!res.ok) {
        const text = await res.text();
        console.error(`API ${method} ${path} → ${res.status}:`, text);
        try { return { error: JSON.parse(text).detail || text }; } catch { return { error: text }; }
      }
      return await res.json();
    } catch (err) {
      console.error(`API ${method} ${path} error:`, err);
      return { error: err.message };
    }
  }

  /* ── State ──────────────────────────────────── */
  let currentUserPage = 1;
  let currentAuditPage = 1;
  let currentClassroomPage = 1;
  let searchTimeout = null;

  /* ── Init ───────────────────────────────────── */
  async function initAdmin() {
    const session = await getSession();
    if (!session) {
      window.location.href = 'login.html';
      return;
    }

    // Check role via Supabase directly (avoids CORS issues with backend)
    const { data: profile, error } = await supa
      .from('profiles')
      .select('role')
      .eq('id', session.user.id)
      .single();

    if (error || !profile) {
      window.location.href = 'dashboard.html';
      return;
    }

    if (profile.role !== 'admin') {
      showToast('Access denied — admin only.', 'error');
      setTimeout(() => { window.location.href = 'dashboard.html'; }, 1500);
      return;
    }

    setupTabs();
    setupSearch();
    setupModal();
    loadOverview();
    loadPendingCount();
  }

  /* ── Tabs ───────────────────────────────────── */
  function setupTabs() {
    document.querySelectorAll('.admin-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.admin-panel').forEach(p => p.classList.remove('active'));
        tab.classList.add('active');

        const panel = document.getElementById(`panel-${tab.dataset.tab}`);
        if (panel) panel.classList.add('active');

        switch (tab.dataset.tab) {
          case 'overview': loadOverview(); break;
          case 'users': loadUsers(); break;
          case 'classrooms': loadClassrooms(); break;
          case 'audit': loadAuditLog(); break;
          case 'applications': loadApplications(); break;
        }
      });
    });
  }

  /* ── Search & Filters ──────────────────────── */
  function setupSearch() {
    const searchInput = document.getElementById('userSearch');
    const roleFilter = document.getElementById('roleFilter');
    const auditFilter = document.getElementById('auditActionFilter');

    if (searchInput) {
      searchInput.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => { currentUserPage = 1; loadUsers(); }, 400);
      });
    }
    if (roleFilter) {
      roleFilter.addEventListener('change', () => { currentUserPage = 1; loadUsers(); });
    }
    if (auditFilter) {
      auditFilter.addEventListener('change', () => { currentAuditPage = 1; loadAuditLog(); });
    }
  }

  /* ══════════════════════════════════════════════
     OVERVIEW
     ══════════════════════════════════════════════ */
  async function loadOverview() {
    const data = await apiCall('GET', '/admin/stats');
    if (!data || data.error) return;

    const s = data.stats;
    setText('statTotalUsers', s.total_users);
    setText('statStudents', s.students);
    setText('statProfessors', s.professors);
    setText('statAdmins', s.admins);
    setText('statAvgXp', s.avg_xp);
    setText('statClassrooms', s.total_classrooms);

    // Load recent audit entries
    const audit = await apiCall('GET', '/admin/audit-log?per_page=10');
    if (audit && audit.entries) {
      renderAuditEntries(audit.entries, 'recentAuditList');
    }
  }

  /* ══════════════════════════════════════════════
     USERS
     ══════════════════════════════════════════════ */
  async function loadUsers() {
    const search = document.getElementById('userSearch')?.value || '';
    const role = document.getElementById('roleFilter')?.value || '';

    let url = `/admin/users?page=${currentUserPage}&per_page=20`;
    if (search) url += `&search=${encodeURIComponent(search)}`;
    if (role) url += `&role=${role}`;

    const body = document.getElementById('usersTableBody');
    body.innerHTML = '<tr><td colspan="8"><div class="admin-loading"><div class="admin-spinner"></div></div></td></tr>';

    const data = await apiCall('GET', url);
    if (!data || data.error) {
      body.innerHTML = '<tr><td colspan="8"><div class="admin-empty"><div class="empty-text">Failed to load users</div></div></td></tr>';
      return;
    }

    if (!data.users || data.users.length === 0) {
      body.innerHTML = '<tr><td colspan="8"><div class="admin-empty"><div class="empty-text">No users found</div></div></td></tr>';
      renderPagination('usersPagination', data, (p) => { currentUserPage = p; loadUsers(); });
      return;
    }

    body.innerHTML = data.users.map(u => `
      <tr>
        <td>
          <div class="user-cell">
            <img src="${escHtml(u.avatar || '../../assets/penguin-flower-removebg-preview.png')}" alt="" />
            <div class="user-info">
              <span class="user-name">${escHtml(u.username)}</span>
              <span class="user-email">${escHtml(u.email)}</span>
            </div>
          </div>
        </td>
        <td><span class="role-badge ${u.role || 'student'}">${u.role || 'student'}</span></td>
        <td>${u.xp || 0}</td>
        <td>${u.level || 1}</td>
        <td><span class="rank-badge ${u.rank || 'Bronze'}">${u.rank || 'Bronze'}</span></td>
        <td>${u.streak || 0}🔥</td>
        <td>${formatDate(u.created_at)}</td>
        <td>
          <div class="admin-actions">
            <button class="admin-btn" onclick="window._adminEditUser('${u.id}')">✏️</button>
            <button class="admin-btn danger" onclick="window._adminResetXp('${u.id}', '${escHtml(u.username)}')">🔄</button>
            <button class="admin-btn danger" onclick="window._adminDeleteUser('${u.id}', '${escHtml(u.username)}')">🗑️</button>
          </div>
        </td>
      </tr>
    `).join('');

    renderPagination('usersPagination', data, (p) => { currentUserPage = p; loadUsers(); });
  }

  /* ── User Actions ──────────────────────────── */
  window._adminEditUser = async function (userId) {
    const data = await apiCall('GET', `/admin/users/${userId}`);
    if (!data || !data.user) return showToast('Failed to load user.', 'error');

    const u = data.user;
    document.getElementById('editUserId').value = u.id;
    document.getElementById('editUsername').value = u.username || '';
    document.getElementById('editRole').value = u.role || 'student';
    document.getElementById('editXp').value = u.xp || 0;

    document.getElementById('editUserModal').classList.add('visible');
  };

  window._adminResetXp = async function (userId, username) {
    if (!confirm(`Reset ALL progress for "${username}"?\n\nThis resets XP, level, rank, badges, streak, and completed modules to defaults.`)) return;

    const data = await apiCall('POST', `/admin/users/${userId}/reset-xp`);
    if (data && !data.error) {
      showToast(`Progress reset for ${username}`, 'success');
      loadUsers();
    } else {
      showToast(data?.error || 'Failed to reset progress.', 'error');
    }
  };

  window._adminDeleteUser = async function (userId, username) {
    if (!confirm(`DELETE user "${username}"?\n\n⚠️ This permanently removes their account and ALL data (profile, quiz attempts, badges, classroom memberships). This cannot be undone.`)) return;

    const data = await apiCall('DELETE', `/admin/users/${userId}`);
    if (data && !data.error) {
      showToast(`User "${username}" deleted.`, 'success');
      loadUsers();
      loadOverview();
    } else {
      showToast(data?.error || 'Failed to delete user.', 'error');
    }
  };

  /* ── Edit User Modal ───────────────────────── */
  function setupModal() {
    const modal = document.getElementById('editUserModal');
    const closeBtn = document.getElementById('editUserClose');
    const cancelBtn = document.getElementById('editUserCancel');
    const form = document.getElementById('editUserForm');

    const close = () => modal.classList.remove('visible');
    closeBtn?.addEventListener('click', close);
    cancelBtn?.addEventListener('click', close);
    modal?.addEventListener('click', (e) => { if (e.target === modal) close(); });

    form?.addEventListener('submit', async (e) => {
      e.preventDefault();

      const userId = document.getElementById('editUserId').value;
      const updates = {
        username: document.getElementById('editUsername').value.trim(),
        role: document.getElementById('editRole').value,
        xp: parseInt(document.getElementById('editXp').value) || 0,
      };

      const data = await apiCall('PATCH', `/admin/users/${userId}`, updates);
      if (data && !data.error) {
        showToast('User updated!', 'success');
        close();
        loadUsers();
        loadOverview();
      } else {
        showToast(data?.error || 'Failed to update user.', 'error');
      }
    });
  }

  /* ══════════════════════════════════════════════
     CLASSROOMS
     ══════════════════════════════════════════════ */
  async function loadClassrooms() {
    const body = document.getElementById('classroomsTableBody');
    body.innerHTML = '<tr><td colspan="7"><div class="admin-loading"><div class="admin-spinner"></div></div></td></tr>';

    const data = await apiCall('GET', `/admin/classrooms?page=${currentClassroomPage}&per_page=20`);
    if (!data || data.error) {
      body.innerHTML = '<tr><td colspan="7"><div class="admin-empty"><div class="empty-text">Failed to load classrooms</div></div></td></tr>';
      return;
    }

    if (!data.classrooms || data.classrooms.length === 0) {
      body.innerHTML = '<tr><td colspan="7"><div class="admin-empty"><div class="empty-text">No classrooms yet</div></div></td></tr>';
      return;
    }

    body.innerHTML = data.classrooms.map(c => `
      <tr>
        <td><strong>${escHtml(c.name)}</strong></td>
        <td>${escHtml(c.professor_username || 'Unknown')}</td>
        <td><span class="join-code" style="cursor:pointer" onclick="navigator.clipboard.writeText('${escHtml(c.join_code)}');window._adminToast('Copied!','info')">${escHtml(c.join_code)}</span></td>
        <td>${c.member_count || 0}</td>
        <td><span class="role-badge ${c.is_active ? 'professor' : 'student'}">${c.is_active ? 'Active' : 'Archived'}</span></td>
        <td>${formatDate(c.created_at)}</td>
        <td>
          <div class="admin-actions">
            <button class="admin-btn danger" onclick="window._adminDeleteClassroom('${c.id}', '${escHtml(c.name)}')">🗑️</button>
          </div>
        </td>
      </tr>
    `).join('');

    renderPagination('classroomsPagination', data, (p) => { currentClassroomPage = p; loadClassrooms(); });
  }

  window._adminDeleteClassroom = async function (id, name) {
    if (!confirm(`Delete classroom "${name}"?\n\nThis removes all modules, quizzes, and student enrollments.`)) return;

    const data = await apiCall('DELETE', `/admin/classrooms/${id}`);
    if (data && !data.error) {
      showToast(`Classroom "${name}" deleted.`, 'success');
      loadClassrooms();
      loadOverview();
    } else {
      showToast(data?.error || 'Failed to delete classroom.', 'error');
    }
  };

  window._adminToast = showToast;

  /* ══════════════════════════════════════════════
     AUDIT LOG
     ══════════════════════════════════════════════ */
  async function loadAuditLog() {
    const action = document.getElementById('auditActionFilter')?.value || '';
    let url = `/admin/audit-log?page=${currentAuditPage}&per_page=30`;
    if (action) url += `&action=${action}`;

    const container = document.getElementById('auditLogList');
    container.innerHTML = '<div class="admin-loading"><div class="admin-spinner"></div></div>';

    const data = await apiCall('GET', url);
    if (!data || data.error) {
      container.innerHTML = '<div class="admin-empty"><div class="empty-text">Failed to load audit log</div></div>';
      return;
    }

    renderAuditEntries(data.entries || [], 'auditLogList');
    renderPagination('auditPagination', data, (p) => { currentAuditPage = p; loadAuditLog(); });
  }

  function renderAuditEntries(entries, containerId) {
    const container = document.getElementById(containerId);
    if (!entries.length) {
      container.innerHTML = '<div class="admin-empty"><div class="empty-text">No entries found</div></div>';
      return;
    }

    container.innerHTML = entries.map(e => {
      const { icon, iconClass, label } = auditMeta(e.action);
      const detailStr = e.detail ? formatAuditDetail(e.action, e.detail) : '';

      return `
        <div class="audit-entry">
          <div class="audit-icon ${iconClass}">${icon}</div>
          <div class="audit-content">
            <div class="audit-action"><strong>${escHtml(e.username || 'Unknown')}</strong> ${label}</div>
            ${detailStr ? `<div class="audit-detail">${detailStr}</div>` : ''}
            <div class="audit-time">${formatDateFull(e.created_at)}${e.ip_address ? ' · ' + e.ip_address : ''}</div>
          </div>
        </div>
      `;
    }).join('');
  }

  function auditMeta(action) {
    const map = {
      complete_module: { icon: '📗', iconClass: 'module', label: 'completed a module' },
      award_badge: { icon: '🏅', iconClass: 'badge', label: 'earned a badge' },
      quiz_xp: { icon: '⚡', iconClass: 'xp', label: 'earned quiz XP' },
      update_streak: { icon: '🔥', iconClass: 'streak', label: 'streak updated' },
      profile_update: { icon: '✏️', iconClass: 'profile', label: 'updated profile' },
      admin_role_change: { icon: '🛡️', iconClass: 'admin', label: 'changed a user role' },
      admin_delete_user: { icon: '🗑️', iconClass: 'admin', label: 'deleted a user' },
      admin_user_edit: { icon: '✏️', iconClass: 'admin', label: 'edited a user' },
      admin_reset_xp: { icon: '🔄', iconClass: 'admin', label: 'reset user progress' },
      admin_delete_classroom: { icon: '🏫', iconClass: 'admin', label: 'deleted a classroom' },
      create_classroom: { icon: '🏫', iconClass: 'module', label: 'created a classroom' },
      delete_classroom: { icon: '🏫', iconClass: 'admin', label: 'deleted a classroom' },
    };
    return map[action] || { icon: '📝', iconClass: 'profile', label: action };
  }

  function formatAuditDetail(action, detail) {
    if (!detail || typeof detail !== 'object') return '';
    const parts = [];
    if (detail.module_id) parts.push(`Module: ${detail.module_id}`);
    if (detail.badge_id) parts.push(`Badge: ${detail.badge_id}`);
    if (detail.xp_before !== undefined) parts.push(`XP: ${detail.xp_before} → ${detail.xp_after}`);
    if (detail.xp_awarded) parts.push(`+${detail.xp_awarded} XP`);
    if (detail.streak_before !== undefined) parts.push(`Streak: ${detail.streak_before} → ${detail.streak_after}`);
    if (detail.old_role) parts.push(`Role: ${detail.old_role} → ${detail.new_role}`);
    if (detail.target_username) parts.push(`User: ${detail.target_username}`);
    if (detail.classroom_name) parts.push(`Classroom: ${detail.classroom_name}`);
    if (detail.join_code) parts.push(`Code: ${detail.join_code}`);
    if (detail.fields_updated) parts.push(`Fields: ${detail.fields_updated.join(', ')}`);
    return parts.join(' · ');
  }

  /* ══════════════════════════════════════════════
     UTILS
     ══════════════════════════════════════════════ */

  function renderPagination(containerId, data, onPage) {
    const container = document.getElementById(containerId);
    if (!container || !data.total_pages || data.total_pages <= 1) {
      if (container) container.innerHTML = '';
      return;
    }

    const page = data.page;
    const total = data.total_pages;
    let html = '';

    html += `<button ${page <= 1 ? 'disabled' : ''} onclick="this._pg(${page - 1})">← Prev</button>`;
    html += `<span class="page-info">Page ${page} of ${total}</span>`;
    html += `<button ${page >= total ? 'disabled' : ''} onclick="this._pg(${page + 1})">Next →</button>`;

    container.innerHTML = html;

    container.querySelectorAll('button').forEach(btn => {
      btn._pg = onPage;
    });
  }

  function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value ?? '—';
  }

  function escHtml(str) {
    if (!str) return '';
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  function formatDate(iso) {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch { return '—'; }
  }

  function formatDateFull(iso) {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch { return '—'; }
  }

  function showToast(message, type = 'info') {
    const toast = document.getElementById('adminToast');
    if (!toast) return;
    toast.textContent = message;
    toast.className = `admin-toast ${type} visible`;
    setTimeout(() => toast.classList.remove('visible'), 3500);
  }

  /* ── Applications Management ────────────────── */
  let appsPage = 1;

  async function loadApplications(page = 1) {
    appsPage = page;
    const list = document.getElementById('applicationsList');
    if (!list) return;
    list.innerHTML = '<div class="admin-loading"><div class="admin-spinner"></div></div>';

    const statusFilter = document.getElementById('appStatusFilter')?.value || '';
    let url = `/applications/instructor?page=${page}&per_page=20`;
    if (statusFilter) url += `&status=${statusFilter}`;

    let applications = null;
    const data = await apiCall('GET', url);
    if (data && !data.error && data.applications) {
      applications = data.applications;
    } else {
      // Direct Supabase fallback
      try {
        let query = supa.from('instructor_applications').select('*');
        if (statusFilter) query = query.eq('status', statusFilter);
        const { data: supaApps, error } = await query
          .order('created_at', { ascending: false })
          .range((page - 1) * 20, page * 20 - 1);

        if (!error && supaApps) {
          const userIds = [...new Set(supaApps.map(a => a.user_id).filter(Boolean))];
          let profileMap = {};
          if (userIds.length > 0) {
            const { data: profs } = await supa.from('profiles').select('id, username, email').in('id', userIds);
            if (profs) profs.forEach(p => { profileMap[p.id] = p; });
          }
          applications = supaApps.map(a => ({
            ...a,
            username: profileMap[a.user_id]?.username || a.full_name || 'Applicant',
            email: profileMap[a.user_id]?.email || a.work_email || '',
          }));
        }
      } catch (err) {
        console.warn('Direct Supabase fetch for applications error:', err);
      }
    }

    if (!applications) {
      list.innerHTML = '<div class="admin-empty"><div class="empty-text">Failed to load applications.</div></div>';
      return;
    }

    if (applications.length === 0) {
      list.innerHTML = '<div class="admin-empty"><div class="empty-text">No applications found.</div></div>';
      return;
    }

    list.innerHTML = applications.map(app => {
      const date = new Date(app.created_at).toLocaleDateString();
      const statusColor = app.status === 'pending' ? '#f5a623' : app.status === 'approved' ? '#22c55e' : '#ef4444';
      const statusText = app.status.charAt(0).toUpperCase() + app.status.slice(1);
      return `
        <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:1.2rem;margin-bottom:1rem;border-left:4px solid ${statusColor};">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:0.75rem;">
            <div>
              <div style="display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap;">
                <strong style="color:#fff;font-family:'Nunito',sans-serif;font-size:1.05rem;">${esc(app.full_name || app.username || 'Applicant')}</strong>
                ${app.position_title ? `<span style="font-size:0.75rem;padding:0.15rem 0.5rem;border-radius:4px;background:rgba(56,189,248,0.15);color:#38bdf8;font-weight:700;">${esc(app.position_title)}</span>` : ''}
              </div>
              <span style="font-size:0.78rem;color:rgba(255,255,255,0.5);display:block;margin-top:0.25rem;">
                Account: ${esc(app.username || 'Unknown')} (${esc(app.email || '')}) · Applied ${date}
              </span>
            </div>
            <span style="display:inline-block;padding:0.25rem 0.75rem;border-radius:20px;background:${statusColor}22;color:${statusColor};font-size:0.75rem;font-weight:700;font-family:'Nunito',sans-serif;">${statusText}</span>
          </div>

          <!-- Academic & Teaching Info Grid -->
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:0.6rem;margin-top:0.9rem;padding:0.75rem;background:rgba(0,0,0,0.25);border-radius:8px;font-size:0.8rem;color:rgba(255,255,255,0.75);">
            <div><strong style="color:rgba(255,255,255,0.4);display:block;font-size:0.7rem;text-transform:uppercase;">Location</strong>${esc([app.city, app.province, app.region, app.country].filter(Boolean).join(', ') || 'Not specified')}</div>
            <div><strong style="color:rgba(255,255,255,0.4);display:block;font-size:0.7rem;text-transform:uppercase;">Institution</strong>${esc(app.institution || 'Not specified')}</div>
            <div><strong style="color:rgba(255,255,255,0.4);display:block;font-size:0.7rem;text-transform:uppercase;">Department</strong>${esc(app.department || 'Not specified')}</div>
            <div><strong style="color:rgba(255,255,255,0.4);display:block;font-size:0.7rem;text-transform:uppercase;">Experience</strong>${esc(app.years_experience || 'Not specified')}</div>
            <div><strong style="color:rgba(255,255,255,0.4);display:block;font-size:0.7rem;text-transform:uppercase;">Work Email</strong>${esc(app.work_email || 'None')}</div>
            ${app.phone_number ? `<div><strong style="color:rgba(255,255,255,0.4);display:block;font-size:0.7rem;text-transform:uppercase;">Phone</strong>${esc(app.phone_number)}</div>` : ''}
            <div><strong style="color:rgba(255,255,255,0.4);display:block;font-size:0.7rem;text-transform:uppercase;">Subjects to Teach</strong>${esc(app.subjects_taught || 'General')}</div>
          </div>

          <!-- Statement / Reason -->
          <div style="margin-top:0.8rem;">
            <strong style="color:rgba(255,255,255,0.45);display:block;font-size:0.72rem;text-transform:uppercase;letter-spacing:0.04em;">Statement of Purpose</strong>
            <p style="font-size:0.85rem;color:rgba(255,255,255,0.75);margin:0.25rem 0 0;font-family:'Nunito',sans-serif;line-height:1.5;">${esc(app.reason)}</p>
          </div>

          <!-- Uploaded Verification Documents -->
          <div style="display:flex;flex-wrap:wrap;gap:0.75rem;margin-top:0.9rem;padding-top:0.75rem;border-top:1px solid rgba(255,255,255,0.06);">
            ${app.id_document_url ? `
              <div style="display:flex;align-items:center;gap:0.5rem;background:rgba(255,255,255,0.05);padding:0.4rem 0.8rem;border-radius:6px;border:1px solid rgba(255,255,255,0.1);">
                <span style="font-size:0.75rem;font-weight:700;color:rgba(255,255,255,0.85);">Faculty ID:</span>
                <a href="${esc(app.id_document_url)}" target="_blank" rel="noopener noreferrer" style="font-size:0.75rem;color:#38bdf8;text-decoration:underline;">View ID Document</a>
              </div>
            ` : '<span style="font-size:0.75rem;color:rgba(255,255,255,0.35);">No ID document attached</span>'}

            ${app.teaching_proof_url ? `
              <div style="display:flex;align-items:center;gap:0.5rem;background:rgba(255,255,255,0.05);padding:0.4rem 0.8rem;border-radius:6px;border:1px solid rgba(255,255,255,0.1);">
                <span style="font-size:0.75rem;font-weight:700;color:rgba(255,255,255,0.85);">Teacher Proof Photo:</span>
                <a href="${esc(app.teaching_proof_url)}" target="_blank" rel="noopener noreferrer" style="font-size:0.75rem;color:#38bdf8;text-decoration:underline;">View Teaching Proof</a>
              </div>
            ` : '<span style="font-size:0.75rem;color:rgba(255,255,255,0.35);">No teaching proof photo attached</span>'}
          </div>

          ${app.review_note ? `<p style="font-size:0.78rem;color:rgba(255,255,255,0.45);margin-top:0.6rem;font-style:italic;">Admin note: ${esc(app.review_note)}</p>` : ''}
          ${app.status === 'pending' ? `
            <div style="display:flex;gap:0.6rem;margin-top:1rem;">
              <button class="admin-btn success" onclick="window._reviewApp('${app.id}','approved')" style="font-size:0.8rem;padding:0.4rem 1.2rem;background:#22c55e22;border-color:#22c55e55;color:#4ade80;">Approve Application</button>
              <button class="admin-btn danger" onclick="window._reviewApp('${app.id}','denied')" style="font-size:0.8rem;padding:0.4rem 1.2rem;background:#ef444422;border-color:#ef444455;color:#f87171;">Deny Application</button>
            </div>
          ` : ''}
        </div>
      `;
    }).join('');
  }

  window._reviewApp = async function(appId, newStatus) {
    const note = newStatus === 'denied' ? prompt('Optional denial reason:') : null;
    let handled = false;

    // Try backend API first
    const data = await apiCall('PATCH', `/applications/instructor/${appId}`, {
      status: newStatus,
      review_note: note || null,
    });

    if (data && !data.error) {
      handled = true;
    } else {
      // Direct Supabase fallback
      try {
        const session = await getSession();
        const { data: appData, error: fetchErr } = await supa
          .from('instructor_applications')
          .select('*')
          .eq('id', appId)
          .single();

        if (fetchErr || !appData) throw new Error('Application record not found.');

        const { error: updateErr } = await supa
          .from('instructor_applications')
          .update({
            status: newStatus,
            review_note: note || null,
            reviewed_at: new Date().toISOString(),
            reviewed_by: session.user.id,
          })
          .eq('id', appId);

        if (updateErr) throw updateErr;

        if (newStatus === 'approved') {
          await supa
            .from('profiles')
            .update({ role: 'professor' })
            .eq('id', appData.user_id);
        }
        handled = true;
      } catch (err) {
        console.error('Supabase application review error:', err);
        showToast(err.message || 'Failed to review application.', 'error');
        return;
      }
    }

    if (handled) {
      showToast(`Application ${newStatus}!`, 'success');
      loadApplications(appsPage);
      loadPendingCount();
    }
  };

  async function loadPendingCount() {
    const badge = document.getElementById('pendingAppsBadge');
    if (!badge) return;

    let total = null;
    const data = await apiCall('GET', '/applications/instructor?status=pending&per_page=1');
    if (data && !data.error && typeof data.total === 'number') {
      total = data.total;
    } else {
      try {
        const { count, error } = await supa
          .from('instructor_applications')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'pending');
        if (!error && typeof count === 'number') {
          total = count;
        }
      } catch (e) {
        // silent
      }
    }

    if (typeof total === 'number' && total > 0) {
      badge.textContent = total;
      badge.style.display = '';
    } else {
      badge.style.display = 'none';
    }
  }

  // Filter listener
  document.getElementById('appStatusFilter')?.addEventListener('change', () => loadApplications(1));

  function esc(s) { const d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; }

  /* ── Boot ───────────────────────────────────── */
  // Wait for supa to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(initAdmin, 200));
  } else {
    setTimeout(initAdmin, 200);
  }

})();
