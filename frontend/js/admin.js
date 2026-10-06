/**
 * OS Odyssey — Admin Dashboard JS
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
      body.innerHTML = '<tr><td colspan="8"><div class="admin-empty"><div class="empty-icon">⚠️</div><div class="empty-text">Failed to load users</div></div></td></tr>';
      return;
    }

    if (!data.users || data.users.length === 0) {
      body.innerHTML = '<tr><td colspan="8"><div class="admin-empty"><div class="empty-icon">👻</div><div class="empty-text">No users found</div></div></td></tr>';
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
      body.innerHTML = '<tr><td colspan="7"><div class="admin-empty"><div class="empty-icon">⚠️</div><div class="empty-text">Failed to load classrooms</div></div></td></tr>';
      return;
    }

    if (!data.classrooms || data.classrooms.length === 0) {
      body.innerHTML = '<tr><td colspan="7"><div class="admin-empty"><div class="empty-icon">🏫</div><div class="empty-text">No classrooms yet</div></div></td></tr>';
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
      container.innerHTML = '<div class="admin-empty"><div class="empty-icon">⚠️</div><div class="empty-text">Failed to load audit log</div></div>';
      return;
    }

    renderAuditEntries(data.entries || [], 'auditLogList');
    renderPagination('auditPagination', data, (p) => { currentAuditPage = p; loadAuditLog(); });
  }

  function renderAuditEntries(entries, containerId) {
    const container = document.getElementById(containerId);
    if (!entries.length) {
      container.innerHTML = '<div class="admin-empty"><div class="empty-icon">📋</div><div class="empty-text">No entries found</div></div>';
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

  /* ── Boot ───────────────────────────────────── */
  // Wait for supa to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(initAdmin, 200));
  } else {
    setTimeout(initAdmin, 200);
  }

})();
