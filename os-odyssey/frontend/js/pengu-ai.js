/**
 * OS Odyssey — Pengu AI Mentor Widget
 * ────────────────────────────────────
 * Interactive AI tutor that floats across course pages and simulations.
 * Provides contextual explanations, analogies, C code examples, and hints.
 */
(function () {
  'use strict';

  // Base API configuration (points to local dev if on localhost, else production backend)
  const BACKEND_API =
    window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
      ? (window.__USE_LOCAL_API ? 'http://127.0.0.1:8000/api' : 'https://os-odyssey-api.onrender.com/api')
      : 'https://os-odyssey-api.onrender.com/api';

  const DEFAULT_AVATAR = '../../assets/penguin-flower-removebg-preview.png';

  let chatHistory = [];
  let isThinking = false;
  let activeSelectedText = '';

  /* ── Detect Current Page Context ────────────────────────── */
  function getPageContext() {
    // 1. Classroom page check
    const lessonTitle = document.getElementById('lessonViewTitle')?.textContent?.trim();
    const classroomName = document.getElementById('studentClassDetailName')?.textContent?.trim();
    if (lessonTitle && lessonTitle !== 'Lesson Title') {
      return {
        title: `Lesson: ${lessonTitle}`,
        detail: classroomName ? `Classroom: ${classroomName}` : '',
        snippet: document.getElementById('lessonViewContent')?.innerText?.slice(0, 1500) || '',
      };
    }
    if (classroomName && classroomName !== 'Classroom') {
      return {
        title: `Classroom: ${classroomName}`,
        detail: 'Classroom Hub',
        snippet: document.getElementById('hubCourseDesc')?.innerText?.slice(0, 500) || '',
      };
    }

    // 2. Course player (course.html)
    const courseModuleTitle = document.getElementById('lessonModuleTitle')?.textContent?.trim();
    if (courseModuleTitle) {
      return {
        title: `Module: ${courseModuleTitle}`,
        detail: 'Course Reader',
        snippet: document.getElementById('lessonBody')?.innerText?.slice(0, 1500) || '',
      };
    }

    // 3. Simulations check
    const h1Text = document.querySelector('h1')?.textContent?.trim();
    if (document.body.dataset.kernelSim || window.location.pathname.includes('-sim')) {
      return {
        title: h1Text || 'OS Simulation Lab',
        detail: 'Interactive Simulation',
        snippet: document.querySelector('.sim-instructions, .instructions, main')?.innerText?.slice(0, 1000) || '',
      };
    }

    return {
      title: document.title.replace('OS Odyssey - ', '').trim() || 'Operating Systems',
      detail: 'OS Odyssey',
      snippet: '',
    };
  }

  /* ── Simple Markdown Formatter ──────────────────────────── */
  function renderMarkdown(rawText) {
    if (!rawText) return '';
    let text = rawText
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // Code blocks with syntax highlighting placeholder and copy button
    text = text.replace(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g, function (_, lang, code) {
      const codeId = 'code_' + Math.random().toString(36).substring(2, 9);
      return `<pre><button class="pengu-copy-code-btn" type="button" onclick="window._penguCopyCode('${codeId}')">Copy</button><code id="${codeId}">${code.trim()}</code></pre>`;
    });

    // Inline code
    text = text.replace(/`([^`]+)`/g, '<code>$1</code>');

    // Bold & italic
    text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    text = text.replace(/\*([^*]+)\*/g, '<em>$1</em>');

    // Headers
    text = text.replace(/^### (.*$)/gim, '<h5 style="margin:0.5rem 0 0.2rem;color:#f5a623;font-size:0.95rem;">$1</h5>');
    text = text.replace(/^## (.*$)/gim, '<h4 style="margin:0.6rem 0 0.3rem;color:#f5a623;font-size:1rem;">$1</h4>');

    // Lists
    text = text.replace(/^\s*[-*]\s+(.*$)/gim, '<li>$1</li>');
    text = text.replace(/(<li>.*<\/li>)/gims, '<ul>$1</ul>');

    // Paragraph line breaks
    text = text.replace(/\n\n+/g, '</p><p>');
    text = text.replace(/\n/g, '<br>');

    return `<p>${text}</p>`;
  }

  window._penguCopyCode = function (id) {
    const el = document.getElementById(id);
    if (!el) return;
    navigator.clipboard.writeText(el.innerText).then(() => {
      const btn = el.parentElement.querySelector('.pengu-copy-code-btn');
      if (btn) {
        btn.textContent = 'Copied!';
        setTimeout(() => (btn.textContent = 'Copy'), 2000);
      }
    });
  };

  /* ── Injects Widget HTML into DOM ────────────────────────── */
  function injectWidget() {
    if (document.getElementById('penguContainer')) return;

    // Use current avatar from brand or fallback
    const brandAvatar = document.querySelector('.brand-penguin')?.src || DEFAULT_AVATAR;

    const html = `
      <div id="penguContainer">
        <!-- Floating Launcher Pill -->
        <div class="pengu-launcher" id="penguLauncher" title="Ask Pengu AI (OS Mentor)">
          <img class="pengu-launcher-avatar" src="${brandAvatar}" alt="Pengu AI Mascot" />
          <div class="pengu-launcher-text">
            <span class="pengu-launcher-title">PENGU AI</span>
            <span class="pengu-launcher-subtitle">OS Mentor <span class="pengu-launcher-badge">✨</span></span>
          </div>
        </div>

        <!-- Chat Modal Window -->
        <div class="pengu-window" id="penguWindow" role="dialog" aria-label="Pengu AI Tutor">
          <!-- Header -->
          <div class="pengu-header">
            <div class="pengu-header-brand">
              <img class="pengu-header-avatar" src="${brandAvatar}" alt="Pengu" />
              <div class="pengu-header-info">
                <h4>PENGU AI</h4>
                <div class="pengu-header-status">
                  <span class="pengu-status-dot"></span>
                  <span>OS Odyssey Mentor</span>
                </div>
              </div>
            </div>
            <div class="pengu-header-actions">
              <button class="pengu-header-btn" id="penguClearBtn" title="Reset Chat" type="button">🗑️</button>
              <button class="pengu-header-btn" id="penguCloseBtn" title="Close" type="button">✕</button>
            </div>
          </div>

          <!-- Context Ribbon -->
          <div class="pengu-context-ribbon">
            <span class="pengu-context-tag" id="penguContextTag">📍 Context: Loading...</span>
            <span style="font-size:0.65rem;opacity:0.8;">Gemini Powered</span>
          </div>

          <!-- Quick Chips Bar -->
          <div class="pengu-chips-bar">
            <button class="pengu-chip" data-mode="eli5" type="button">💡 Explain Simply</button>
            <button class="pengu-chip" data-mode="analogy" type="button">🍕 Real-World Analogy</button>
            <button class="pengu-chip" data-mode="code" type="button">💻 C Code Example</button>
            <button class="pengu-chip" data-mode="hint" type="button">🧭 Socratic Hint</button>
          </div>

          <!-- Messages Stream -->
          <div class="pengu-messages" id="penguMessages"></div>

          <!-- Input Area -->
          <div class="pengu-input-area">
            <form class="pengu-input-form" id="penguForm">
              <textarea
                class="pengu-textarea"
                id="penguInput"
                placeholder="Ask Pengu anything about this lesson..."
                rows="1"
                required
              ></textarea>
              <button class="pengu-send-btn" id="penguSendBtn" type="submit" title="Send message" aria-label="Send">
                ➤
              </button>
            </form>
          </div>
        </div>

        <!-- Highlight Selection Popup Tooltip -->
        <div class="pengu-selection-tooltip" id="penguSelectionTooltip" style="display:none;">
          ✨ Ask Pengu
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', html);
    initEvents(brandAvatar);
    refreshWelcomeMessage(brandAvatar);
  }

  /* ── Append Chat Messages ───────────────────────────────── */
  function appendMessage(sender, text, avatarUrl) {
    const container = document.getElementById('penguMessages');
    if (!container) return;

    const isUser = sender === 'user';
    const msgDiv = document.createElement('div');
    msgDiv.className = `pengu-msg ${isUser ? 'user' : 'pengu'}`;

    const contentHtml = isUser
      ? `<div class="pengu-msg-bubble">${text.replace(/\n/g, '<br>')}</div>`
      : `<img class="pengu-msg-avatar" src="${avatarUrl || DEFAULT_AVATAR}" alt="Pengu" />
         <div class="pengu-msg-bubble">${renderMarkdown(text)}</div>`;

    msgDiv.innerHTML = contentHtml;
    container.appendChild(msgDiv);
    container.scrollTop = container.scrollHeight;
  }

  /* ── Thinking Indicator ─────────────────────────────────── */
  function setThinking(loading, avatarUrl) {
    isThinking = loading;
    const container = document.getElementById('penguMessages');
    const existing = document.getElementById('penguTypingIndicator');
    const sendBtn = document.getElementById('penguSendBtn');

    if (sendBtn) sendBtn.disabled = loading;

    if (loading) {
      if (!existing && container) {
        const div = document.createElement('div');
        div.id = 'penguTypingIndicator';
        div.className = 'pengu-msg pengu';
        div.innerHTML = `
          <img class="pengu-msg-avatar" src="${avatarUrl || DEFAULT_AVATAR}" alt="Pengu" />
          <div class="pengu-typing">
            <span></span><span></span><span></span>
          </div>
        `;
        container.appendChild(div);
        container.scrollTop = container.scrollHeight;
      }
    } else {
      existing?.remove();
    }
  }

  /* ── Refresh Welcome Message ────────────────────────────── */
  function refreshWelcomeMessage(avatarUrl) {
    const container = document.getElementById('penguMessages');
    if (!container) return;

    container.innerHTML = '';
    chatHistory = [];

    const ctx = getPageContext();
    document.getElementById('penguContextTag').textContent = `📍 ${ctx.title}`;

    const welcome = `Greetings, explorer! 🐧 I'm **Pengu**, your Operating Systems mentor.\n\nI can help you break down **${ctx.title}**, give you practical analogies, show working C/POSIX code, or drop Socratic hints if you're stuck.\n\nWhat would you like to explore?`;
    appendMessage('pengu', welcome, avatarUrl);
  }

  /* ── Send Message to Backend API ────────────────────────── */
  async function sendMessage(query, mode = 'general') {
    if (!query || !query.trim() || isThinking) return;

    const brandAvatar = document.querySelector('.brand-penguin')?.src || DEFAULT_AVATAR;
    const ctx = getPageContext();

    appendMessage('user', query);
    setThinking(true, brandAvatar);

    // Track in history
    chatHistory.push({ role: 'user', text: query });

    try {
      // Get auth token if user is signed in
      let token = null;
      if (window.supa && window.supa.auth) {
        try {
          const { data: { session } } = await window.supa.auth.getSession();
          if (session) token = session.access_token;
        } catch { /* proceed without token */ }
      }

      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const payload = {
        query: query.trim(),
        mode: mode,
        page_context: `${ctx.title} (${ctx.detail})`,
        selected_text: activeSelectedText,
        content_snippet: ctx.snippet,
        history: chatHistory.slice(-6),
      };

      const res = await fetch(`${BACKEND_API}/ai/tutor`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        if (res.status === 404) {
          throw new Error('The `/api/ai/tutor` endpoint is not yet live on the server. Commit and push the new backend files to GitHub (`git push origin main`) to trigger the Render deployment!');
        }
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.detail || `Server responded with ${res.status}`);
      }

      const data = await res.json();
      const reply = data.reply || "Brrr, I couldn't generate a response. Let's try rephrasing!";

      setThinking(false, brandAvatar);
      appendMessage('pengu', reply, brandAvatar);
      chatHistory.push({ role: 'model', text: reply });

      // Clear highlighted text after successful context use
      activeSelectedText = '';
    } catch (err) {
      setThinking(false, brandAvatar);
      appendMessage(
        'pengu',
        `⚠️ **Pengu couldn't connect:** ${err.message || 'Please check your connection or try again.'}\n\n*Tip: If the backend is waking up, give it a few seconds and try again!*`,
        brandAvatar
      );
    }
  }

  /* ── Event Listeners ────────────────────────────────────── */
  function initEvents(brandAvatar) {
    const launcher = document.getElementById('penguLauncher');
    const win = document.getElementById('penguWindow');
    const closeBtn = document.getElementById('penguCloseBtn');
    const clearBtn = document.getElementById('penguClearBtn');
    const form = document.getElementById('penguForm');
    const input = document.getElementById('penguInput');
    const tooltip = document.getElementById('penguSelectionTooltip');

    // Toggle window open / close
    launcher.addEventListener('click', () => {
      win.classList.toggle('active');
      if (win.classList.contains('active')) {
        const ctx = getPageContext();
        document.getElementById('penguContextTag').textContent = `📍 ${ctx.title}`;
        input.focus();
      }
    });

    closeBtn.addEventListener('click', () => {
      win.classList.remove('active');
    });

    clearBtn.addEventListener('click', () => {
      refreshWelcomeMessage(brandAvatar);
    });

    // Auto-resizing textarea & submission
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        form.dispatchEvent(new Event('submit'));
      }
    });

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const q = input.value.trim();
      if (!q) return;
      input.value = '';
      sendMessage(q, 'general');
    });

    // Quick chips
    document.querySelectorAll('.pengu-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        const mode = chip.dataset.mode;
        const ctx = getPageContext();
        let promptText = '';

        switch (mode) {
          case 'eli5':
            promptText = `Explain ${ctx.title} in simple terms like I'm 5 years old.`;
            break;
          case 'analogy':
            promptText = `Give me a creative real-world analogy to understand ${ctx.title}.`;
            break;
          case 'code':
            promptText = `Show me a practical C / POSIX code example demonstrating ${ctx.title}.`;
            break;
          case 'hint':
            promptText = `Give me a Socratic hint or guiding question about ${ctx.title}.`;
            break;
          default:
            promptText = `Tell me more about ${ctx.title}.`;
        }

        sendMessage(promptText, mode);
      });
    });

    // Highlight text selection detection
    document.addEventListener('mouseup', (e) => {
      // Don't trigger if selection is inside pengu window
      if (win.contains(e.target) || launcher.contains(e.target)) {
        return;
      }

      const selection = window.getSelection();
      const selected = selection?.toString()?.trim();

      if (selected && selected.length >= 6 && selected.length <= 1200) {
        activeSelectedText = selected;
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();

        tooltip.style.left = `${rect.left + rect.width / 2 + window.scrollX}px`;
        tooltip.style.top = `${rect.top + window.scrollY - 6}px`;
        tooltip.style.display = 'flex';
      } else {
        tooltip.style.display = 'none';
      }
    });

    tooltip.addEventListener('click', () => {
      tooltip.style.display = 'none';
      if (!win.classList.contains('active')) {
        win.classList.add('active');
      }
      const prompt = `Can you explain what this means in simple terms?\n\n"${activeSelectedText}"`;
      sendMessage(prompt, 'explain');
    });
  }

  /* ── Bootstrap on DOM Ready ─────────────────────────────── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectWidget);
  } else {
    injectWidget();
  }
})();
