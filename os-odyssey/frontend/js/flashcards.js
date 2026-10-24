/**
 * Odyssey — Dashboard PDF flashcards
 * Upload a PDF on Home, generate a study deck, and review with flip cards.
 */
(function () {
  'use strict';

  if (!document.body || !document.body.classList.contains('odyssey-home-page')) return;

  const IS_LOCAL_HOST = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  const BACKEND_API = IS_LOCAL_HOST
    ? `http://${window.location.hostname}:4000/api`
    : 'https://os-odyssey-api.onrender.com/api';
  const STORAGE_KEY = 'os-odyssey-flashcard-decks';
  const MAX_DECKS = 12;
  const MAX_PDF_BYTES = 10 * 1024 * 1024;
  const MAX_PAGES = 40;

  const els = {
    topic: document.getElementById('flashcardTopic'),
    count: document.getElementById('flashcardCount'),
    fileInput: document.getElementById('flashcardPdfInput'),
    fileBtn: document.getElementById('flashcardUploadBtn'),
    prompt: document.getElementById('flashcardPrompt'),
    dropzone: document.getElementById('flashcardDropzone'),
    dropTitle: document.getElementById('flashcardDropTitle'),
    dropHint: document.getElementById('flashcardDropHint'),
    generateBtn: document.getElementById('flashcardGenerateBtn'),
    fileChip: document.getElementById('flashcardFileChip'),
    fileName: document.getElementById('flashcardFileName'),
    fileMeta: document.getElementById('flashcardFileMeta'),
    clearFile: document.getElementById('flashcardClearFile'),
    status: document.getElementById('flashcardStatus'),
    decks: document.getElementById('flashcardDecks'),
    studio: document.getElementById('flashcardStudio'),
    chatOverlay: document.getElementById('pdfChatOverlay'),
    chatTitle: document.getElementById('pdfChatTitle'),
    chatSource: document.querySelector('#pdfChatSource span:nth-child(2)'),
    chatMessages: document.getElementById('pdfChatMessages'),
    chatActivity: document.getElementById('pdfChatActivity'),
    chatForm: document.getElementById('pdfChatForm'),
    chatInput: document.getElementById('pdfChatInput'),
    chatNotice: document.getElementById('pdfChatNotice'),
    makeFlashcards: document.getElementById('pdfMakeFlashcards'),
    makeQuiz: document.getElementById('pdfMakeQuiz'),
  };

  if (!els.fileInput || !els.generateBtn || !els.decks) return;

  let selectedFile = null;
  let pdfText = '';
  let chatHistory = [];
  let requestBusy = false;

  async function getSession() {
    if (!window.supa) return null;
    const { data: { session } } = await window.supa.auth.getSession();
    return session;
  }

  function setStatus(message, kind) {
    if (!els.status) return;
    els.status.textContent = message || '';
    els.status.dataset.kind = kind || '';
  }

  function deckStorageKey(userId) {
    return userId ? `${STORAGE_KEY}:${userId}` : STORAGE_KEY;
  }

  function loadDecks(userId) {
    try {
      const raw = localStorage.getItem(deckStorageKey(userId));
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function saveDecks(userId, decks) {
    localStorage.setItem(deckStorageKey(userId), JSON.stringify(decks.slice(0, MAX_DECKS)));
  }

  function openStudyPage(study) {
    try {
      sessionStorage.setItem('os-pdf-study-session', JSON.stringify(study));
      window.location.href = 'pdf-study.html';
    } catch (err) {
      console.error('Could not open the study session:', err);
      setStatus('Your study session could not be opened. Please try again.', 'error');
    }
  }

  function prettyFileName(name) {
    return String(name || 'PDF').replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ').trim();
  }

  function updateFileChip() {
    const hasFile = Boolean(selectedFile);
    if (els.fileChip) els.fileChip.hidden = !hasFile;
    if (els.fileName) els.fileName.textContent = selectedFile ? selectedFile.name : '';
    if (els.fileMeta && selectedFile) {
      const size = selectedFile.size < 1024 * 1024
        ? `${Math.max(1, Math.round(selectedFile.size / 1024))} KB`
        : `${(selectedFile.size / (1024 * 1024)).toFixed(1)} MB`;
      els.fileMeta.textContent = `PDF · ${size} · ready for flashcards or a quiz`;
    }
    if (els.dropzone) els.dropzone.dataset.hasFile = String(hasFile);
    if (els.prompt) {
      els.prompt.value = '';
      els.prompt.placeholder = hasFile
        ? 'Ask Pengu to make flashcards or a quiz…'
        : 'Upload something to make flashcards or a quiz…';
    }
    if (els.generateBtn) els.generateBtn.disabled = !hasFile;
  }

  function renderDecks(userId) {
    const decks = loadDecks(userId);
    if (!decks.length) {
      els.decks.innerHTML = '';
      els.decks.hidden = true;
      return;
    }

    els.decks.hidden = false;
    els.decks.replaceChildren();
    const heading = document.createElement('h3');
    heading.className = 'home-flashcard-decks__title';
    heading.textContent = 'Jump back in';
    els.decks.appendChild(heading);

    const list = document.createElement('div');
    list.className = 'home-flashcard-decks__list';

    decks.forEach((deck) => {
      const card = document.createElement('article');
      card.className = 'home-flashcard-deck';

      const openBtn = document.createElement('button');
      openBtn.type = 'button';
      openBtn.className = 'home-flashcard-deck__open';
      openBtn.addEventListener('click', () => openStudyPage({
        mode: 'flashcards', title: deck.title, sourceName: deck.sourceName || deck.title, cards: deck.cards,
      }));

      const icon = document.createElement('span');
      icon.className = 'home-flashcard-deck__icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.textContent = '▤';

      const copy = document.createElement('span');
      copy.className = 'home-flashcard-deck__copy';
      const title = document.createElement('strong');
      title.textContent = deck.title || 'Study deck';
      const meta = document.createElement('small');
      meta.textContent = `${deck.cards?.length || 0} cards · Flashcards`;
      copy.append(title, meta);
      openBtn.append(icon, copy);

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'home-flashcard-deck__remove';
      remove.setAttribute('aria-label', `Remove ${deck.title || 'deck'}`);
      remove.textContent = '×';
      remove.addEventListener('click', async (event) => {
        event.stopPropagation();
        const session = await getSession();
        const next = loadDecks(session?.user?.id).filter((item) => item.id !== deck.id);
        saveDecks(session?.user?.id, next);
        renderDecks(session?.user?.id);
      });

      card.append(openBtn, remove);
      list.appendChild(card);
    });

    els.decks.appendChild(list);
  }

  async function ensurePdfJs() {
    if (window.pdfjsLib) return window.pdfjsLib;
    await new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-odyssey-pdfjs]');
      if (existing) {
        existing.addEventListener('load', resolve, { once: true });
        existing.addEventListener('error', () => reject(new Error('Could not load PDF reader.')), { once: true });
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js';
      script.dataset.odysseyPdfjs = 'true';
      script.onload = resolve;
      script.onerror = () => reject(new Error('Could not load PDF reader.'));
      document.head.appendChild(script);
    });
    return window.pdfjsLib;
  }

  async function extractPdfText(file) {
    const buf = await file.arrayBuffer();
    const pdfjsLib = await ensurePdfJs();
    if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
      try {
        const workerBlob = new Blob(
          [`importScripts('https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js');`],
          { type: 'application/javascript' }
        );
        pdfjsLib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(workerBlob);
      } catch {
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
      }
    }

    let pdf = null;
    try {
      pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
      const maxPages = Math.min(pdf.numPages, MAX_PAGES);
      const parts = [];
      for (let i = 1; i <= maxPages; i += 1) {
        try {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          const text = content.items
            .map((item) => (item && typeof item.str === 'string' ? item.str : ''))
            .filter((str) => str.trim().length > 0)
            .join(' ')
            .trim();
          if (text) parts.push(text);
        } catch (err) {
          console.warn(`PDF page ${i} extraction error:`, err);
        }
      }
      return parts.join('\n\n').trim();
    } finally {
      if (pdf) {
        try { pdf.destroy(); } catch { /* ignore */ }
      }
    }
  }

  function apiErrorMessage(payload, fallback) {
    if (!payload) return fallback;
    if (typeof payload.detail === 'string') return payload.detail;
    if (Array.isArray(payload.detail) && payload.detail[0]?.msg) return payload.detail[0].msg;
    if (payload.error) return String(payload.error);
    return fallback;
  }

  async function generateDeck() {
    if (!selectedFile || requestBusy) return;
    closePdfChat();

    if (selectedFile.size > MAX_PDF_BYTES) {
      setStatus('Please choose a PDF under 10MB.', 'error');
      return;
    }

    requestBusy = true;
    els.makeFlashcards && (els.makeFlashcards.disabled = true);
    els.fileBtn.disabled = true;
    els.studio?.classList.add('is-busy');

    try {
      const session = await getSession();
      if (!session) {
        window.location.href = 'login.html';
        return;
      }

      setStatus('Pengu is reading your PDF and finding the ideas worth remembering…', 'progress');
      let extracted = pdfText;
      if (!extracted) {
        try { extracted = await extractPdfText(selectedFile); } catch (err) { console.warn('Client PDF extraction failed:', err); }
      }

      const title = prettyFileName(selectedFile.name);
      const topic = (els.topic?.value || '').trim();
      const numCards = els.count?.value || '12';
      const hasReadableText = extracted && extracted.length >= 50;
      const requestUrl = hasReadableText
        ? `${BACKEND_API}/ai/flashcards`
        : `${BACKEND_API}/ai/flashcards?${new URLSearchParams({ title, topic, num_cards: numCards })}`;
      const headers = { Authorization: `Bearer ${session.access_token}` };
      let body;
      if (hasReadableText) {
        headers['Content-Type'] = 'application/json';
        body = JSON.stringify({ title, topic, num_cards: Number(numCards), content: extracted.slice(0, 15000) });
      } else {
        // Sending the PDF body directly lets the API accept scanned PDFs without multipart support.
        headers['Content-Type'] = 'application/pdf';
        body = selectedFile;
      }

      const requestOptions = {
        method: 'POST',
        headers,
        body,
      };
      let res = await fetch(requestUrl, requestOptions);
      if (res.status === 401) {
        // A stale access token can be refreshed without ending the user's session.
        try {
          const { data, error } = await window.supa.auth.refreshSession();
          const renewedSession = data?.session;
          if (!error && renewedSession?.access_token && renewedSession.access_token !== session.access_token) {
            headers.Authorization = `Bearer ${renewedSession.access_token}`;
            res = await fetch(requestUrl, requestOptions);
          }
        } catch (refreshError) {
          console.warn('Could not refresh the flashcard request session:', refreshError);
        }
      }

      const payload = await res.json().catch(() => ({}));
      if (res.status === 401) {
        throw new Error(apiErrorMessage(
          payload,
          'The flashcard service could not verify your session. Your Odyssey login is still active; refresh the page and try again.'
        ));
      }
      if (!res.ok) {
        throw new Error(apiErrorMessage(payload, 'Could not generate flashcards from that PDF.'));
      }

      const cards = Array.isArray(payload.cards) ? payload.cards : [];
      if (!cards.length) throw new Error('No flashcards came back. Try a different PDF.');

      const deck = {
        id: (crypto.randomUUID && crypto.randomUUID()) || `deck-${Date.now()}`,
        title: payload.title || prettyFileName(selectedFile.name),
        sourceName: selectedFile.name,
        createdAt: new Date().toISOString(),
        cards,
      };
      const decks = [deck, ...loadDecks(session.user.id).filter((item) => item.title !== deck.title)];
      try {
        saveDecks(session.user.id, decks);
        renderDecks(session.user.id);
        setStatus(`Your ${cards.length}-card deck is ready. Saved on this device.`, 'success');
      } catch (storageError) {
        console.warn('Could not save generated deck locally:', storageError);
        setStatus(`Your ${cards.length}-card deck is ready. Keep this tab open to study it.`, 'success');
      }
      openStudyPage({ mode: 'flashcards', title: deck.title, sourceName: deck.sourceName, cards: deck.cards });
    } catch (err) {
      setStatus(err.message || 'Could not generate flashcards. Please try again.', 'error');
    } finally {
      requestBusy = false;
      els.studio?.classList.remove('is-busy');
      els.fileBtn.disabled = false;
      if (els.makeFlashcards) els.makeFlashcards.disabled = false;
      updateFileChip();
    }
  }

  function addChatMessage(role, text) {
    if (!els.chatMessages) return;
    const row = document.createElement('div');
    row.className = `pdf-chat__message pdf-chat__message--${role}`;
    const name = document.createElement('strong');
    name.textContent = role === 'assistant' ? 'Pengu' : 'You';
    const body = document.createElement('p');
    body.textContent = text;
    row.append(name, body);
    els.chatMessages.appendChild(row);
    els.chatMessages.scrollTop = els.chatMessages.scrollHeight;
  }

  function setChatNotice(text, kind) {
    if (!els.chatNotice) return;
    els.chatNotice.textContent = text || '';
    els.chatNotice.dataset.kind = kind || '';
  }

  function getChatContext() {
    if (pdfText.length <= 3800) return pdfText;
    const excerptSize = 850;
    const anchors = [0, .32, .64, .96].map((ratio) => Math.floor((pdfText.length - excerptSize) * ratio));
    return anchors.map((start, index) => `[PDF excerpt ${index + 1}]\n${pdfText.slice(start, start + excerptSize)}`).join('\n\n').slice(0, 4000);
  }

  async function openPdfChat() {
    if (!selectedFile || requestBusy) return;
    requestBusy = true;
    els.generateBtn.disabled = true;
    els.fileBtn.disabled = true;
    els.studio?.classList.add('is-busy');
    setStatus('Pengu is opening your study room…', 'progress');
    try {
      const session = await getSession();
      if (!session) {
        window.location.href = 'login.html';
        return;
      }
      try { pdfText = await extractPdfText(selectedFile); }
      catch (err) { console.warn('PDF text extraction failed:', err); pdfText = ''; }
      chatHistory = [];
      els.chatMessages?.replaceChildren();
      if (els.chatActivity) els.chatActivity.hidden = false;
      if (els.chatTitle) els.chatTitle.textContent = prettyFileName(selectedFile.name);
      if (els.chatSource) {
        els.chatSource.querySelector('strong').textContent = selectedFile.name;
        els.chatSource.querySelector('small').textContent = pdfText.length >= 50
          ? `${pdfText.trim().split(/\s+/).length.toLocaleString()} words · ready to explore`
          : 'PDF attached · text could not be extracted';
      }
      addChatMessage('assistant', pdfText.length >= 50
        ? `I’ve got “${prettyFileName(selectedFile.name)}” open. I can help you unpack the ideas, make flashcards, or build a quick quiz. What would you like to focus on?`
        : `I’ve got “${prettyFileName(selectedFile.name)}” open, but it looks like a scanned or image-only PDF. You can still try flashcards; for chat and quizzes, use a PDF with selectable text.`);
      if (els.chatOverlay) {
        els.chatOverlay.hidden = false;
        document.body.classList.add('pdf-chat-open');
      }
      setChatNotice('');
      els.chatInput?.focus();
      setStatus('Your PDF study chat is ready.', 'success');
    } catch (err) {
      setStatus(err.message || 'Could not open the PDF study chat.', 'error');
    } finally {
      requestBusy = false;
      els.studio?.classList.remove('is-busy');
      els.fileBtn.disabled = false;
      updateFileChip();
    }
  }

  function closePdfChat() {
    if (els.chatOverlay) els.chatOverlay.hidden = true;
    document.body.classList.remove('pdf-chat-open');
    setChatNotice('');
  }

  async function askPdfChat(event) {
    event.preventDefault();
    const query = (els.chatInput?.value || '').trim();
    if (!query || requestBusy) return;
    const session = await getSession();
    if (!session) { window.location.href = 'login.html'; return; }
    if (pdfText.length < 50) {
      setChatNotice('This PDF has no selectable text for chat. Try a text-based PDF.', 'error');
      return;
    }
    requestBusy = true;
    if (els.chatInput) { els.chatInput.value = ''; els.chatInput.disabled = true; }
    addChatMessage('user', query);
    chatHistory.push({ role: 'user', text: query });
    setChatNotice('Pengu is thinking…', 'progress');
    try {
      const response = await fetch(`${BACKEND_API}/ai/tutor`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          query,
          mode: 'explain',
          page_context: `PDF study chat: ${prettyFileName(selectedFile?.name)}`,
          content_snippet: getChatContext(),
          selected_text: (els.topic?.value || '').trim().slice(0, 200),
          history: chatHistory.slice(0, -1).slice(-8),
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(apiErrorMessage(payload, 'Pengu could not answer just now. Try again.'));
      const reply = payload.reply || 'I couldn’t form a reply this time. Try asking another way.';
      addChatMessage('assistant', reply);
      chatHistory.push({ role: 'model', text: reply });
      setChatNotice('');
    } catch (err) {
      chatHistory.pop();
      setChatNotice(err.message || 'Pengu could not answer just now. Try again.', 'error');
    } finally {
      requestBusy = false;
      if (els.chatInput) { els.chatInput.disabled = false; els.chatInput.focus(); }
    }
  }

  async function createPdfQuiz() {
    if (requestBusy) return;
    if (pdfText.length < 50) { setChatNotice('This PDF has no selectable text. Upload a text-based PDF to make a quiz.', 'error'); return; }
    const session = await getSession();
    if (!session) { window.location.href = 'login.html'; return; }
    requestBusy = true;
    if (els.makeQuiz) els.makeQuiz.disabled = true;
    setChatNotice('Pengu is writing questions from your PDF…', 'progress');
    try {
      const response = await fetch(`${BACKEND_API}/ai/quiz`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          title: prettyFileName(selectedFile?.name),
          topic: (els.topic?.value || '').trim(),
          content: pdfText.slice(0, 15000),
          num_questions: Number(els.count?.value || 12),
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(apiErrorMessage(payload, 'Could not make a quiz from this PDF.'));
      const questions = Array.isArray(payload.questions) ? payload.questions.filter((q) => q.question_text && Array.isArray(q.options) && q.correct_answer) : [];
      if (!questions.length) throw new Error('Pengu could not make usable questions from this PDF. Try another file or focus.');
      sessionStorage.setItem('os-pdf-study-session', JSON.stringify({
        mode: 'quiz', title: prettyFileName(selectedFile.name), sourceName: selectedFile.name, questions,
      }));
      setChatNotice('');
      window.location.href = 'pdf-study.html';
    } catch (err) {
      setChatNotice(err.message || 'Quiz generation failed. Please try again.', 'error');
    } finally {
      requestBusy = false;
      if (els.makeQuiz) els.makeQuiz.disabled = false;
    }
  }

  els.fileBtn?.addEventListener('click', () => els.fileInput.click());
  els.prompt?.addEventListener('click', () => els.fileInput.click());
  function selectPdf(file) {
    if (!file) return;
    const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
    if (!isPdf) {
      setStatus('Please upload a PDF file.', 'error');
      els.fileInput.value = '';
      return false;
    }
    if (file.size > MAX_PDF_BYTES) {
      setStatus('That PDF is over 10 MB. Choose a smaller file to continue.', 'error');
      els.fileInput.value = '';
      return false;
    }
    selectedFile = file;
    updateFileChip();
    setStatus(`${file.name} is ready. Open Pengu’s study chat when you are.`, '');
    return true;
  }
  els.fileInput.addEventListener('change', () => {
    selectPdf(els.fileInput.files && els.fileInput.files[0]);
  });
  ['dragenter', 'dragover'].forEach((eventName) => {
    els.dropzone?.addEventListener(eventName, (event) => {
      event.preventDefault();
      els.dropzone.classList.add('is-dragging');
    });
  });
  ['dragleave', 'dragend'].forEach((eventName) => {
    els.dropzone?.addEventListener(eventName, (event) => {
      if (eventName === 'dragleave' && els.dropzone.contains(event.relatedTarget)) return;
      els.dropzone.classList.remove('is-dragging');
    });
  });
  els.dropzone?.addEventListener('drop', (event) => {
    event.preventDefault();
    els.dropzone.classList.remove('is-dragging');
    selectPdf(event.dataTransfer?.files?.[0]);
  });
  els.clearFile?.addEventListener('click', () => {
    selectedFile = null;
    pdfText = '';
    els.fileInput.value = '';
    updateFileChip();
    setStatus('');
  });
  els.generateBtn.addEventListener('click', openPdfChat);
  els.makeFlashcards?.addEventListener('click', generateDeck);
  els.makeQuiz?.addEventListener('click', createPdfQuiz);
  els.chatForm?.addEventListener('submit', askPdfChat);
  document.getElementById('pdfChatClose')?.addEventListener('click', closePdfChat);
  document.getElementById('pdfChatBack')?.addEventListener('click', closePdfChat);
  els.chatOverlay?.addEventListener('click', (event) => {
    if (event.target === els.chatOverlay) closePdfChat();
  });
  document.addEventListener('keydown', (event) => {
    if (els.chatOverlay && !els.chatOverlay.hidden && event.key === 'Escape') closePdfChat();
  });

  updateFileChip();
  getSession().then((session) => renderDecks(session?.user?.id));
})();
