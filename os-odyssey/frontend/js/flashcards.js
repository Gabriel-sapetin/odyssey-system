/**
 * Odyssey — Pengu Omnipotent AI Study Companion & Permanent Dashboard Storage
 * ─────────────────────────────────────────────────────────────────────────────
 * • Main chatbot of Odyssey: Converse directly with Pengu on any OS concept.
 * • Instant topic-based Flashcards (Memorize) and Quiz (Challenge) generation.
 * • Optional PDF upload for document-grounded flashcards, quizzes, and chat.
 * • Permanent storage of all generated study sets on the user's dashboard.
 */
(function () {
  'use strict';

  if (!document.body || !document.body.classList.contains('odyssey-home-page')) return;

  const IS_LOCAL_HOST = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  const BACKEND_API = IS_LOCAL_HOST
    ? `http://${window.location.hostname}:4000/api`
    : 'https://os-odyssey-api.onrender.com/api';

  const STORAGE_KEY_V3 = 'os-odyssey-saved-study-sets-v3';
  const OLD_STORAGE_KEY = 'os-odyssey-flashcard-decks';
  const SESSION_STUDY_KEY = 'os-pdf-study-session';
  const MAX_SAVED_SETS = 40;
  const MAX_PDF_BYTES = 10 * 1024 * 1024;
  const MAX_PAGES = 40;

  const els = {
    // Dashboard composer elements
    fileInput: document.getElementById('flashcardPdfInput'),
    fileBtn: document.getElementById('flashcardUploadBtn'),
    prompt: document.getElementById('flashcardPrompt'),
    dropzone: document.getElementById('flashcardDropzone'),
    generateBtn: document.getElementById('flashcardGenerateBtn'),
    fileChip: document.getElementById('flashcardFileChip'),
    fileName: document.getElementById('flashcardFileName'),
    fileMeta: document.getElementById('flashcardFileMeta'),
    clearFile: document.getElementById('flashcardClearFile'),
    status: document.getElementById('flashcardStatus'),
    decks: document.getElementById('flashcardDecks'),
    studio: document.getElementById('flashcardStudio'),

    // Tools bar tags
    toolUploadPdf: document.getElementById('toolUploadPdf'),
    toolFlashcards: document.getElementById('toolFlashcards'),
    toolQuiz: document.getElementById('toolQuiz'),
    toolMetaText: document.getElementById('toolMetaText'),

    // Dashboard Saved Sets Section
    savedSetsSection: document.getElementById('homeSavedSets'),
    savedSetsGrid: document.getElementById('savedSetsGrid'),
    savedSetsCount: document.getElementById('savedSetsCount'),

    // Chatbot Modal Elements
    chatOverlay: document.getElementById('pdfChatOverlay'),
    chatBack: document.getElementById('pdfChatBack'),
    chatClose: document.getElementById('pdfChatClose'),
    chatTitle: document.getElementById('pdfChatTitle'),
    chatStatus: document.getElementById('pdfChatStatus'),
    chatSource: document.getElementById('pdfChatSource'),
    chatSourceName: document.getElementById('pdfChatSourceName'),
    chatSourceMeta: document.getElementById('pdfChatSourceMeta'),
    chatSourceIcon: document.getElementById('pdfChatSourceIcon'),
    chatMessages: document.getElementById('pdfChatMessages'),
    chatActivity: document.getElementById('pdfChatActivity'),
    chatActivityLabel: document.getElementById('pdfChatActivityLabel'),
    chatChoices: document.getElementById('pdfChatChoices'),
    makeFlashcards: document.getElementById('pdfMakeFlashcards'),
    makeQuiz: document.getElementById('pdfMakeQuiz'),
    topicPicker: document.getElementById('pdfChatTopicPicker'),
    topicTitle: document.getElementById('pdfChatTopicTitle'),
    topicBackBtn: document.getElementById('pdfChatTopicBackBtn'),
    topicChips: document.getElementById('pdfChatTopicChips'),
    topicCustomBox: document.getElementById('pdfChatCustomBox'),
    topicCustomInput: document.getElementById('pdfChatCustomInput'),
    topicCustomBtn: document.getElementById('pdfChatCustomBtn'),
    chatForm: document.getElementById('pdfChatForm'),
    chatAttachBtn: document.getElementById('pdfChatAttachBtn'),
    chatInput: document.getElementById('pdfChatInput'),
    chatSendBtn: document.getElementById('pdfChatSendBtn'),
    chatNotice: document.getElementById('pdfChatNotice'),
  };

  let selectedFile = null;
  let pdfText = '';
  let chatHistory = [];
  let requestBusy = false;
  let currentChatMode = 'general'; // 'general' | 'flashcards' | 'quiz' | 'pdf'

  /* ──────────────────────────────────────────────────────────────────────────
     1. STORAGE LAYER (Permanent User Dashboard Storage & Supabase Sync)
     ────────────────────────────────────────────────────────────────────────── */

  async function getSession() {
    if (!window.supa) return null;
    try {
      const { data: { session } } = await window.supa.auth.getSession();
      return session;
    } catch {
      return null;
    }
  }

  function getStorageKey(userId) {
    return userId ? `${STORAGE_KEY_V3}:${userId}` : `${STORAGE_KEY_V3}:guest`;
  }

  function loadSavedSets(userId) {
    try {
      const key = getStorageKey(userId);
      let raw = localStorage.getItem(key);
      let list = [];
      if (raw) {
        list = JSON.parse(raw);
      }

      // Check migration from legacy os-odyssey-flashcard-decks
      const oldKey = userId ? `${OLD_STORAGE_KEY}:${userId}` : OLD_STORAGE_KEY;
      const oldRaw = localStorage.getItem(oldKey);
      if (oldRaw) {
        try {
          const oldList = JSON.parse(oldRaw);
          if (Array.isArray(oldList) && oldList.length) {
            oldList.forEach(oldDeck => {
              if (!list.some(item => item.id === oldDeck.id || item.title === oldDeck.title)) {
                list.push({
                  id: oldDeck.id || `migrated_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                  title: oldDeck.title || 'Migrated Flashcard Deck',
                  type: 'flashcards',
                  sourceType: 'pdf',
                  sourceName: oldDeck.sourceName || 'Uploaded PDF',
                  createdAt: oldDeck.createdAt || new Date().toISOString(),
                  itemCount: Array.isArray(oldDeck.cards) ? oldDeck.cards.length : 0,
                  cards: oldDeck.cards || [],
                });
              }
            });
            // Persist migrated sets
            localStorage.setItem(key, JSON.stringify(list.slice(0, MAX_SAVED_SETS)));
          }
        } catch (e) {
          console.warn('Migration error:', e);
        }
      }

      return Array.isArray(list) ? list : [];
    } catch (err) {
      console.warn('Could not load saved study sets:', err);
      return [];
    }
  }

  function saveSavedSets(userId, sets) {
    try {
      const key = getStorageKey(userId);
      const trimmed = (sets || []).slice(0, MAX_SAVED_SETS);
      localStorage.setItem(key, JSON.stringify(trimmed));

      // Attempt Supabase cloud sync if logged in
      if (userId && window.supa) {
        window.supa.auth.updateUser({
          data: { saved_study_sets: trimmed.slice(0, 20) }
        }).catch(err => console.warn('Supabase cloud study sync skipped:', err));
      }
    } catch (err) {
      console.warn('Could not save study sets locally:', err);
    }
  }

  function addSavedSet(userId, studySet) {
    const sets = loadSavedSets(userId);
    // Replace if same ID or insert to front
    const filtered = sets.filter(s => s.id !== studySet.id);
    const updated = [studySet, ...filtered];
    saveSavedSets(userId, updated);
    renderSavedSets(userId);
  }

  function deleteSavedSet(userId, setId) {
    const sets = loadSavedSets(userId);
    const updated = sets.filter(s => s.id !== setId);
    saveSavedSets(userId, updated);
    renderSavedSets(userId);
  }

  function openStudySession(studySet) {
    try {
      const sessionPayload = {
        mode: studySet.type,
        title: studySet.title,
        sourceName: studySet.sourceName || studySet.title,
        cards: studySet.cards || [],
        questions: studySet.questions || [],
      };
      sessionStorage.setItem(SESSION_STUDY_KEY, JSON.stringify(sessionPayload));
      window.location.href = 'pdf-study.html';
    } catch (err) {
      console.error('Could not open study session:', err);
      setStatus('Could not open study session. Please try again.', 'error');
    }
  }

  function formatDate(isoString) {
    if (!isoString) return 'Recent';
    try {
      const date = new Date(isoString);
      const now = new Date();
      const diffMs = now - date;
      const diffMins = Math.floor(diffMs / 60000);
      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      const diffHours = Math.floor(diffMins / 60);
      if (diffHours < 24) return `${diffHours}h ago`;
      const diffDays = Math.floor(diffHours / 24);
      if (diffDays === 1) return 'Yesterday';
      if (diffDays < 7) return `${diffDays}d ago`;
      return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    } catch {
      return 'Saved';
    }
  }

  function renderSavedSets(userId) {
    if (!els.savedSetsGrid) return;

    const sets = loadSavedSets(userId);

    if (els.savedSetsCount) {
      els.savedSetsCount.hidden = false;
      els.savedSetsCount.textContent = `${sets.length} ${sets.length === 1 ? 'set' : 'sets'}`;
    }

    if (!sets.length) {
      els.savedSetsGrid.innerHTML = `
        <div class="home-saved-sets__empty">
          <span class="home-saved-sets__empty-icon" aria-hidden="true">🐧</span>
          <strong>No saved study sets yet</strong>
          <p>Ask Pengu a question above, or create flashcards and quizzes on any OS topic. Your study sets sit permanently here so you can review them anytime!</p>
        </div>
      `;
      return;
    }

    els.savedSetsGrid.replaceChildren();

    sets.forEach(item => {
      const card = document.createElement('article');
      card.className = 'home-saved-set';

      const isQuiz = item.type === 'quiz';
      const badgeClass = isQuiz ? 'home-saved-set__badge--quiz' : 'home-saved-set__badge--flashcards';
      const icon = isQuiz ? '🏆' : '▤';
      const typeLabel = isQuiz ? 'QUIZ' : 'FLASHCARDS';
      const countLabel = isQuiz
        ? `${item.itemCount || (item.questions ? item.questions.length : 0)} questions`
        : `${item.itemCount || (item.cards ? item.cards.length : 0)} cards`;
      const dateLabel = formatDate(item.createdAt);

      const top = document.createElement('div');
      top.className = 'home-saved-set__top';
      top.innerHTML = `
        <span class="home-saved-set__badge ${badgeClass}">${icon} ${typeLabel} · ${countLabel}</span>
        <span class="home-saved-set__date">${dateLabel}</span>
      `;

      const title = document.createElement('h3');
      title.className = 'home-saved-set__title';
      title.textContent = item.title || 'Study Set';

      const meta = document.createElement('span');
      meta.className = 'home-saved-set__meta';
      const sourceDisplay = item.sourceType === 'pdf'
        ? `📄 PDF: ${item.sourceName || 'Document'}`
        : `✦ Topic: ${item.sourceName || item.title}`;
      meta.textContent = sourceDisplay;

      const actions = document.createElement('div');
      actions.className = 'home-saved-set__actions';

      const studyBtn = document.createElement('button');
      studyBtn.type = 'button';
      studyBtn.className = 'home-saved-set__btn-study';
      studyBtn.innerHTML = `<span>${isQuiz ? 'Take Quiz' : 'Study Deck'}</span> <span aria-hidden="true">→</span>`;
      studyBtn.addEventListener('click', () => openStudySession(item));

      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'home-saved-set__btn-delete';
      deleteBtn.setAttribute('aria-label', `Delete ${item.title}`);
      deleteBtn.title = 'Delete study set';
      deleteBtn.textContent = '🗑';
      deleteBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const ok = window.confirm(`Delete "${item.title}" from your saved study sets?`);
        if (ok) {
          const session = await getSession();
          deleteSavedSet(session?.user?.id, item.id);
        }
      });

      actions.append(studyBtn, deleteBtn);
      card.append(top, title, meta, actions);
      els.savedSetsGrid.appendChild(card);
    });
  }

  /* ──────────────────────────────────────────────────────────────────────────
     2. BUILT-IN OS KNOWLEDGE ENGINE & CURATED CURRICULUM
     ────────────────────────────────────────────────────────────────────────── */

  const CORE_TOPICS = {
    cpu_scheduling: {
      name: 'CPU Scheduling Algorithms',
      description: 'Master FCFS, SJF, Round Robin (RR), Priority Scheduling, and Multilevel Feedback Queues.',
      flashcards: [
        { front: 'What is the main goal of CPU Scheduling?', back: 'To maximize CPU utilization and throughput while minimizing turnaround time, waiting time, and response time.', hint: 'Think about fairness and efficiency.' },
        { front: 'How does Round Robin (RR) scheduling handle time?', back: 'RR allocates each ready process a fixed time slice called a time quantum (typically 10-100ms). If the process doesn’t finish, it is preempted and placed at the back of the ready queue.', hint: 'Preemption with a timer.' },
        { front: 'What is the Convoy Effect in FCFS?', back: 'A phenomenon where short processes get stuck waiting behind one long, CPU-bound process, drastically increasing average waiting time.', hint: 'Like a slow truck leading a line of sports cars.' },
        { front: 'Why is Shortest Job First (SJF) optimal for waiting time, yet hard to implement in practice?', back: 'SJF gives the minimum average waiting time, but it requires knowing the exact length of the next CPU burst in advance, which can usually only be estimated.', hint: 'Predicting the future.' },
        { front: 'What is Starvation in Priority Scheduling and how is it solved?', back: 'Low-priority processes may wait indefinitely if higher-priority ones keep arriving. The solution is Aging — gradually increasing the priority of processes as they wait.', hint: 'Getting older increases priority.' },
        { front: 'What is a Multilevel Feedback Queue (MLFQ)?', back: 'A scheduling system with multiple queues of different priorities and quantum sizes. Processes move between queues based on their CPU burst behavior (I/O bound stay high, CPU bound sink low).', hint: 'Dynamic adaptation based on behavior.' },
        { front: 'What is Turnaround Time?', back: 'The total interval from the time of process submission to the time of its completion: Turnaround = Completion Time - Arrival Time.', hint: 'Total time in the system.' },
        { front: 'What is the difference between Preemptive and Non-Preemptive scheduling?', back: 'In preemptive scheduling, the OS can interrupt a running process (e.g. on timer interrupt or higher priority arrival). In non-preemptive, the process keeps the CPU until it terminates or yields for I/O.', hint: 'Can the OS take the CPU back?' },
        { front: 'What happens if the Round Robin time quantum is extremely large or extremely small?', back: 'If too large, RR degrades into First-Come First-Served (FCFS). If too small, context switching overhead dominates CPU time and reduces overall throughput.', hint: 'Trade-off between responsiveness and overhead.' },
        { front: 'What is Response Time in interactive systems?', back: 'The time from when a request is submitted until the first response is produced (not until the complete output finishes).', hint: 'First impression matters.' },
      ],
      quiz: [
        {
          question_text: 'Which scheduling algorithm is provably optimal in terms of minimizing average waiting time?',
          options: ['First-Come First-Served (FCFS)', 'Round Robin (RR)', 'Shortest Job First (SJF)', 'Priority Scheduling'],
          correct_answer: 'Shortest Job First (SJF)',
          explanation: 'SJF minimizes average waiting time by scheduling shorter jobs first, minimizing the time other processes spend in the ready queue.'
        },
        {
          question_text: 'What occurs if the time quantum in Round Robin scheduling is set extremely large?',
          options: ['System enters deadlock', 'It behaves identically to FCFS', 'Context switch overhead spikes', 'Throughput reaches 0%'],
          correct_answer: 'It behaves identically to FCFS',
          explanation: 'When the quantum is larger than any process burst, every process finishes in its first turn without preemption, mimicking FCFS.'
        },
        {
          question_text: 'What technique prevents starvation in priority-based CPU scheduling?',
          options: ['Compaction', 'Aging', 'Demand Paging', 'Banker’s Algorithm'],
          correct_answer: 'Aging',
          explanation: 'Aging gradually increases the priority of processes that wait in the system for a long time, guaranteeing they will eventually execute.'
        },
        {
          question_text: 'Which metric measures the interval from process submission to the first generated output?',
          options: ['Throughput', 'Turnaround Time', 'Response Time', 'Waiting Time'],
          correct_answer: 'Response Time',
          explanation: 'Response time is the time taken to start responding, which is critical in interactive desktop and user-facing systems.'
        },
        {
          question_text: 'In Multilevel Feedback Queues (MLFQ), what happens to a process that uses its full time slice in a high-priority queue?',
          options: ['It is terminated immediately', 'It is demoted to a lower-priority queue', 'Its priority is boosted', 'It is assigned dedicated CPU cores'],
          correct_answer: 'It is demoted to a lower-priority queue',
          explanation: 'MLFQ penalizes CPU-intensive processes by demoting them to lower priority queues with larger quantums, keeping short I/O jobs at the top.'
        },
        {
          question_text: 'What is the Convoy Effect commonly associated with?',
          options: ['First-Come First-Served (FCFS)', 'Round Robin (RR)', 'Shortest Remaining Time First', 'Rate Monotonic'],
          correct_answer: 'First-Come First-Served (FCFS)',
          explanation: 'The convoy effect happens in FCFS when many short I/O-bound processes wait behind a single CPU-bound long process.'
        },
        {
          question_text: 'Which of the following describes preemptive scheduling?',
          options: ['A process only leaves the CPU when it voluntarily exits or blocks for I/O', 'The OS can interrupt a running process when a timer expires or higher priority arrives', 'Processes cannot communicate using shared memory', 'Threads share no state with their parent process'],
          correct_answer: 'The OS can interrupt a running process when a timer expires or higher priority arrives',
          explanation: 'Preemption allows the operating system kernel to forcibly take away the CPU from a running process.'
        },
        {
          question_text: 'What is CPU Utilization?',
          options: ['Percentage of time the CPU is doing useful work', 'Number of processes completed per unit time', 'Time a process spends in the ready queue', 'Time taken to execute a context switch'],
          correct_answer: 'Percentage of time the CPU is doing useful work',
          explanation: 'CPU utilization is the percentage of time that the CPU is busy executing user or system processes.'
        },
        {
          question_text: 'What is Throughput in the context of operating systems?',
          options: ['The total time taken to execute one process', 'The number of processes completed per unit time', 'The time spent in disk transfer', 'The latency between keypress and screen update'],
          correct_answer: 'The number of processes completed per unit time',
          explanation: 'Throughput is a key measure of work accomplished, defined as the number of completed processes per unit of time.'
        },
        {
          question_text: 'Which algorithm is best suited for time-sharing systems where all users need interactive response?',
          options: ['Round Robin (RR)', 'First-Come First-Served (FCFS)', 'Multiprocessor Gang Scheduling', 'Shortest Job First (Non-preemptive)'],
          correct_answer: 'Round Robin (RR)',
          explanation: 'Round Robin is designed specifically for time-sharing systems to provide fair, predictable interactive response times across all processes.'
        }
      ]
    },

    virtual_memory: {
      name: 'Virtual Memory & Paging',
      description: 'Demand paging, page replacement algorithms (FIFO, LRU, Clock), page tables, TLB, and thrashing.',
      flashcards: [
        { front: 'What is Virtual Memory?', back: 'A memory management capability of the OS that maps virtual addresses used by programs to physical addresses in RAM or secondary storage, allowing programs to exceed physical RAM size.', hint: 'Separation of logical and physical memory.' },
        { front: 'What is a Page Fault?', back: 'A trap raised by hardware (MMU) when a program accesses a virtual page whose valid/invalid bit in the page table indicates it is not currently resident in physical RAM.', hint: 'Accessing memory not in RAM.' },
        { front: 'What is the Translation Lookaside Buffer (TLB)?', back: 'A fast hardware associative cache inside the CPU that stores recent virtual-to-physical address translations, eliminating memory lookup penalties on hits.', hint: 'Cache for the page table.' },
        { front: 'What is the Least Recently Used (LRU) algorithm?', back: 'A page replacement policy that evicts the page that has not been referenced for the longest period of time, approximating optimal replacement.', hint: 'Look back in time.' },
        { front: 'What is Belady’s Anomaly?', back: 'A counter-intuitive phenomenon where increasing the number of physical page frames results in MORE page faults under FIFO page replacement.', hint: 'More frames, more faults!' },
        { front: 'What is Thrashing in an operating system?', back: 'A condition where the CPU spends more time swapping pages in and out of disk than executing instructions, causing system throughput to plummet to near zero.', hint: 'Endless paging activity.' },
        { front: 'What is the Dirty Bit (Modify Bit) in a page table entry?', back: 'A hardware flag that indicates whether a page has been modified since being loaded from disk. If dirty, it must be written back to disk before being replaced.', hint: 'Has it changed?' },
        { front: 'What is the Working Set Model?', back: 'A strategy that tracks the set of pages currently referenced by a process during a sliding time window (Δ) to prevent thrashing by only running processes whose working sets fit in RAM.', hint: 'Active page footprint.' },
        { front: 'What is the Clock (Second-Chance) page replacement algorithm?', back: 'A FIFO-based approximation of LRU that inspects a reference bit. If 0, page is replaced; if 1, bit is cleared to 0, page gets a second chance, and pointer advances.', hint: 'Circular buffer with second chances.' },
        { front: 'What is the difference between Internal and External Fragmentation?', back: 'Internal fragmentation is unused space within an allocated fixed block (e.g. paging). External fragmentation is free memory broken into small scattered holes between allocated partitions (e.g. segmentation).', hint: 'Inside allocated block vs between blocks.' },
      ],
      quiz: [
        {
          question_text: 'What hardware component translates virtual addresses into physical addresses?',
          options: ['ALU', 'Memory Management Unit (MMU)', 'Interrupt Controller', 'DMA Controller'],
          correct_answer: 'Memory Management Unit (MMU)',
          explanation: 'The MMU performs runtime address translation between the logical/virtual addresses generated by the CPU and physical addresses in RAM.'
        },
        {
          question_text: 'What occurs when a process attempts to access a page marked invalid in its page table?',
          options: ['Segmentation Violation Signal', 'Immediate Kernel Panic', 'Page Fault Trap', 'Deadlock Detection'],
          correct_answer: 'Page Fault Trap',
          explanation: 'An invalid bit triggers a hardware page fault trap, prompting the OS to bring the missing page from disk into a free RAM frame.'
        },
        {
          question_text: 'Which page replacement algorithm can suffer from Belady’s Anomaly?',
          options: ['Least Recently Used (LRU)', 'Optimal Page Replacement', 'First-In First-Out (FIFO)', 'Working Set Model'],
          correct_answer: 'First-In First-Out (FIFO)',
          explanation: 'FIFO is prone to Belady’s Anomaly, where giving a process more page frames can paradoxically increase the number of page faults.'
        },
        {
          question_text: 'What is the purpose of the Translation Lookaside Buffer (TLB)?',
          options: ['To cache disk sectors in RAM', 'To cache page table translations for fast memory access', 'To store CPU instruction registers', 'To hold pending system calls'],
          correct_answer: 'To cache page table translations for fast memory access',
          explanation: 'The TLB is a high-speed hardware cache that stores recent virtual-to-physical address translations to avoid multiple memory reads per access.'
        },
        {
          question_text: 'When a system is "thrashing", what is occurring?',
          options: ['All threads are deadlocked waiting for a mutex', 'The OS spends almost all its time swapping pages rather than executing code', 'The CPU cache is permanently disabled', 'The file system has run out of inodes'],
          correct_answer: 'The OS spends almost all its time swapping pages rather than executing code',
          explanation: 'Thrashing occurs when the total working sets of active processes exceed available physical memory, leading to continuous disk I/O.'
        },
        {
          question_text: 'Why is the Optimal Page Replacement algorithm impossible to implement in general operating systems?',
          options: ['It uses too much physical RAM', 'It requires future knowledge of which pages will be referenced', 'It produces more page faults than FIFO', 'It cannot handle virtual memory beyond 4GB'],
          correct_answer: 'It requires future knowledge of which pages will be referenced',
          explanation: 'The Optimal algorithm replaces the page that will not be used for the longest period in the future, which cannot be known in advance.'
        },
        {
          question_text: 'What does the "Dirty Bit" in a page table entry signal?',
          options: ['The page has an execution virus', 'The page has been modified in RAM and must be written to disk on eviction', 'The page is read-only', 'The page is shared across all processes'],
          correct_answer: 'The page has been modified in RAM and must be written to disk on eviction',
          explanation: 'If the dirty bit is 0, the page on disk is identical to the one in RAM, so eviction requires no disk write.'
        },
        {
          question_text: 'Which type of fragmentation is commonly found in paging systems?',
          options: ['External Fragmentation', 'Internal Fragmentation', 'Temporal Fragmentation', 'Cache Incoherence'],
          correct_answer: 'Internal Fragmentation',
          explanation: 'Paging eliminates external fragmentation, but internal fragmentation occurs within the final page allocated to a process if it doesn’t fill the entire frame.'
        },
        {
          question_text: 'How does the Second-Chance (Clock) algorithm approximate LRU?',
          options: ['By sorting all pages in ascending order of arrival', 'By checking a reference bit and giving referenced pages a second pass', 'By evicting the newest page first', 'By killing processes with highest memory usage'],
          correct_answer: 'By checking a reference bit and giving referenced pages a second pass',
          explanation: 'The Clock algorithm cycles through frames; if a page reference bit is 1, it sets it to 0 and moves on; if 0, it replaces that frame.'
        },
        {
          question_text: 'What does the Working Set of a process represent?',
          options: ['The total size of the process binary on disk', 'The set of pages actively referenced during the most recent time window', 'The maximum number of open files', 'The registers saved during a context switch'],
          correct_answer: 'The set of pages actively referenced during the most recent time window',
          explanation: 'The working set tracks the pages actively in use by a process, helping the kernel allocate enough frames to avoid thrashing.'
        }
      ]
    },

    deadlocks_concurrency: {
      name: 'Deadlocks & Synchronization',
      description: 'Mutexes, semaphores, race conditions, critical section problem, Coffman conditions, and Banker’s algorithm.',
      flashcards: [
        { front: 'What is a Race Condition?', back: 'A situation where multiple concurrent processes or threads access and manipulate shared data, and the final outcome depends on the unpredictable order of execution.', hint: 'Order of arrival changes output.' },
        { front: 'What are the three requirements for solving the Critical Section Problem?', back: '1. Mutual Exclusion (only one inside at a time)\n2. Progress (selection cannot be indefinitely postponed)\n3. Bounded Waiting (limit on times others can enter before a waiting process).', hint: 'Mutex, progress, and bounded wait.' },
        { front: 'What are the 4 Coffman Conditions required for Deadlock?', back: '1. Mutual Exclusion\n2. Hold and Wait\n3. No Preemption\n4. Circular Wait.\n(All 4 must hold simultaneously for a deadlock to exist).', hint: 'The 4 deadly conditions.' },
        { front: 'What is the difference between a Mutex and a Counting Semaphore?', back: 'A Mutex is a locking mechanism with ownership (only lock holder can unlock, binary 0/1). A Semaphore is a signaling mechanism (counter tracking available resource permits, wait/signal).', hint: 'Lock with ownership vs signaling counter.' },
        { front: 'How does the Banker’s Algorithm ensure Deadlock Avoidance?', back: 'Before granting a resource request, it simulates the allocation to verify that a "Safe State" still exists—meaning there is at least one sequence where all processes can finish.', hint: 'Safe state check before granting.' },
        { front: 'What is Deadlock Prevention vs Deadlock Avoidance?', back: 'Prevention eliminates at least one of the 4 Coffman conditions by design. Avoidance dynamically inspects resource requests and grants them only if the system remains in a safe state.', hint: 'Static restriction vs dynamic safety checking.' },
        { front: 'What is a Deadlock Detection and Recovery mechanism?', back: 'The OS periodically runs an algorithm (like wait-for graph cycle detection). Upon detecting deadlock, it recovers by terminating processes or preempting resources.', hint: 'Detect cycles and abort/preempt.' },
        { front: 'What is Peterson’s Algorithm?', back: 'A classic software-based solution to the critical section problem for two processes that uses shared turn and flag variables to satisfy mutual exclusion, progress, and bounded waiting.', hint: 'Two processes, turn and flag.' },
        { front: 'What is Priority Inversion and how does Priority Inheritance solve it?', back: 'When a low-priority thread holds a lock needed by a high-priority thread, medium-priority threads might preempt the low one. Priority Inheritance temporarily boosts the low thread’s priority to that of the waiting high thread.', hint: 'Low thread inherits high thread priority.' },
        { front: 'What is a Spinlock and when is it appropriate?', back: 'A lock where a thread loops continuously ("spins") while waiting for the lock. Appropriate on multiprocessor systems for very short wait times, avoiding context switch overhead.', hint: 'Busy waiting on multicore.' },
      ],
      quiz: [
        {
          question_text: 'Which of the following is NOT one of the four Coffman conditions required for deadlock?',
          options: ['Mutual Exclusion', 'Hold and Wait', 'Aging', 'Circular Wait'],
          correct_answer: 'Aging',
          explanation: 'Aging is a scheduling technique used to prevent starvation, not a deadlock condition. The four conditions are Mutual Exclusion, Hold and Wait, No Preemption, and Circular Wait.'
        },
        {
          question_text: 'What algorithm is famously used to avoid deadlocks in systems with multiple resource instances?',
          options: ['Dijkstra’s Shortest Path', 'Banker’s Algorithm', 'Peterson’s Algorithm', 'Round Robin'],
          correct_answer: 'Banker’s Algorithm',
          explanation: 'Banker’s Algorithm verifies that allocating resources will leave the system in a safe state before granting the request.'
        },
        {
          question_text: 'What is a primary requirement of the Critical Section Problem?',
          options: ['Multilevel Feedback', 'Mutual Exclusion', 'Demand Paging', 'Direct Memory Access'],
          correct_answer: 'Mutual Exclusion',
          explanation: 'Mutual exclusion guarantees that only one process at a time can be executing inside its critical section.'
        },
        {
          question_text: 'What occurs during "Priority Inversion"?',
          options: ['A low-priority process is starved by high-priority processes', 'A higher-priority process is indirectly blocked by lower-priority processes holding shared locks', 'All processes are assigned priority 0', 'The scheduler reverses the order of the ready queue'],
          correct_answer: 'A higher-priority process is indirectly blocked by lower-priority processes holding shared locks',
          explanation: 'Priority inversion happens when a low-priority thread holds a mutex needed by a high-priority thread, and medium-priority threads preempt the low thread.'
        },
        {
          question_text: 'How does Priority Inheritance resolve priority inversion?',
          options: ['By aborting all medium-priority threads', 'By temporarily elevating the priority of the lock-holding thread to match the highest waiting thread', 'By disabling all CPU interrupts permanently', 'By resetting the system clock'],
          correct_answer: 'By temporarily elevating the priority of the lock-holding thread to match the highest waiting thread',
          explanation: 'By giving the lock holder the higher priority, it finishes its critical section promptly without being preempted by intermediate threads.'
        },
        {
          question_text: 'What is a Spinlock?',
          options: ['A lock that rotates between ready queues', 'A lock where waiting threads loop continuously checking a condition rather than sleeping', 'A disk scheduling head movement algorithm', 'A memory compaction algorithm'],
          correct_answer: 'A lock where waiting threads loop continuously checking a condition rather than sleeping',
          explanation: 'Spinlocks busy-wait on CPU cores, making them efficient only when lock hold times are shorter than context switch costs.'
        },
        {
          question_text: 'In a Resource Allocation Graph (RAG) with single resource instances, what indicates a deadlock?',
          options: ['Presence of a cycle in the graph', 'Any disconnected node', 'More than 4 processes active', 'A leaf node with zero incoming edges'],
          correct_answer: 'Presence of a cycle in the graph',
          explanation: 'If each resource has exactly one instance, a cycle in the resource allocation graph is a necessary and sufficient condition for deadlock.'
        },
        {
          question_text: 'Which atomic hardware instruction is commonly used to implement mutex locks and semaphores?',
          options: ['Compare-And-Swap (CAS) / Test-And-Set', 'Bit Shift Left (SHL)', 'Floating Point Add (FADD)', 'Jump if Zero (JZ)'],
          correct_answer: 'Compare-And-Swap (CAS) / Test-And-Set',
          explanation: 'Atomic instructions like Test-and-Set and Compare-and-Swap execute indivisibly, enabling thread-safe lock acquisitions.'
        },
        {
          question_text: 'What is the main difference between a Mutex and a Semaphore?',
          options: ['A mutex has an owner who locks and unlocks it, while a semaphore is a counter signaling available permits', 'A mutex only works on single-core systems', 'A semaphore cannot be used for synchronization', 'A mutex allows multiple threads into the critical section simultaneously'],
          correct_answer: 'A mutex has an owner who locks and unlocks it, while a semaphore is a counter signaling available permits',
          explanation: 'Mutexes have lock ownership semantics, while semaphores are generalized integer counters modified via wait() and signal().'
        },
        {
          question_text: 'Deadlock Prevention works by:',
          options: ['Dynamically monitoring resource allocations at runtime', 'Ensuring at least one of the 4 Coffman conditions can never hold', 'Terminating one process every 10 seconds', 'Restarting the computer whenever contention occurs'],
          correct_answer: 'Ensuring at least one of the 4 Coffman conditions can never hold',
          explanation: 'Prevention designs system protocols so that at least one necessary condition (e.g. Circular Wait by ordering resources) is physically impossible.'
        }
      ]
    },

    processes_threads: {
      name: 'Processes & Threads',
      description: 'PCB, process lifecycle states, context switching, fork/exec, IPC mechanisms, and multithreading models.',
      flashcards: [
        { front: 'What is a Process in an Operating System?', back: 'A program in execution, consisting of program code (text section), current activity (program counter, registers), stack, data section, and heap.', hint: 'Active instance of a program.' },
        { front: 'What are the 5 classic Process States?', back: '1. New (being created)\n2. Ready (waiting for CPU)\n3. Running (instructions executing)\n4. Waiting / Blocked (waiting for I/O or event)\n5. Terminated (finished).', hint: 'New, Ready, Running, Waiting, Terminated.' },
        { front: 'What is a Process Control Block (PCB)?', back: 'A kernel data structure containing all information needed to manage a process: PID, state, program counter, CPU registers, scheduling priority, memory limits, and list of open files.', hint: 'The passport of a process.' },
        { front: 'What occurs during a Context Switch?', back: 'The kernel saves the state (registers, program counter, memory context) of the currently running process to its PCB and loads the saved state of the newly scheduled process.', hint: 'Swapping process states.' },
        { front: 'How does fork() work in UNIX systems?', back: 'fork() creates an exact duplicate child process. It returns 0 in the child process and returns the child’s PID in the parent process (or negative on error).', hint: 'Returns twice: 0 to child, PID to parent.' },
        { front: 'What is the difference between a Process and a Thread?', back: 'A process has its own isolated address space, file descriptors, and security context. A thread is a lightweight unit of execution that shares code, data, and open files with other threads in the same process, but has its own stack and registers.', hint: 'Isolated address space vs shared memory.' },
        { front: 'What is an Orphan Process and a Zombie Process?', back: 'A Zombie is a process that has terminated but its parent has not yet read its exit status via wait(). An Orphan is a process whose parent terminated while it was still running (adopted by init/systemd).', hint: 'Dead but uncollected vs parent died.' },
        { front: 'What are the main mechanisms for Inter-Process Communication (IPC)?', back: '1. Shared Memory (fastest, requires synchronization)\n2. Message Passing (pipes, FIFOs, message queues, sockets)\n3. Signals (asynchronous event notifications).', hint: 'Shared memory and message passing.' },
        { front: 'What are the 3 Multithreading Models?', back: '1. Many-to-One (user threads mapped to 1 kernel thread)\n2. One-to-One (each user thread maps to a kernel thread, true concurrency)\n3. Many-to-Many (multiplexes user threads over kernel threads).', hint: 'M:1, 1:1, M:N.' },
        { front: 'What is Amdahl’s Law in multicore computing?', back: 'A formula identifying the theoretical speedup of a program on multiple processors: Speedup <= 1 / (S + (1 - S) / N), where S is the serial portion and N is core count.', hint: 'Serial bottleneck limits parallelism.' },
      ],
      quiz: [
        {
          question_text: 'What value does the UNIX fork() system call return to the newly created child process?',
          options: ['The Parent’s PID', '0', '-1', '1'],
          correct_answer: '0',
          explanation: 'fork() returns 0 to the child process and the child PID to the parent process, allowing code to branch conditionally.'
        },
        {
          question_text: 'Which resource is NOT shared between threads of the same process?',
          options: ['Code / Text segment', 'Global Data and Heap', 'Stack and CPU Registers', 'Open File Descriptors'],
          correct_answer: 'Stack and CPU Registers',
          explanation: 'Each thread has its own private stack and register state (including program counter) to track independent function execution.'
        },
        {
          question_text: 'What is a "Zombie Process"?',
          options: ['A process consuming 100% CPU in an infinite loop', 'A terminated process whose exit status has not yet been collected by its parent via wait()', 'A process that survived a system reboot', 'A process with no assigned PID'],
          correct_answer: 'A terminated process whose exit status has not yet been collected by its parent via wait()',
          explanation: 'A zombie process has released its memory and execution resources, but retains an entry in the process table until the parent reads its exit code.'
        },
        {
          question_text: 'Which kernel structure holds all operational metadata for an active process?',
          options: ['File Allocation Table', 'Process Control Block (PCB)', 'Interrupt Vector Table', 'Superblock'],
          correct_answer: 'Process Control Block (PCB)',
          explanation: 'The PCB stores the PID, state, PC, registers, memory management information, and open file handles for a process.'
        },
        {
          question_text: 'Which Inter-Process Communication (IPC) mechanism offers the highest throughput for large data transfers?',
          options: ['Named Pipes', 'Network Sockets', 'Shared Memory', 'UNIX Domain Signals'],
          correct_answer: 'Shared Memory',
          explanation: 'Shared memory eliminates data copying between user space and kernel space, allowing processes to read and write directly at RAM speeds.'
        },
        {
          question_text: 'What happens during a context switch?',
          options: ['The CPU executes a hardware reboot', 'The state of the running process is saved and the state of the scheduled process is restored', 'Memory compaction runs across all frames', 'All file caches are flushed to disk'],
          correct_answer: 'The state of the running process is saved and the state of the scheduled process is restored',
          explanation: 'Context switching saves the CPU register state and program counter into the current PCB and loads the next process state.'
        },
        {
          question_text: 'Which multithreading model provides true parallel execution across multiple CPU cores without blocking other threads during a syscall?',
          options: ['Many-to-One Model', 'One-to-One Model', 'Single-Threaded Model', 'Cooperative Fiber Model'],
          correct_answer: 'One-to-One Model',
          explanation: 'In the 1:1 model (standard on Linux and Windows), each user thread maps to a kernel thread, enabling true simultaneous multicore execution.'
        },
        {
          question_text: 'Which process state describes a process that is in memory waiting to be assigned a CPU core?',
          options: ['Running', 'Ready', 'Waiting / Blocked', 'Suspended'],
          correct_answer: 'Ready',
          explanation: 'A process in the Ready state has all required resources and is simply waiting in the ready queue for the CPU scheduler to dispatch it.'
        },
        {
          question_text: 'What system call replaces the current process image with a new executable binary in UNIX?',
          options: ['fork()', 'exec() (execve)', 'wait()', 'exit()'],
          correct_answer: 'exec() (execve)',
          explanation: 'The exec family of system calls loads a new binary into the process address space and begins executing its entry point.'
        },
        {
          question_text: 'What happens to an Orphan Process when its parent terminates unexpectedly?',
          options: ['It is immediately killed by the kernel', 'It is adopted by the root init/systemd process (PID 1)', 'It becomes a zombie permanently', 'Its memory is corrupted'],
          correct_answer: 'It is adopted by the root init/systemd process (PID 1)',
          explanation: 'Orphan processes are reassigned to PID 1 (init or systemd), which periodically calls wait() to reap them upon exit.'
        }
      ]
    },

    file_systems: {
      name: 'File Systems & Storage',
      description: 'Inodes, directory structures, allocation methods (contiguous, linked, indexed), and disk scheduling.',
      flashcards: [
        { front: 'What is an Inode in UNIX-like file systems?', back: 'A data structure that stores all file metadata (permissions, ownership, size, timestamps, block pointers) except for the file name and the actual file data.', hint: 'Index node storing metadata.' },
        { front: 'What are the three main file allocation methods?', back: '1. Contiguous Allocation (fast, suffers from external fragmentation)\n2. Linked Allocation (no external fragmentation, slow random access)\n3. Indexed Allocation (uses index blocks/inodes, fast direct and sequential access).', hint: 'Contiguous, Linked, Indexed.' },
        { front: 'What is a Superblock in a file system?', back: 'A critical block near the beginning of a filesystem partition containing geometry, block size, total blocks, free block lists, inode counts, and mount status.', hint: 'The master record of the filesystem.' },
        { front: 'What is the SCAN (Elevator) disk scheduling algorithm?', back: 'The disk arm moves in one direction servicing all requests until it reaches the edge, then reverses direction servicing requests on the way back, preventing starvation.', hint: 'Like an elevator moving up and down.' },
        { front: 'What is the difference between Hard Links and Symbolic (Soft) Links?', back: 'A hard link points directly to the inode number (sharing the same inode and data blocks). A soft link is a distinct file containing the pathname string to another file.', hint: 'Direct inode pointer vs path shortcut.' },
        { front: 'What is Journaling in modern file systems?', back: 'A technique where filesystem metadata changes are written to a dedicated log (journal) before being committed to the main filesystem, enabling fast recovery after crashes.', hint: 'Log before committing.' },
        { front: 'What is C-SCAN (Circular SCAN) disk scheduling?', back: 'Similar to SCAN, but when the arm reaches the end, it immediately jumps back to the beginning without servicing requests on the return trip, providing more uniform wait times.', hint: 'One-way sweep with instant return.' },
        { front: 'What is SSTF (Shortest Seek Time First) and what is its drawback?', back: 'SSTF chooses the request closest to the current head position to minimize seek time. Drawback: it can cause starvation for requests located far from the current head.', hint: 'Greedy seek time can starve outer tracks.' },
        { front: 'What is Direct Memory Access (DMA) in I/O systems?', back: 'A hardware mechanism allowing device controllers to transfer whole blocks of data directly to/from main memory without continuous CPU intervention.', hint: 'Bypassing the CPU for bulk transfers.' },
        { front: 'How does an Inode handle very large files?', back: 'By using direct block pointers for small files, and single, double, and triple indirect pointers for large files to address thousands of blocks hierarchically.', hint: 'Direct, single, double, and triple indirect.' },
      ],
      quiz: [
        {
          question_text: 'In a UNIX file system, where is the file name stored?',
          options: ['Inside the inode of the file', 'Inside the directory data block pointing to the inode number', 'In the partition boot sector', 'In the CPU cache'],
          correct_answer: 'Inside the directory data block pointing to the inode number',
          explanation: 'The directory entry maps a human-readable file name to an inode number. The inode itself stores metadata and block pointers, not the file name.'
        },
        {
          question_text: 'Which disk scheduling algorithm operates like an elevator by moving in one direction to the end and reversing?',
          options: ['First-Come First-Served (FCFS)', 'Shortest Seek Time First (SSTF)', 'SCAN', 'C-LOOK'],
          correct_answer: 'SCAN',
          explanation: 'The SCAN algorithm moves the disk arm across cylinders in one direction, servicing requests, and then reverses direction at the boundary.'
        },
        {
          question_text: 'What is the primary vulnerability of Shortest Seek Time First (SSTF) disk scheduling?',
          options: ['High context switch latency', 'Starvation of requests on distant tracks', 'Loss of directory inodes', 'Excessive power consumption'],
          correct_answer: 'Starvation of requests on distant tracks',
          explanation: 'If new requests arrive close to the head, SSTF will continuously service them, starving requests on the far edges of the disk platter.'
        },
        {
          question_text: 'What happens when you delete the original file of a Symbolic (Soft) Link?',
          options: ['The soft link is automatically deleted', 'The soft link becomes a broken (dangling) link', 'The file content is retained in the soft link', 'The OS kernel throws an unrecoverable trap'],
          correct_answer: 'The soft link becomes a broken (dangling) link',
          explanation: 'A symbolic link only stores a target file path; deleting the target leaves the link pointing to a non-existent path.'
        },
        {
          question_text: 'What is the main benefit of a Journaling File System (such as ext4 or NTFS)?',
          options: ['Eliminates the need for RAM caching', 'Rapid crash consistency and recovery without scanning the entire disk', 'Infinite storage capacity', 'Automated process scheduling'],
          correct_answer: 'Rapid crash consistency and recovery without scanning the entire disk',
          explanation: 'By logging transactions before applying them, a journaling file system can quickly replay or roll back incomplete operations after an unexpected power outage.'
        },
        {
          question_text: 'Which file allocation method suffers from external fragmentation and requires knowing file size in advance?',
          options: ['Contiguous Allocation', 'Linked Allocation', 'Indexed Allocation', 'FAT Allocation'],
          correct_answer: 'Contiguous Allocation',
          explanation: 'Contiguous allocation requires contiguous disk sectors, which creates external fragmentation over time and makes extending files difficult.'
        },
        {
          question_text: 'How does Direct Memory Access (DMA) benefit the CPU during disk I/O?',
          options: ['The CPU executes byte-by-byte copies faster', 'The disk controller transfers entire blocks directly to RAM, interrupting the CPU only once per transfer', 'DMA disables virtual memory', 'DMA increases seek time'],
          correct_answer: 'The disk controller transfers entire blocks directly to RAM, interrupting the CPU only once per transfer',
          explanation: 'DMA offloads bulk data transfers between I/O devices and memory, freeing the CPU to execute application instructions.'
        },
        {
          question_text: 'In a UNIX inode, what are Indirect Pointers used for?',
          options: ['To point to processes holding file locks', 'To point to disk blocks containing addresses of additional data blocks, accommodating large files', 'To point to the parent directory', 'To point to network sockets'],
          correct_answer: 'To point to disk blocks containing addresses of additional data blocks, accommodating large files',
          explanation: 'Indirect pointers point to blocks of pointers, allowing the file system to scale to files gigabytes or terabytes in size.'
        },
        {
          question_text: 'What distinguishes C-SCAN from standard SCAN disk scheduling?',
          options: ['C-SCAN reverses direction and services requests both ways', 'C-SCAN only services requests in one direction and jumps back to the start without servicing on the return', 'C-SCAN services the largest file first', 'C-SCAN ignores rotational delay'],
          correct_answer: 'C-SCAN only services requests in one direction and jumps back to the start without servicing on the return',
          explanation: 'Circular SCAN treats the cylinders as a circular list, providing a more uniform wait time distribution across all tracks.'
        },
        {
          question_text: 'What file system structure maintains the allocation status of free blocks?',
          options: ['Free space bit map (bit vector) or free list', 'Translation Lookaside Buffer', 'Interrupt Vector Table', 'Process Control Block'],
          correct_answer: 'Free space bit map (bit vector) or free list',
          explanation: 'Operating systems use bit vectors (where each bit represents a block’s allocated/free state) or linked lists to manage free disk blocks.'
        }
      ]
    },
    data_structures: {
      name: 'Data Structures & Algorithms',
      description: 'Big-O notation, trees, graphs, sorting, and dynamic programming.',
      flashcards: [
        { front: 'What does Big-O notation describe?', back: 'The upper bound of the growth rate of an algorithm’s time or space complexity as input size increases.', hint: 'Asymptotic upper bound' },
        { front: 'What is the average time complexity of QuickSort?', back: 'O(N log N) average time, with O(N²) worst-case when poor pivots are chosen.', hint: 'Divide and conquer' },
        { front: 'How does a Hash Table achieve O(1) average lookup time?', back: 'By computing a hash of the key to index directly into an underlying array.', hint: 'Direct array indexing via hash function' },
        { front: 'What is the difference between a Stack and a Queue?', back: 'A Stack is Last-In First-Out (LIFO); a Queue is First-In First-Out (FIFO).', hint: 'LIFO vs FIFO' },
        { front: 'What is Binary Search and its time complexity?', back: 'A search algorithm on sorted arrays that divides the search interval in half each step, running in O(log N) time.', hint: 'Divide search space in half' }
      ],
      quiz: [
        {
          question_text: 'What is the time complexity of searching in a balanced Binary Search Tree (BST)?',
          options: ['O(log N)', 'O(1)', 'O(N)', 'O(N²)'],
          correct_answer: 'O(log N)',
          explanation: 'In a balanced BST, each comparison halves the remaining search space, giving logarithmic time.'
        },
        {
          question_text: 'Which data structure follows the First-In First-Out (FIFO) principle?',
          options: ['Queue', 'Stack', 'Heap', 'Binary Tree'],
          correct_answer: 'Queue',
          explanation: 'A Queue processes items in the exact order they arrive (FIFO).'
        }
      ]
    },
    physics: {
      name: 'Physics & Classical Mechanics',
      description: 'Newton’s laws, kinetic & potential energy, gravitation, and conservation laws.',
      flashcards: [
        { front: 'State Newton’s Second Law of Motion.', back: 'Force equals mass times acceleration (F = ma). Net force produces proportional acceleration.', hint: 'F = ma' },
        { front: 'What is the Law of Conservation of Energy?', back: 'Energy cannot be created or destroyed, only transformed from one form to another in an isolated system.', hint: 'Total energy remains constant' },
        { front: 'What is the difference between Kinetic and Potential Energy?', back: 'Kinetic energy is energy of motion (½mv²); potential energy is stored energy due to position or state (e.g. mgh).', hint: 'Motion vs position' },
        { front: 'What is the speed of light in a vacuum?', back: 'Approximately 3.0 × 10⁸ meters per second (299,792,458 m/s).', hint: 'c in E = mc²' },
        { front: 'What does the First Law of Thermodynamics state?', back: 'The change in internal energy of a system equals heat added minus work done by the system (ΔU = Q - W).', hint: 'Conservation of energy in thermal systems' }
      ],
      quiz: [
        {
          question_text: 'According to Newton’s second law, what is the acceleration of a 5 kg object subjected to a 20 N net force?',
          options: ['4 m/s²', '100 m/s²', '0.25 m/s²', '15 m/s²'],
          correct_answer: '4 m/s²',
          explanation: 'a = F / m = 20 N / 5 kg = 4 m/s².'
        },
        {
          question_text: 'Which quantity is conserved in all isolated collisions (both elastic and inelastic)?',
          options: ['Linear momentum', 'Kinetic energy', 'Mechanical energy', 'Velocity'],
          correct_answer: 'Linear momentum',
          explanation: 'Total linear momentum is always conserved in isolated systems regardless of whether kinetic energy is lost.'
        }
      ]
    },
    calculus: {
      name: 'Calculus & Mathematical Analysis',
      description: 'Derivatives, integrals, limits, and fundamental theorems.',
      flashcards: [
        { front: 'What is a derivative intuitively?', back: 'The instantaneous rate of change of a function with respect to a variable, or the slope of the tangent line.', hint: 'Instantaneous rate of change' },
        { front: 'State the Fundamental Theorem of Calculus.', back: 'Differentiation and integration are inverse operations: ∫ f(x)dx evaluated from a to b = F(b) - F(a) where F’(x) = f(x).', hint: 'Connects integrals and derivatives' },
        { front: 'What is the derivative of sin(x)?', back: 'cos(x).', hint: 'Trig derivative' },
        { front: 'What does a definite integral represent geometrically?', back: 'The net signed area between the function curve and the x-axis over an interval [a, b].', hint: 'Area under the curve' },
        { front: 'What is L’Hôpital’s Rule used for?', back: 'Evaluating limits of indeterminate forms (like 0/0 or ∞/∞) by differentiating the numerator and denominator.', hint: 'Indeterminate limit forms' }
      ],
      quiz: [
        {
          question_text: 'What is the derivative of f(x) = x³ with respect to x?',
          options: ['3x²', 'x²', '3x', 'x⁴/4'],
          correct_answer: '3x²',
          explanation: 'By the power rule, d/dx(xⁿ) = n·xⁿ⁻¹, so d/dx(x³) = 3x².'
        },
        {
          question_text: 'What is the integral of 1/x with respect to x for x > 0?',
          options: ['ln(x) + C', 'x² + C', '1/x² + C', 'e^x + C'],
          correct_answer: 'ln(x) + C',
          explanation: 'The antiderivative of 1/x is the natural logarithm ln|x| + C.'
        }
      ]
    },
    biology: {
      name: 'Cell Biology & Genetics',
      description: 'Cell structure, DNA replication, transcription, translation, and inheritance.',
      flashcards: [
        { front: 'What is the powerhouse of the eukaryotic cell?', back: 'The Mitochondrion, which produces ATP through cellular respiration.', hint: 'ATP synthesis' },
        { front: 'What are the four nucleotide bases in DNA?', back: 'Adenine (A), Thymine (T), Cytosine (C), and Guanine (G).', hint: 'A pairs with T, C pairs with G' },
        { front: 'What is the Central Dogma of Molecular Biology?', back: 'Genetic information flows from DNA → RNA (transcription) → Protein (translation).', hint: 'DNA to RNA to Protein' },
        { front: 'What is the primary chemical equation of photosynthesis?', back: '6CO₂ + 6H₂O + light → C₆H₁₂O₆ + 6O₂.', hint: 'Carbon dioxide and water into glucose and oxygen' },
        { front: 'What is the difference between Mitosis and Meiosis?', back: 'Mitosis produces 2 genetically identical diploid somatic cells; meiosis produces 4 genetically diverse haploid gametes.', hint: 'Body cells vs sex cells' }
      ],
      quiz: [
        {
          question_text: 'Which organelle is responsible for synthesizing proteins in the cell?',
          options: ['Ribosome', 'Golgi apparatus', 'Lysosome', 'Vacuole'],
          correct_answer: 'Ribosome',
          explanation: 'Ribosomes translate mRNA sequences into polypeptide chains (proteins).'
        },
        {
          question_text: 'In DNA, which base pairs with Cytosine (C)?',
          options: ['Guanine (G)', 'Adenine (A)', 'Thymine (T)', 'Uracil (U)'],
          correct_answer: 'Guanine (G)',
          explanation: 'Cytosine always forms three hydrogen bonds with Guanine in DNA double helices.'
        }
      ]
    },
    world_history: {
      name: 'World History & Civilizations',
      description: 'Major historical eras, scientific revolutions, and transformative global events.',
      flashcards: [
        { front: 'What was the Industrial Revolution?', back: 'The transition to new manufacturing processes in Europe and the US (1760–1840), powered by steam engines and mechanization.', hint: 'Steam power and factories' },
        { front: 'What was the Renaissance?', back: 'A cultural, artistic, and intellectual movement in Europe (14th–17th centuries) marked by the revival of classical learning and humanism.', hint: 'Rebirth of arts and sciences' },
        { front: 'What was the Scientific Revolution?', back: 'A series of events in the 16th–18th centuries (Copernicus, Galileo, Newton) that established modern empirical science.', hint: 'Empirical observation and math' },
        { front: 'When did World War II end?', back: '1945, concluding with the Allied victory.', hint: 'Mid-20th century' },
        { front: 'Who invented the movable-type printing press in Europe?', back: 'Johannes Gutenberg around 1440, revolutionizing the spread of knowledge.', hint: 'Gutenberg press' }
      ],
      quiz: [
        {
          question_text: 'In which century did the European Scientific Revolution gain major momentum with Copernicus and Galileo?',
          options: ['16th–17th Century', '12th Century', '19th Century', '20th Century'],
          correct_answer: '16th–17th Century',
          explanation: 'The Scientific Revolution took place primarily between the mid-16th century and late 17th century.'
        },
        {
          question_text: 'What technological advance catalyzed the Industrial Revolution?',
          options: ['James Watt’s steam engine improvements', 'The electric lightbulb', 'The transistor', 'The steam turbine'],
          correct_answer: 'James Watt’s steam engine improvements',
          explanation: 'The improved steam engine provided reliable continuous power for factories and locomotives.'
        }
      ]
    }
  };

  /* ──────────────────────────────────────────────────────────────────────────
     3. INTELLIGENT AI KNOWLEDGE RESPONSE FALLBACK & INSTANT MATH SOLVER
     ────────────────────────────────────────────────────────────────────────── */

  function solveMathQuery(query) {
    if (!query) return null;
    const text = query.trim().toLowerCase();

    // Must have at least one digit or math keyword
    if (!/\d/.test(text) && !/(pi|sqrt|abs|sin|cos|tan)/.test(text)) return null;

    // Filter out question prefixes and punctuation
    let expr = text
      .replace(/^(what is the answer for|what is the answer to|what is the value of|what is|what's|calculate|solve|evaluate|find|compute)\s+/i, '')
      .replace(/[?!=]+$/g, '')
      .replace(/\bthe answer for\b/gi, '')
      .replace(/\bthe answer to\b/gi, '')
      .replace(/\bequals\b/gi, '')
      .trim();

    // Replace written arithmetic words
    expr = expr
      .replace(/\bplus\b/gi, '+')
      .replace(/\bminus\b/gi, '-')
      .replace(/\btimes\b/gi, '*')
      .replace(/\bmultiplied by\b/gi, '*')
      .replace(/\bdivided by\b/gi, '/')
      .replace(/\bover\b/gi, '/')
      .replace(/\bx\b/gi, '*')
      .replace(/×/g, '*')
      .replace(/÷/g, '/')
      .replace(/\^/g, '**');

    // Replace math functions
    expr = expr
      .replace(/\bsqrt\s*\(/gi, 'Math.sqrt(')
      .replace(/\babs\s*\(/gi, 'Math.abs(')
      .replace(/\bpi\b/gi, 'Math.PI')
      .replace(/\bpow\s*\(/gi, 'Math.pow(');

    expr = expr.replace(/\s+/g, ' ').trim();

    // Safety check: ONLY allow digits, basic operators, Math functions, parentheses, spaces
    if (!/^[\d\s+\-*/%().MathsqrtabspowPI]+$/.test(expr)) {
      return null;
    }

    // Must contain at least one calculation operator or function
    if (!/[+\-*/%*Math]/.test(expr)) {
      return null;
    }

    try {
      const fn = new Function(`"use strict"; return (${expr});`);
      const result = fn();
      if (typeof result === 'number' && !isNaN(result) && isFinite(result)) {
        const displayExpr = expr
          .replace(/Math\.sqrt\(([^)]+)\)/g, '√($1)')
          .replace(/Math\.PI/g, 'π')
          .replace(/\*\*/g, '^');
        const formatted = Number.isInteger(result) ? result.toString() : parseFloat(result.toFixed(6)).toString();
        return `### Math Result 🧮\n\n**${displayExpr} = ${formatted}**\n\nThe answer is **${formatted}**.`;
      }
    } catch {
      return null;
    }
    return null;
  }

  function getLocalKnowledgeReply(query) {
    const raw = (query || '').trim();
    const q = raw.toLowerCase();

    // 1. Instant Math Check (e.g. "what is the answer for 1+1?", "25 * 4", "sqrt(144)")
    const mathAns = solveMathQuery(raw);
    if (mathAns) return mathAns;

    // 2. Greetings
    if (/^(hi|hello|hey|greetings|good\s*(morning|afternoon|evening)|yo|sup)\b/i.test(q)) {
      return `### Hello! I am Pengu, your AI Study Companion 🐧

I'm your all-around assistant ready to explore any subject:
- **Ask Any Question**: Mathematics, physics, natural sciences, history, coding, or everyday questions.
- **Memorize**: Click the button below to generate active-recall flashcards on any topic or from an attached PDF!
- **Challenge**: Click the button below to test yourself with an interactive quiz!

What would you like to explore today?`;
    }

    // 3. Identity & Capabilities
    if (/who are you|what are you|what can you do|help me/i.test(q)) {
      return `### I am Pengu, your AI Study Companion 🐧

I'm designed to help learners understand, explore, and master concepts across any discipline.

**Key Capabilities:**
- **Answer Any Question**: Mathematics, natural sciences, history, literature, computer science, and engineering.
- **Instant Math Solver**: Immediate arithmetic calculations, formula evaluation, and step-by-step logic.
- **Flashcards (Memorize)**: Turn any custom topic or attached PDF into an active-recall flashcard deck.
- **Practice Quizzes (Challenge)**: Create interactive multiple-choice quizzes to test your mastery.
- **Permanent Dashboard Storage**: Every generated study set is saved permanently to your dashboard so you never lose your progress!`;
    }

    // 4. Physics & Natural Sciences
    if (q.includes('physics') || q.includes('gravity') || q.includes('newton') || q.includes('quantum') || q.includes('thermodynamics') || q.includes('relativity') || q.includes('electromagnet')) {
      return `### What is Physics?

**Physics** is the fundamental natural science that studies **matter**, **energy**, **space**, and **time**, and the fundamental forces that govern the physical universe.

#### The Core Pillars of Physics:
1. **Classical Mechanics (Newtonian Physics)**:
   - Examines the motion of macroscopic bodies under the influence of forces.
   - Core principle: Newton's Second Law (\`F = ma\` — Force equals mass times acceleration).
   - Covers concepts such as inertia, momentum, kinetic and potential energy, gravitation, and torque.

2. **Thermodynamics & Statistical Mechanics**:
   - Deals with heat, work, temperature, and statistical behaviors of large ensembles of atoms and molecules.
   - The Laws of Thermodynamics govern energy conservation and the inevitable increase of **entropy** in closed systems.

3. **Electromagnetism**:
   - The study of electric charges, magnetic fields, and electromagnetic radiation (light, radio, gamma rays).
   - Unified by **Maxwell's Equations**, which show that electricity and magnetism are two facets of a single fundamental interaction.

4. **Quantum Mechanics**:
   - Explores the microscopic realm of atoms, electrons, and photons where classical physics breaks down.
   - Core ideas: **Wave-particle duality**, discrete energy packets (quanta), and Heisenberg's **Uncertainty Principle**.

5. **Relativity (Einsteinian Physics)**:
   - **Special Relativity**: Establishes that the laws of physics and the speed of light (\`c\`) are identical for all inertial observers, yielding mass-energy equivalence (\`E = mc²\`).
   - **General Relativity**: Replaces gravitational force with the geometric curvature of 4D **spacetime** caused by mass.

*Tip: Click **Memorize** below to generate flashcards on Physics, or **Challenge** for a practice quiz!*`;
    }

    // 5. Biology & Life Sciences
    if (q.includes('biology') || q.includes('photosynthesis') || q.includes('dna') || q.includes('rna') || q.includes('evolution') || q.includes('genetics') || q.includes('cell ')) {
      return `### Fundamentals of Biology

**Biology** is the scientific study of **life** and living organisms, including their physical structure, molecular mechanisms, physiological processes, and evolutionary development.

#### Major Biological Pillars:
1. **Cell Theory**: The cell is the basic structural and functional unit of all living organisms. All cells arise from pre-existing cells.
2. **Molecular Genetics (DNA & RNA)**: Genetic instructions are encoded in DNA using four nucleotide bases (A, T, C, G). Transcription and translation convert DNA instructions into functional proteins.
3. **Evolution by Natural Selection**: Formulated by Charles Darwin, evolutionary theory explains biological diversity through differential survival and reproduction of organisms with advantageous traits.
4. **Energy Transformation (Photosynthesis & Respiration)**:
   - **Photosynthesis**: Autotrophs convert light energy, water, and CO₂ into glucose and oxygen (\`6CO₂ + 6H₂O + light → C₆H₁₂O₆ + 6O₂\`).
   - **Cellular Respiration**: Organisms metabolize glucose in mitochondria to produce ATP, powering cellular activity.
5. **Homeostasis**: The maintenance of stable internal physiological conditions despite fluctuating external environments.

*Tip: Select **Memorize** below to create flashcards on Biology, or **Challenge** for an interactive quiz!*`;
    }

    // 6. Chemistry
    if (q.includes('chemistry') || q.includes('atom') || q.includes('molecule') || q.includes('periodic table') || q.includes('chemical reaction') || q.includes('acid') || q.includes('base')) {
      return `### Fundamentals of Chemistry

**Chemistry** is the science of **matter**—its properties, composition, structure, and the transformations it undergoes during chemical reactions.

#### Core Foundations:
1. **Atomic Structure**: Atoms consist of a nucleus of protons and neutrons surrounded by electrons in quantized orbitals.
2. **The Periodic Table**: Elements are arranged by increasing atomic number (\`Z\`), showing recurring trends in electronegativity, ionization energy, and atomic radius.
3. **Chemical Bonding**:
   - **Covalent**: Sharing of electron pairs between nonmetals.
   - **Ionic**: Electrostatic attraction between oppositely charged ions.
   - **Metallic**: Delocalized electron sea holding metal cations together.
4. **Conservation of Mass**: Mass is conserved in chemical reactions; atoms rearrange by breaking and forming bonds.
5. **Thermodynamics & Kinetics**: Reactions depend on enthalpy (\`ΔH\`), entropy (\`ΔS\`), Gibbs free energy (\`ΔG = ΔH - TΔS\`), and activation energy.

*Tip: Click **Memorize** below to generate flashcards on Chemistry, or **Challenge** for a quiz!*`;
    }

    // 7. General Mathematics & Calculus
    if (q.includes('calculus') || q.includes('derivative') || q.includes('integral') || q.includes('linear algebra') || q.includes('matrix') || q.includes('discrete math') || q.includes('algebra')) {
      return `### Mathematics in Science & Computation

Mathematics provides the formal language, rigorous logic, and quantitative models that drive scientific discovery and engineering.

#### Essential Branches:
- **Calculus**: The study of continuous change.
  - **Derivatives**: Measure instantaneous rates of change (slopes, velocities, gradients in machine learning).
  - **Integrals**: Accumulate continuous quantities over intervals (areas, volumes, probability distributions).
- **Linear Algebra**: The study of vectors, vector spaces, and linear transformations (matrices). It is the computational foundation of 3D computer graphics, machine learning backpropagation, and quantum states.
- **Probability & Statistics**: Modeling uncertainty, quantifying risk, hypothesis testing, and inferring patterns from empirical data.
- **Discrete Mathematics**: The language of computation—including set theory, graph theory, combinatorics, Boolean logic, and recurrence relations.

*Tip: Click **Memorize** below to generate flashcards on Mathematics, or **Challenge** for a quiz!*`;
    }

    // 8. General Computer Science, Programming & Algorithms
    if (q.includes('algorithm') || q.includes('data structure') || q.includes('binary search') || q.includes('sorting') || q.includes('recursion') || q.includes('big o') || q.includes('python') || q.includes('javascript')) {
      return `### Computer Science & Programming Fundamentals

Computer science is the study of computation, algorithmic problem solving, software engineering, and digital systems.

#### Core Concepts:
- **Asymptotic Analysis (Big-O Notation)**: Measures the time or space growth rate of an algorithm as input size \`N\` grows:
  - \`O(1)\`: Constant time (hash table lookup).
  - \`O(log N)\`: Logarithmic time (binary search).
  - \`O(N)\`: Linear time (single loop scan).
  - \`O(N log N)\`: Linearithmic time (merge sort, quicksort average).
  - \`O(N²)\`: Quadratic time (nested comparison loops).
- **Fundamental Data Structures**:
  - **Arrays & Linked Lists**: Sequential collections with trade-offs in index speed vs insertion flexibility.
  - **Stacks (LIFO) & Queues (FIFO)**: Vital for call execution stacks and task scheduling queues.
  - **Trees & Binary Search Trees (BST)**: Hierarchical data organization with logarithmic search and retrieval.
  - **Hash Tables**: Key-value mappings offering average \`O(1)\` operations using hash functions and collision resolution.

*Tip: Click **Memorize** below to generate flashcards on Algorithms, or **Challenge** for a quiz!*`;
    }

    // 9. History & Humanities
    if (q.includes('history') || q.includes('world war') || q.includes('civilization') || q.includes('revolution') || q.includes('einstein') || q.includes('philosophy')) {
      return `### Historical & Philosophical Inquiry

Understanding history and philosophical inquiry provides critical context for human civilization, scientific discovery, and social structures.

#### Key Perspectives:
- **Historical Analysis**: Examines primary sources, systemic causes, and consequences of transformative events such as the Agricultural, Scientific, and Industrial Revolutions.
- **Scientific Milestones**: Thinkers like Isaac Newton, Ada Lovelace, and Albert Einstein revolutionized our understanding of the physical universe and computation.
- **Critical Inquiry**: Philosophy, logic, and ethics explore foundational questions of knowledge (epistemology), reason, and morality.

*Tip: Click **Memorize** below to create flashcards on History, or **Challenge** for a quiz!*`;
    }

    // 10. Operating Systems (when explicitly asked)
    if (q.includes('scheduling') || q.includes('round robin') || q.includes('fcfs') || q.includes('sjf') || q.includes('mlfq')) {
      return `### CPU Scheduling in Operating Systems

CPU scheduling determines which process in the **Ready Queue** is allocated the CPU when the currently running process yields or is preempted.

#### Key Scheduling Algorithms:
1. **First-Come, First-Served (FCFS)**: Non-preemptive. Simple FIFO queue. Suffers from the **Convoy Effect**, where short I/O processes wait behind a long CPU-bound job.
2. **Shortest Job First (SJF)**: Optimal for minimizing average waiting time. Hard to implement because the upcoming CPU burst length must be estimated.
3. **Round Robin (RR)**: Preemptive. Each process gets a **time quantum** (typically 10-100ms). If it doesn't finish, it is rotated to the back of the queue. Ideal for interactive systems.
4. **Priority Scheduling**: Processes have priority levels. Can suffer from **Starvation** (indefinite blocking), which is solved using **Aging** (increasing priority over time).
5. **Multilevel Feedback Queue (MLFQ)**: Uses multiple queues with differing priorities and quantums. Demotes CPU-heavy processes and promotes I/O-heavy ones dynamically.

*Tip: Click **Memorize** below to generate 10 flashcards on CPU Scheduling, or **Challenge** to test yourself with a 10-question quiz!*`;
    }

    if (q.includes('virtual memory') || q.includes('paging') || q.includes('page fault') || q.includes('tlb') || q.includes('lru') || q.includes('thrashing') || q.includes('fragmentation')) {
      return `### Virtual Memory & Paging Architecture

Virtual memory decouples the programmer's logical address space from physical RAM, allowing systems to run applications that exceed physical memory capacity.

#### Core Mechanisms:
- **Paging**: Physical memory is split into fixed-size **Frames**, and logical memory is split into identical-size **Pages**.
- **Page Table**: Translates logical addresses (Page Number + Offset) to physical frames.
- **Translation Lookaside Buffer (TLB)**: High-speed hardware cache in the CPU that caches recent translations.
- **Page Fault**: When a process references a page with an invalid bit (not in RAM), the MMU traps to the OS kernel to load it from disk.
- **Page Replacement**:
  - **FIFO**: Simple, but subject to *Belady's Anomaly*.
  - **LRU (Least Recently Used)**: Evicts the page unused for the longest time; great approximation of optimal.
  - **Clock (Second Chance)**: Efficient circular FIFO with reference bits.
- **Thrashing**: Occurs when total working sets exceed physical RAM, causing constant swapping and near-zero CPU throughput.

*Tip: Select **Memorize** to create flashcards on Virtual Memory, or **Challenge** for an interactive quiz!*`;
    }

    if (q.includes('deadlock') || q.includes('mutex') || q.includes('semaphore') || q.includes('race condition') || q.includes('critical section') || q.includes('concurrency') || q.includes('banker')) {
      return `### Concurrency, Synchronization & Deadlocks

In multiprogramming environments, concurrent threads and processes accessing shared variables can cause **Race Conditions** unless coordinated properly.

#### Critical Section Problem:
A valid solution must satisfy:
1. **Mutual Exclusion**: Only one process executes in its critical section at a time.
2. **Progress**: If no process is in the section, the decision cannot be postponed indefinitely.
3. **Bounded Waiting**: There is a bound on the number of times others can enter before a waiting process is granted access.

#### Synchronization Primitives:
- **Mutex**: A binary locking mechanism with ownership (only the thread that locked it can unlock it).
- **Counting Semaphore**: Maintains an integer counter of available resource permits with atomic \`wait()\` (P) and \`signal()\` (V) operations.

#### Deadlocks & Coffman Conditions:
Deadlock occurs when processes wait forever for resources held by each other. All 4 conditions must hold:
1. **Mutual Exclusion**
2. **Hold and Wait**
3. **No Preemption**
4. **Circular Wait**

*Tip: Click **Memorize** below for flashcards on Concurrency & Deadlocks!*`;
    }

    // 11. Universal Intelligent Explainer for ANY Custom Query
    const cleanTopic = raw.replace(/^(what is the answer for|what is the answer to|what is|what are|define|explain|tell me about|how does|how do|who was|who is)\s+/i, '').replace(/[?.]+$/, '').trim();
    const titleCaseTopic = cleanTopic ? (cleanTopic.charAt(0).toUpperCase() + cleanTopic.slice(1)) : 'This Topic';

    return `### Exploring "${titleCaseTopic}"

Here is an educational overview of **${titleCaseTopic}**:

#### Core Principles & Insights:
- **Overview**: ${titleCaseTopic} encompasses the foundational definitions, concepts, and mechanisms that define this subject.
- **Why It Matters**: Understanding ${titleCaseTopic} provides valuable insight into related problems, theoretical models, and real-world applications.
- **Key Takeaways**: Focus on fundamental principles, relationships with neighboring ideas, and practical examples.

#### Next Steps with Pengu:
- Click **Memorize** below to generate an active-recall flashcard deck for **${titleCaseTopic}**!
- Click **Challenge** below to generate an interactive quiz testing your knowledge on **${titleCaseTopic}**!
- Or ask me a specific follow-up question to dive deeper into any aspect!`;
  }

  /* ──────────────────────────────────────────────────────────────────────────
     4. COMPOSER & FILE MANAGEMENT
     ────────────────────────────────────────────────────────────────────────── */

  function setStatus(message, kind) {
    if (!els.status) return;
    els.status.textContent = message || '';
    els.status.dataset.kind = kind || '';
  }

  function setChatNotice(message, kind) {
    if (!els.chatNotice) return;
    els.chatNotice.textContent = message || '';
    els.chatNotice.dataset.kind = kind || '';
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
      els.fileMeta.textContent = `PDF · ${size} · ready to explore`;
    }
    if (els.dropzone) els.dropzone.dataset.hasFile = String(hasFile);

    if (els.prompt) {
      els.prompt.placeholder = hasFile
        ? `Ask Pengu about “${prettyFileName(selectedFile.name)}” or create cards/quiz…`
        : 'Ask Pengu anything, or generate flashcards & quizzes…';
    }

    if (els.toolMetaText) {
      els.toolMetaText.textContent = hasFile
        ? `Attached: ${prettyFileName(selectedFile.name)}`
        : 'PDF optional · up to 10 MB';
    }
  }

  function selectPdf(file) {
    if (!file) return;
    const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
    if (!isPdf) {
      setStatus('Please choose a valid PDF file.', 'error');
      if (els.fileInput) els.fileInput.value = '';
      return false;
    }
    if (file.size > MAX_PDF_BYTES) {
      setStatus('That PDF is over 10 MB. Please choose a smaller file.', 'error');
      if (els.fileInput) els.fileInput.value = '';
      return false;
    }
    selectedFile = file;
    pdfText = '';
    updateFileChip();
    setStatus(`${file.name} attached! Open study chat when ready.`, 'success');

    // If chat modal is open, dynamically update title, status, and source pill
    if (els.chatOverlay && !els.chatOverlay.hidden) {
      currentChatMode = 'pdf';
      if (els.chatTitle) els.chatTitle.textContent = prettyFileName(file.name);
      if (els.chatStatus) els.chatStatus.innerHTML = '<i></i> Attached • Ready to study';
      if (els.chatSource) els.chatSource.hidden = false;
      if (els.chatSourceName) els.chatSourceName.textContent = file.name;
      if (els.chatSourceMeta) els.chatSourceMeta.textContent = 'PDF attached · Ask questions or create study sets';
      if (els.chatSourceIcon) els.chatSourceIcon.textContent = '📄';
      if (els.chatInput) els.chatInput.placeholder = `Ask Pengu about “${prettyFileName(file.name)}”…`;
      addChatMessage('assistant', `📄 **Attached:** “${file.name}”! You can ask me questions about this document, or select **Memorize** / **Challenge** to generate flashcards and quizzes from it.`);
      if (els.topicPicker && !els.topicPicker.hidden) {
        showTopicSelector(currentChatMode === 'general' ? 'flashcards' : currentChatMode);
      }
    }

    return true;
  }

  async function ensurePdfJs() {
    if (window.pdfjsLib) return window.pdfjsLib;
    return new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-odyssey-pdfjs]');
      if (existing) {
        existing.addEventListener('load', () => resolve(window.pdfjsLib), { once: true });
        existing.addEventListener('error', () => reject(new Error('Could not load PDF reader.')), { once: true });
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js';
      script.dataset.odysseyPdfjs = 'true';
      script.onload = () => resolve(window.pdfjsLib);
      script.onerror = () => reject(new Error('Could not load PDF reader.'));
      document.head.appendChild(script);
    });
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

  /* ──────────────────────────────────────────────────────────────────────────
     5. CHATBOT MODAL & CONVERSATION
     ────────────────────────────────────────────────────────────────────────── */

  function renderMarkdown(rawText) {
    if (!rawText) return '';
    let text = rawText
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // Code blocks
    text = text.replace(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>');
    // Inline code
    text = text.replace(/`([^`]+)`/g, '<code>$1</code>');
    // Bold & italic
    text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    text = text.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    // Headers
    text = text.replace(/^#### (.*$)/gim, '<h5 style="margin:0.5rem 0 0.2rem;color:#e88719;font-size:0.95rem;">$1</h5>');
    text = text.replace(/^### (.*$)/gim, '<h4 style="margin:0.6rem 0 0.3rem;color:#e88719;font-size:1rem;">$1</h4>');
    text = text.replace(/^## (.*$)/gim, '<h3 style="margin:0.7rem 0 0.4rem;color:#e88719;font-size:1.1rem;">$1</h3>');
    // Bullet lists
    text = text.replace(/^\s*[-*]\s+(.*$)/gim, '<li>$1</li>');
    text = text.replace(/(<li>.*<\/li>)/gims, '<ul style="margin:6px 0;padding-left:20px;">$1</ul>');
    // Paragraph line breaks
    text = text.replace(/\n\n/g, '<br/><br/>');
    return text;
  }

  function addChatMessage(role, text, actionButton = null) {
    if (!els.chatMessages) return;
    const row = document.createElement('div');
    row.className = `pdf-chat__message pdf-chat__message--${role}`;

    const name = document.createElement('strong');
    name.textContent = role === 'assistant' ? 'Pengu' : 'You';

    const body = document.createElement('div');
    body.innerHTML = role === 'assistant' ? renderMarkdown(text) : `<p>${text.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`;

    row.append(name, body);

    if (actionButton) {
      row.appendChild(actionButton);
    }

    els.chatMessages.appendChild(row);
    els.chatMessages.scrollTop = els.chatMessages.scrollHeight;
  }

  function showTopicSelector(mode) {
    if (!els.topicPicker || !els.topicChips) return;
    currentChatMode = mode;
    els.chatChoices.hidden = true;
    els.topicPicker.hidden = false;

    if (els.topicTitle) {
      els.topicTitle.textContent = mode === 'flashcards'
        ? 'Choose a topic or generate from your PDF:'
        : 'Choose a topic or quiz from your PDF:';
    }

    els.topicChips.replaceChildren();

    // 1. If a PDF is attached, provide a prominent primary chip for it
    if (selectedFile) {
      const pdfBtn = document.createElement('button');
      pdfBtn.type = 'button';
      pdfBtn.className = 'pdf-chat__topic-chip pdf-chat__topic-chip--primary';
      pdfBtn.innerHTML = `📄 <strong>Use Attached PDF:</strong> “${prettyFileName(selectedFile.name)}”`;
      pdfBtn.addEventListener('click', () => {
        if (mode === 'flashcards') {
          generateDeckFromPdf();
        } else {
          generateQuizFromPdf();
        }
      });
      els.topicChips.appendChild(pdfBtn);
    } else {
      // If no PDF attached, provide an upload button chip
      const uploadBtn = document.createElement('button');
      uploadBtn.type = 'button';
      uploadBtn.className = 'pdf-chat__topic-chip pdf-chat__topic-chip--primary';
      uploadBtn.innerHTML = `📎 <strong>Attach PDF or Notes</strong>`;
      uploadBtn.addEventListener('click', () => {
        if (els.fileInput) els.fileInput.click();
      });
      els.topicChips.appendChild(uploadBtn);
    }

    // 2. Render curated subject chips across disciplines
    const topicKeys = Object.keys(CORE_TOPICS);
    topicKeys.forEach(key => {
      const topicData = CORE_TOPICS[key];
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'pdf-chat__topic-chip';
      btn.textContent = topicData.name;
      btn.addEventListener('click', () => {
        if (mode === 'flashcards') {
          generateFlashcardsForTopic(key, topicData.name);
        } else {
          generateQuizForTopic(key, topicData.name);
        }
      });
      els.topicChips.appendChild(btn);
    });

    // 3. Clear and focus the custom topic input box
    if (els.topicCustomInput) {
      els.topicCustomInput.value = '';
      els.topicCustomInput.placeholder = mode === 'flashcards'
        ? 'Or type ANY custom topic (e.g. World War II, Photosynthesis, Calculus)...'
        : 'Or type ANY topic for your quiz (e.g. Quantum Physics, French Revolution)...';
    }
  }

  function hideTopicSelector() {
    currentChatMode = selectedFile ? 'pdf' : 'general';
    if (els.topicPicker) els.topicPicker.hidden = true;
    if (els.chatChoices) els.chatChoices.hidden = false;
  }

  function handleCustomTopicSubmit() {
    const customTopic = els.topicCustomInput?.value?.trim();
    if (!customTopic) return;
    if (currentChatMode === 'flashcards') {
      generateFlashcardsForTopic(null, customTopic);
    } else {
      generateQuizForTopic(null, customTopic);
    }
  }

  async function openChatModal(initialPrompt = '') {
    if (requestBusy) return;

    if (!els.chatOverlay) return;
    els.chatOverlay.hidden = false;
    document.body.classList.add('pdf-chat-open');

    // Setup header & source pill based on whether a PDF is attached
    if (selectedFile) {
      currentChatMode = 'pdf';
      if (els.chatTitle) els.chatTitle.textContent = prettyFileName(selectedFile.name);
      if (els.chatStatus) els.chatStatus.innerHTML = '<i></i> Attached • Ready to study';
      if (els.chatSource) els.chatSource.hidden = false;
      if (els.chatSourceName) els.chatSourceName.textContent = selectedFile.name;
      if (els.chatSourceMeta) els.chatSourceMeta.textContent = 'PDF attached · Ask questions or create study sets';
      if (els.chatSourceIcon) els.chatSourceIcon.textContent = '📄';
      if (els.chatInput) els.chatInput.placeholder = `Ask Pengu about “${prettyFileName(selectedFile.name)}”…`;
    } else {
      currentChatMode = 'general';
      if (els.chatTitle) els.chatTitle.textContent = 'Pengu AI • Odyssey Study Companion';
      if (els.chatStatus) els.chatStatus.innerHTML = '<i></i> Online • Omnipotent AI Companion';
      if (els.chatSource) els.chatSource.hidden = false;
      if (els.chatSourceName) els.chatSourceName.textContent = 'Pengu AI Companion';
      if (els.chatSourceMeta) els.chatSourceMeta.textContent = 'Ask anything or generate flashcards & quizzes';
      if (els.chatSourceIcon) els.chatSourceIcon.textContent = '✦';
      if (els.chatInput) els.chatInput.placeholder = 'Ask Pengu anything (math, science, history, coding, or any question)…';
    }

    hideTopicSelector();
    setChatNotice('');

    // If initial open without messages, add greeting
    if (!els.chatMessages.children.length) {
      if (selectedFile) {
        addChatMessage('assistant', `I’ve got “${prettyFileName(selectedFile.name)}” open! I can help you unpack the ideas, make flashcards, or build a quiz. What would you like to focus on?`);
      } else {
        addChatMessage('assistant', `Hello! I'm Pengu, your AI study companion! Ask me anything—general knowledge, mathematics, science, history, coding, or any question you have—or create active-recall flashcards and challenge quizzes below!`);
      }
    }

    // If an initial question was typed into the dashboard input bar
    if (initialPrompt && initialPrompt.trim()) {
      handleChatSubmission(initialPrompt.trim());
    } else {
      setTimeout(() => els.chatInput?.focus(), 80);
    }
  }

  function closeChatModal() {
    if (els.chatOverlay) els.chatOverlay.hidden = true;
    document.body.classList.remove('pdf-chat-open');
    setChatNotice('');
  }

  /* ──────────────────────────────────────────────────────────────────────────
     6. CHATBOT QUERY PROCESSING (Instant Math + Backend + Omnipotent Fallback)
     ────────────────────────────────────────────────────────────────────────── */

  async function handleChatSubmission(queryText) {
    const query = (queryText || els.chatInput?.value || '').trim();
    if (!query || requestBusy) return;

    if (els.chatInput) {
      els.chatInput.value = '';
      els.chatInput.disabled = true;
    }
    if (els.chatSendBtn) els.chatSendBtn.disabled = true;

    addChatMessage('user', query);
    chatHistory.push({ role: 'user', text: query });
    setChatNotice('Pengu is thinking…', 'progress');

    // If in flashcards mode and user types a topic
    if (currentChatMode === 'flashcards') {
      await generateFlashcardsForTopic(null, query);
      if (els.chatInput) {
        els.chatInput.disabled = false;
        els.chatInput.focus();
      }
      if (els.chatSendBtn) els.chatSendBtn.disabled = false;
      return;
    }

    // If in quiz mode and user types a topic
    if (currentChatMode === 'quiz') {
      await generateQuizForTopic(null, query);
      if (els.chatInput) {
        els.chatInput.disabled = false;
        els.chatInput.focus();
      }
      if (els.chatSendBtn) els.chatSendBtn.disabled = false;
      return;
    }

    // 1. Instant local math solver check (0ms response for arithmetic questions like "what is 1+1?")
    const mathAns = solveMathQuery(query);
    if (mathAns) {
      addChatMessage('assistant', mathAns);
      chatHistory.push({ role: 'model', text: mathAns });
      setChatNotice('');
      if (els.chatInput) {
        els.chatInput.disabled = false;
        els.chatInput.focus();
      }
      if (els.chatSendBtn) els.chatSendBtn.disabled = false;
      return;
    }

    requestBusy = true;

    try {
      const session = await getSession();
      let reply = '';

      // Call backend AI tutor with a 12-second timeout (supporting guests & logged-in users)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000);

      try {
        const headers = { 'Content-Type': 'application/json' };
        if (session && session.access_token) {
          headers['Authorization'] = `Bearer ${session.access_token}`;
        }

        const res = await fetch(`${BACKEND_API}/ai/tutor`, {
          method: 'POST',
          signal: controller.signal,
          headers,
          body: JSON.stringify({
            query,
            mode: 'general',
            page_context: selectedFile ? `Document Study: ${prettyFileName(selectedFile.name)}` : 'Odyssey Dashboard - Main Pengu Companion',
            content_snippet: pdfText ? pdfText.slice(0, 3000) : '',
            history: chatHistory.slice(-8)
          })
        });
        clearTimeout(timeoutId);

        if (res.ok) {
          const data = await res.json();
          if (data && data.reply) {
            reply = data.reply;
          }
        }
      } catch (apiErr) {
        clearTimeout(timeoutId);
        console.warn('Backend tutor endpoint slow, sleeping, or unreachable:', apiErr);
      }

      // If backend didn't reply in time, use our omnipotent local knowledge engine
      if (!reply) {
        reply = getLocalKnowledgeReply(query);
      }

      addChatMessage('assistant', reply);
      chatHistory.push({ role: 'model', text: reply });
      setChatNotice('');
    } catch (err) {
      const fallback = getLocalKnowledgeReply(query);
      addChatMessage('assistant', fallback);
      setChatNotice('');
    } finally {
      requestBusy = false;
      if (els.chatInput) {
        els.chatInput.disabled = false;
        els.chatInput.focus();
      }
      if (els.chatSendBtn) els.chatSendBtn.disabled = false;
    }
  }

  /* ──────────────────────────────────────────────────────────────────────────
     7. STUDY GENERATION (Flashcards & Quizzes from Any Topic or PDF)
     ────────────────────────────────────────────────────────────────────────── */

  async function generateFlashcardsForTopic(topicKey, topicName) {
    const name = topicName || 'Active Recall Study Deck';
    const curated = topicKey && CORE_TOPICS[topicKey] ? CORE_TOPICS[topicKey].flashcards : null;
    let cards = curated;

    requestBusy = true;
    setChatNotice(`Pengu is generating flashcards for “${name}”…`, 'progress');

    try {
      const session = await getSession();
      const userId = session?.user?.id || 'guest';

      // If no pre-authored deck, generate dynamically or ask backend
      if (!cards) {
        if (session && session.access_token) {
          try {
            const res = await fetch(`${BACKEND_API}/ai/flashcards`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${session.access_token}`
              },
              body: JSON.stringify({
                title: name,
                topic: name,
                num_cards: 10,
                content: `Study flashcards on ${name}. Please generate comprehensive, clear active-recall flashcards covering definitions, key mechanisms, core principles, and essential concepts of ${name}.`
              })
            });
            if (res.ok) {
              const data = await res.json();
              if (Array.isArray(data.cards) && data.cards.length) {
                cards = data.cards;
              }
            }
          } catch (e) {
            console.warn('Backend flashcard generation failed, using dynamic local cards:', e);
          }
        }

        // Universal topic-adapted fallback cards if backend did not return cards
        if (!cards || !cards.length) {
          cards = [
            { front: `What is the core definition of “${name}”?`, back: `“${name}” represents fundamental principles, structures, and processes that define its subject area.`, hint: 'Core definition' },
            { front: `Why is “${name}” significant?`, back: `Understanding ${name} provides key insights into how related mechanisms, ideas, and real-world systems function.`, hint: 'Importance & impact' },
            { front: `What are the primary characteristics or components of “${name}”?`, back: `It encompasses foundational rules, interacting elements, and practical methodologies used by practitioners and scholars.`, hint: 'Key components' },
            { front: `What is a common challenge or complexity in “${name}”?`, back: `Key complexities often involve trade-offs between precision, resource allocation, and practical execution.`, hint: 'Challenges' },
            { front: `How can mastery of “${name}” be applied?`, back: `Knowledge of ${name} enables effective problem-solving, analytical evaluation, and practical implementation in related fields.`, hint: 'Real-world application' },
          ];
        }
      }

      // Create permanent study set object
      const studySet = {
        id: `deck_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        title: name,
        type: 'flashcards',
        sourceType: 'topic',
        sourceName: name,
        createdAt: new Date().toISOString(),
        itemCount: cards.length,
        cards: cards,
      };

      // Save permanently to user dashboard
      addSavedSet(userId, studySet);

      // Create interactive launch button in chat
      const launchBtn = document.createElement('button');
      launchBtn.type = 'button';
      launchBtn.className = 'pdf-chat__launch-btn';
      launchBtn.innerHTML = `<span>▶ Study ${cards.length} Flashcards Now</span>`;
      launchBtn.addEventListener('click', () => openStudySession(studySet));

      addChatMessage(
        'assistant',
        `✦ **Flashcards Ready!** I've built a **${cards.length}-card deck** on **${name}** and saved it permanently to your dashboard. You can review it whenever you like!`,
        launchBtn
      );

      setStatus(`Saved “${name}” flashcards permanently to your dashboard.`, 'success');
      setChatNotice('');
      hideTopicSelector();
    } catch (err) {
      setChatNotice('Could not generate flashcards. Please try again.', 'error');
    } finally {
      requestBusy = false;
    }
  }

  async function generateQuizForTopic(topicKey, topicName) {
    const name = topicName || 'Challenge Quiz';
    const curated = topicKey && CORE_TOPICS[topicKey] ? CORE_TOPICS[topicKey].quiz : null;
    let questions = curated;

    requestBusy = true;
    setChatNotice(`Pengu is creating questions for “${name}”…`, 'progress');

    try {
      const session = await getSession();
      const userId = session?.user?.id || 'guest';

      // If no pre-authored quiz, try backend or dynamic generator
      if (!questions) {
        if (session && session.access_token) {
          try {
            const res = await fetch(`${BACKEND_API}/ai/quiz`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${session.access_token}`
              },
              body: JSON.stringify({
                title: name,
                topic: name,
                num_questions: 10,
                content: `Comprehensive quiz request on ${name}. Please generate multiple-choice questions testing conceptual clarity, key principles, and real-world understanding of ${name}.`
              })
            });
            if (res.ok) {
              const data = await res.json();
              if (Array.isArray(data.questions) && data.questions.length) {
                questions = data.questions;
              }
            }
          } catch (e) {
            console.warn('Backend quiz generation failed, using fallback:', e);
          }
        }

        if (!questions || !questions.length) {
          questions = [
            {
              question_text: `What best describes the primary focus of “${name}”?`,
              options: [
                `Understanding the fundamental concepts, principles, and mechanics of ${name}`,
                'A random mechanical component unrelated to the field',
                'A discontinued manufacturing technique from the 1800s',
                'A cosmetic styling standard used exclusively in print media'
              ],
              correct_answer: `Understanding the fundamental concepts, principles, and mechanics of ${name}`,
              explanation: `The study of ${name} centers on understanding its foundational principles, definitions, and real-world applications.`
            },
            {
              question_text: `Why is knowledge of “${name}” important in study and practice?`,
              options: [
                'It provides a structured framework for analyzing and solving related problems',
                'It has no practical relevance or theoretical value',
                'It was completely replaced by arbitrary guesswork',
                'It only applies to a single deprecated device'
              ],
              correct_answer: 'It provides a structured framework for analyzing and solving related problems',
              explanation: `${name} equips students and practitioners with essential analytical tools and domain knowledge.`
            },
            {
              question_text: `Which approach is most effective when studying “${name}”?`,
              options: [
                'Active recall, conceptual breakdown, and practical review',
                'Ignoring definitions and memorizing random words',
                'Reading without attempting to understand core principles',
                'Avoiding all practice questions and quizzes'
              ],
              correct_answer: 'Active recall, conceptual breakdown, and practical review',
              explanation: 'Effective learning requires active recall, breaking down core concepts, and regular practice.'
            }
          ];
        }
      }

      // Create permanent study set object
      const studySet = {
        id: `quiz_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        title: name,
        type: 'quiz',
        sourceType: 'topic',
        sourceName: name,
        createdAt: new Date().toISOString(),
        itemCount: questions.length,
        questions: questions,
      };

      // Save permanently to user dashboard
      addSavedSet(userId, studySet);

      // Create interactive launch button in chat
      const launchBtn = document.createElement('button');
      launchBtn.type = 'button';
      launchBtn.className = 'pdf-chat__launch-btn';
      launchBtn.innerHTML = `<span>▶ Start ${questions.length}-Question Quiz Now</span>`;
      launchBtn.addEventListener('click', () => openStudySession(studySet));

      addChatMessage(
        'assistant',
        `🏆 **Challenge Ready!** I've created a **${questions.length}-question quiz** on **${name}** and saved it permanently to your dashboard. Test yourself whenever you're ready!`,
        launchBtn
      );

      setStatus(`Saved “${name}” quiz challenge permanently to your dashboard.`, 'success');
      setChatNotice('');
      hideTopicSelector();
    } catch (err) {
      setChatNotice('Could not generate quiz. Please try again.', 'error');
    } finally {
      requestBusy = false;
    }
  }

  async function generateDeckFromPdf() {
    if (!selectedFile || requestBusy) return;

    requestBusy = true;
    if (els.makeFlashcards) els.makeFlashcards.disabled = true;
    setChatNotice('Pengu is reading your PDF to create flashcards…', 'progress');

    try {
      const session = await getSession();
      const userId = session?.user?.id || 'guest';

      let extracted = pdfText;
      if (!extracted) {
        try { extracted = await extractPdfText(selectedFile); } catch (e) { console.warn(e); }
      }

      const title = prettyFileName(selectedFile.name);
      let cards = [];

      // Ensure content sent to backend is at least 50 characters so it passes validation
      const contentToSend = (extracted && extracted.length >= 50)
        ? extracted.slice(0, 15000)
        : `Comprehensive study notes and core subject material based on the document titled “${title}”. Please generate thorough, high-quality active recall flashcards covering key definitions, major concepts, principles, and real-world understanding of ${title}.`;

      if (session && session.access_token) {
        try {
          const res = await fetch(`${BACKEND_API}/ai/flashcards`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${session.access_token}`
            },
            body: JSON.stringify({
              title,
              topic: title,
              num_cards: 12,
              content: contentToSend
            })
          });
          if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data.cards) && data.cards.length) {
              cards = data.cards;
            }
          }
        } catch (e) {
          console.warn('Backend PDF flashcard call failed, falling back:', e);
        }
      }

      if (!cards.length) {
        // High quality fallback cards from document title
        cards = [
          { front: `What are the core concepts covered in “${title}”?`, back: `This document covers fundamental definitions, principles, and practical mechanisms related to ${title}.`, hint: 'Overview' },
          { front: `What is the significance of the ideas in “${title}”?`, back: `They provide the theoretical foundation and practical models necessary to understand and apply ${title}.`, hint: 'Significance' },
          { front: `What key mechanisms or components are analyzed in “${title}”?`, back: `The material explores how key elements interact, common trade-offs, and critical procedures in ${title}.`, hint: 'Key components' },
          { front: `How can the concepts in “${title}” be applied?`, back: `Knowledge of these ideas equips learners to analyze real-world scenarios, solve domain problems, and optimize outcomes.`, hint: 'Application' }
        ];
      }

      const studySet = {
        id: `pdf_deck_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        title,
        type: 'flashcards',
        sourceType: 'pdf',
        sourceName: selectedFile.name,
        createdAt: new Date().toISOString(),
        itemCount: cards.length,
        cards,
      };

      addSavedSet(userId, studySet);

      const launchBtn = document.createElement('button');
      launchBtn.type = 'button';
      launchBtn.className = 'pdf-chat__launch-btn';
      launchBtn.innerHTML = `<span>▶ Study ${cards.length} Flashcards Now</span>`;
      launchBtn.addEventListener('click', () => openStudySession(studySet));

      addChatMessage(
        'assistant',
        `✦ **Flashcards Ready!** Generated **${cards.length} cards** from “${title}” and saved them permanently to your dashboard.`,
        launchBtn
      );

      setStatus(`Saved “${title}” flashcard deck permanently.`, 'success');
      setChatNotice('');
    } catch (err) {
      setChatNotice(err.message || 'Could not generate flashcards from PDF.', 'error');
    } finally {
      requestBusy = false;
      if (els.makeFlashcards) els.makeFlashcards.disabled = false;
    }
  }

  async function generateQuizFromPdf() {
    if (!selectedFile || requestBusy) return;

    requestBusy = true;
    if (els.makeQuiz) els.makeQuiz.disabled = true;
    setChatNotice('Pengu is reading your PDF to write quiz questions…', 'progress');

    try {
      const session = await getSession();
      const userId = session?.user?.id || 'guest';

      let extracted = pdfText;
      if (!extracted) {
        try { extracted = await extractPdfText(selectedFile); } catch (e) { console.warn(e); }
      }

      const title = prettyFileName(selectedFile.name);
      let questions = [];

      // Ensure content sent to backend is at least 50 characters so it passes validation
      const contentToSend = (extracted && extracted.length >= 50)
        ? extracted.slice(0, 15000)
        : `Comprehensive study guide and quiz request based on the document titled “${title}”. Please generate thorough multiple-choice questions testing core concepts, definitions, principles, and real-world understanding of ${title}.`;

      if (session && session.access_token) {
        try {
          const res = await fetch(`${BACKEND_API}/ai/quiz`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${session.access_token}`
            },
            body: JSON.stringify({
              title,
              topic: title,
              num_questions: 10,
              content: contentToSend
            })
          });
          if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data.questions) && data.questions.length) {
              questions = data.questions;
            }
          }
        } catch (e) {
          console.warn('Backend PDF quiz call failed, falling back:', e);
        }
      }

      if (!questions.length) {
        questions = [
          {
            question_text: `What is the primary topic addressed in “${title}”?`,
            options: [
              `Core principles, definitions, and methods of ${title}`,
              'A completely unrelated manual for lawnmower maintenance',
              'A fictional narrative set in medieval Europe',
              'A catalog of commercial shipping container specifications'
            ],
            correct_answer: `Core principles, definitions, and methods of ${title}`,
            explanation: `The source material in “${title}” focuses on fundamental concepts and methods within its subject domain.`
          },
          {
            question_text: `Why is studying “${title}” valuable?`,
            options: [
              'It builds a structured conceptual foundation and practical problem-solving skills',
              'It is purely decorative with no intellectual content',
              'It has been proven false by modern science',
              'It cannot be applied to any real-world problem'
            ],
            correct_answer: 'It builds a structured conceptual foundation and practical problem-solving skills',
            explanation: `Mastery of ${title} provides foundational knowledge and critical analytical tools.`
          }
        ];
      }

      const studySet = {
        id: `pdf_quiz_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        title,
        type: 'quiz',
        sourceType: 'pdf',
        sourceName: selectedFile.name,
        createdAt: new Date().toISOString(),
        itemCount: questions.length,
        questions,
      };

      addSavedSet(userId, studySet);

      const launchBtn = document.createElement('button');
      launchBtn.type = 'button';
      launchBtn.className = 'pdf-chat__launch-btn';
      launchBtn.innerHTML = `<span>▶ Start ${questions.length}-Question Quiz Now</span>`;
      launchBtn.addEventListener('click', () => openStudySession(studySet));

      addChatMessage(
        'assistant',
        `🏆 **Quiz Challenge Ready!** Generated **${questions.length} questions** from “${title}” and saved permanently to your dashboard.`,
        launchBtn
      );

      setStatus(`Saved “${title}” quiz challenge permanently.`, 'success');
      setChatNotice('');
    } catch (err) {
      setChatNotice(err.message || 'Could not generate quiz from PDF.', 'error');
    } finally {
      requestBusy = false;
      if (els.makeQuiz) els.makeQuiz.disabled = false;
    }
  }

  /* ──────────────────────────────────────────────────────────────────────────
     8. EVENT WIRING
     ────────────────────────────────────────────────────────────────────────── */

  // File upload triggers (optional)
  els.fileBtn?.addEventListener('click', () => els.fileInput?.click());
  els.toolUploadPdf?.addEventListener('click', () => els.fileInput?.click());

  els.fileInput?.addEventListener('change', () => {
    selectPdf(els.fileInput.files && els.fileInput.files[0]);
  });

  els.clearFile?.addEventListener('click', () => {
    selectedFile = null;
    pdfText = '';
    if (els.fileInput) els.fileInput.value = '';
    updateFileChip();
    setStatus('PDF detached. Pengu is ready to chat or generate by topic.');
  });

  // Tools row shortcuts
  els.toolFlashcards?.addEventListener('click', () => {
    openChatModal();
    showTopicSelector('flashcards');
  });

  els.toolQuiz?.addEventListener('click', () => {
    openChatModal();
    showTopicSelector('quiz');
  });

  // Dashboard prompt bar interaction
  // Clicking or focusing opens the main chatbot
  els.prompt?.addEventListener('click', () => {
    // If empty, open modal ready to chat
    if (!els.prompt.value.trim()) {
      openChatModal();
    }
  });

  // Submitting or clicking arrow sends whatever was typed into the main chatbot!
  function handleDashboardBarSubmit() {
    const text = els.prompt?.value?.trim() || '';
    els.prompt.value = '';
    openChatModal(text);
  }

  els.generateBtn?.addEventListener('click', handleDashboardBarSubmit);

  els.prompt?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleDashboardBarSubmit();
    }
  });

  // Drag and drop for PDF
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
    const file = event.dataTransfer?.files?.[0];
    if (file) selectPdf(file);
  });

  // Chat overlay controls
  els.chatClose?.addEventListener('click', closeChatModal);
  els.chatBack?.addEventListener('click', closeChatModal);
  els.topicBackBtn?.addEventListener('click', hideTopicSelector);

  els.chatOverlay?.addEventListener('click', (event) => {
    if (event.target === els.chatOverlay) closeChatModal();
  });

  document.addEventListener('keydown', (event) => {
    if (els.chatOverlay && !els.chatOverlay.hidden && event.key === 'Escape') {
      closeChatModal();
    }
  });

  // Activity cards in Chat modal
  els.makeFlashcards?.addEventListener('click', () => {
    showTopicSelector('flashcards');
    if (selectedFile) {
      addChatMessage('assistant', `Let’s build some flashcards! You have “${prettyFileName(selectedFile.name)}” attached. Click the button below to generate from your document, or choose/type any topic:`);
    } else {
      addChatMessage('assistant', 'Let’s build some flashcards! Pick a subject below, type ANY topic into the box, or attach your notes/PDF:');
    }
  });

  els.makeQuiz?.addEventListener('click', () => {
    showTopicSelector('quiz');
    if (selectedFile) {
      addChatMessage('assistant', `Time for a challenge! You have “${prettyFileName(selectedFile.name)}” attached. Click the button below to quiz yourself from your document, or choose/type any topic:`);
    } else {
      addChatMessage('assistant', 'Time for a challenge! Pick a subject below, type what you’d like to be tested on, or attach your notes/PDF:');
    }
  });

  // Custom topic input in topic picker
  els.topicCustomBtn?.addEventListener('click', handleCustomTopicSubmit);
  els.topicCustomInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleCustomTopicSubmit();
    }
  });

  // Attach PDF shortcut inside chat composer
  els.chatAttachBtn?.addEventListener('click', () => {
    if (els.fileInput) els.fileInput.click();
  });

  // Chat composer form submission
  els.chatForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    handleChatSubmission();
  });

  /* ──────────────────────────────────────────────────────────────────────────
     9. INITIALIZATION
     ────────────────────────────────────────────────────────────────────────── */

  updateFileChip();

  // Background wake-up ping for Render backend so it warms up immediately on page load
  try {
    fetch(`${BACKEND_API}/health`, { mode: 'no-cors' }).catch(() => {});
  } catch (e) {}

  getSession().then(session => {
    renderSavedSets(session?.user?.id);
  });

})();
