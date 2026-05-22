/**
 * OS Odyssey — Onboarding Tour
 * Guided walkthrough for first-time users highlighting key features.
 * Self-contained IIFE — no external dependencies.
 */
(function () {
  'use strict';

  const TOUR_COMPLETED_KEY = 'os-odyssey-tour-completed';
  const TOUR_VERSION = 1; // Bump to re-trigger tour after major UI changes

  /* ================================================================
     TOUR STEPS — each step targets a dashboard element
     ================================================================ */
  const TOUR_STEPS = [
    {
      target: '.welcome-row',
      title: 'Your Penguin Mentor',
      text: 'Meet your personal guide! This friendly penguin greets you each session with helpful tips and keeps you motivated on your OS learning journey.',
      position: 'bottom'
    },
    {
      target: '.course-hero',
      title: 'Continue Learning',
      text: 'Jump right back into your course! This card shows your current progress and lets you pick up exactly where you left off.',
      position: 'bottom'
    },
    {
      target: '.profile-card',
      title: 'Your Profile Stats',
      text: 'Track your XP, rank, badges, and daily streak here. Level up by completing modules and simulations to climb the ranks!',
      position: 'left'
    },
    {
      target: '.explore-section#practice',
      title: 'Interactive Simulations',
      text: 'Practice OS concepts hands-on! Boot sequences, system calls, CPU scheduling, memory management — each simulator brings theory to life.',
      position: 'top'
    },
    {
      target: '#systemLabCard',
      title: 'System Lab — Unlock It!',
      text: 'Complete all course modules to unlock advanced kernel-mode simulations: filesystems, deadlock recovery, disk scheduling, and more.',
      position: 'left'
    },
    {
      target: '.sim-progress-card',
      title: 'Simulation Tracking',
      text: 'Monitor which simulations you\'ve cleared and earn bonus XP. Try to complete all 10 labs for maximum rewards!',
      position: 'left'
    },
    {
      target: '.app-nav-links',
      title: 'Navigation',
      text: 'Use the navigation bar to access courses, practice simulations, view the leaderboard, or customize your avatar. Everything is one click away!',
      position: 'bottom'
    },
    {
      target: '#dashThemeToggle',
      title: 'Dark & Light Mode',
      text: 'Toggle between dark and light themes to match your preference. Your choice is saved automatically!',
      position: 'bottom'
    }
  ];

  /* ================================================================
     DOM HELPERS
     ================================================================ */
  function createElement(tag, className, innerHTML) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (innerHTML) el.innerHTML = innerHTML;
    return el;
  }

  function getTargetRect(selector) {
    const el = document.querySelector(selector);
    if (!el) return null;
    return { el, rect: el.getBoundingClientRect() };
  }

  /* ================================================================
     TOUR ENGINE
     ================================================================ */
  class OnboardingTour {
    constructor() {
      this.currentStep = 0;
      this.isActive = false;
      this.elements = {};
      this.previousTarget = null;
    }

    /* ---- Check if tour should auto-start ---- */
    shouldAutoStart() {
      const stored = localStorage.getItem(TOUR_COMPLETED_KEY);
      if (!stored) return true;
      try {
        const parsed = JSON.parse(stored);
        return parsed.version < TOUR_VERSION;
      } catch {
        return true;
      }
    }

    /* ---- Mark tour as completed ---- */
    markCompleted() {
      localStorage.setItem(TOUR_COMPLETED_KEY, JSON.stringify({
        version: TOUR_VERSION,
        completedAt: new Date().toISOString()
      }));
    }

    /* ---- Show welcome modal ---- */
    showWelcome() {
      const overlay = createElement('div', 'tour-welcome-overlay');
      overlay.id = 'tourWelcome';
      overlay.innerHTML = `
        <div class="tour-welcome-card">
          <div class="tour-welcome-mascot">
            <img src="../../assets/penguin-flower-removebg-preview.png" alt="OS Odyssey mascot" />
          </div>
          <div class="tour-welcome-badge">QUICK TOUR</div>
          <h2 class="tour-welcome-title">Welcome to<br>OS Odyssey!</h2>
          <p class="tour-welcome-text">
            Let us show you around! This quick tour will highlight the key features
            to help you get the most out of your learning experience.
          </p>
          <div class="tour-welcome-actions">
            <button class="tour-welcome-start" id="tourStartBtn">
              Let's Go!
            </button>
            <button class="tour-welcome-dismiss" id="tourDismissBtn">
              Skip tour, I'll explore on my own
            </button>
          </div>
        </div>
      `;

      document.body.appendChild(overlay);

      document.getElementById('tourStartBtn').addEventListener('click', () => {
        overlay.style.opacity = '0';
        overlay.style.transition = 'opacity 0.3s ease';
        setTimeout(() => {
          overlay.remove();
          this.start();
        }, 300);
      });

      document.getElementById('tourDismissBtn').addEventListener('click', () => {
        overlay.style.opacity = '0';
        overlay.style.transition = 'opacity 0.3s ease';
        setTimeout(() => {
          overlay.remove();
          this.markCompleted();
          this.addReplayButton();
        }, 300);
      });
    }

    /* ---- Build tour DOM elements ---- */
    buildElements() {
      // Overlay container
      this.elements.overlay = createElement('div', 'tour-overlay');
      this.elements.overlay.id = 'tourOverlay';

      // Dim background
      this.elements.bg = createElement('div', 'tour-overlay-bg');

      // Spotlight
      this.elements.spotlight = createElement('div', 'tour-spotlight');
      this.elements.spotlight.id = 'tourSpotlight';

      // Tooltip
      this.elements.tooltip = createElement('div', 'tour-tooltip');
      this.elements.tooltip.id = 'tourTooltip';

      this.elements.overlay.appendChild(this.elements.bg);
      document.body.appendChild(this.elements.overlay);
      document.body.appendChild(this.elements.spotlight);
      document.body.appendChild(this.elements.tooltip);

      // Click on dim bg = skip
      this.elements.bg.addEventListener('click', (e) => {
        if (e.target === this.elements.bg) {
          this.end();
        }
      });

      // Keyboard navigation
      this._keyHandler = (e) => {
        if (!this.isActive) return;
        if (e.key === 'Escape') this.end();
        if (e.key === 'ArrowRight' || e.key === 'Enter') this.next();
        if (e.key === 'ArrowLeft') this.prev();
      };
      document.addEventListener('keydown', this._keyHandler);
    }

    /* ---- Start the tour ---- */
    start() {
      this.currentStep = 0;
      this.isActive = true;
      this.buildElements();
      this.elements.overlay.classList.add('active');

      // Small delay for CSS transition
      requestAnimationFrame(() => {
        this.showStep(0);
      });
    }

    /* ---- Show a specific step ---- */
    showStep(index) {
      if (index < 0 || index >= TOUR_STEPS.length) return;

      // Remove highlight from previous target
      if (this.previousTarget) {
        this.previousTarget.classList.remove('tour-target-highlight');
      }

      this.currentStep = index;
      const step = TOUR_STEPS[index];
      const targetInfo = getTargetRect(step.target);

      if (!targetInfo) {
        // Target not found — skip to next
        if (index < TOUR_STEPS.length - 1) {
          this.showStep(index + 1);
        } else {
          this.end();
        }
        return;
      }

      const { el: targetEl, rect: targetRect } = targetInfo;

      // Scroll target into view if needed
      const viewportH = window.innerHeight;
      const isVisible = targetRect.top >= 0 && targetRect.bottom <= viewportH;
      if (!isVisible) {
        targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // Wait for scroll to finish
        setTimeout(() => this._positionElements(step, targetEl), 450);
      } else {
        this._positionElements(step, targetEl);
      }
    }

    /* ---- Position spotlight and tooltip ---- */
    _positionElements(step, targetEl) {
      const rect = targetEl.getBoundingClientRect();
      const padding = 10;

      // Highlight the target element
      targetEl.classList.add('tour-target-highlight');
      this.previousTarget = targetEl;

      // Position spotlight
      const spotlight = this.elements.spotlight;
      spotlight.style.top = (rect.top - padding) + 'px';
      spotlight.style.left = (rect.left - padding) + 'px';
      spotlight.style.width = (rect.width + padding * 2) + 'px';
      spotlight.style.height = (rect.height + padding * 2) + 'px';

      // Build tooltip content
      const isFirst = this.currentStep === 0;
      const isLast = this.currentStep === TOUR_STEPS.length - 1;

      const dotsHTML = TOUR_STEPS.map((_, i) => {
        let cls = 'tour-dot';
        if (i < this.currentStep) cls += ' completed';
        if (i === this.currentStep) cls += ' active';
        return `<span class="${cls}"></span>`;
      }).join('');

      this.elements.tooltip.setAttribute('data-position', step.position);
      this.elements.tooltip.innerHTML = `
        <div class="tour-tooltip-arrow"></div>
        <div class="tour-tooltip-header">
          <div class="tour-tooltip-step-num">${this.currentStep + 1} / ${TOUR_STEPS.length}</div>
          <h3 class="tour-tooltip-title">${step.title}</h3>
        </div>
        <div class="tour-tooltip-body">
          <p class="tour-tooltip-text">${step.text}</p>
        </div>
        <div class="tour-tooltip-footer">
          <div class="tour-progress">${dotsHTML}</div>
          <div class="tour-btn-group">
            <button class="tour-btn tour-btn-skip" id="tourSkipBtn">Skip</button>
            ${!isFirst ? '<button class="tour-btn tour-btn-prev" id="tourPrevBtn">← Back</button>' : ''}
            ${isLast
              ? '<button class="tour-btn tour-btn-finish" id="tourFinishBtn">Finish ✓</button>'
              : '<button class="tour-btn tour-btn-next" id="tourNextBtn">Next →</button>'}
          </div>
        </div>
      `;

      // Position tooltip relative to target
      this._positionTooltip(rect, step.position);

      // Show tooltip with animation
      this.elements.tooltip.classList.remove('visible');
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          this.elements.tooltip.classList.add('visible');
        });
      });

      // Bind button events
      const skipBtn = document.getElementById('tourSkipBtn');
      const prevBtn = document.getElementById('tourPrevBtn');
      const nextBtn = document.getElementById('tourNextBtn');
      const finishBtn = document.getElementById('tourFinishBtn');

      if (skipBtn) skipBtn.addEventListener('click', () => this.end());
      if (prevBtn) prevBtn.addEventListener('click', () => this.prev());
      if (nextBtn) nextBtn.addEventListener('click', () => this.next());
      if (finishBtn) finishBtn.addEventListener('click', () => this.complete());
    }

    /* ---- Tooltip positioning logic ---- */
    _positionTooltip(targetRect, position) {
      const tooltip = this.elements.tooltip;
      const gap = 18;

      // Temporarily make visible to measure
      tooltip.style.visibility = 'hidden';
      tooltip.style.display = 'block';
      const tooltipRect = tooltip.getBoundingClientRect();
      tooltip.style.visibility = '';

      let top, left;
      const viewportW = window.innerWidth;
      const viewportH = window.innerHeight;

      switch (position) {
        case 'bottom':
          top = targetRect.bottom + gap;
          left = targetRect.left + (targetRect.width / 2) - (tooltipRect.width / 2);
          // If tooltip goes below viewport, flip to top
          if (top + tooltipRect.height > viewportH - 20) {
            top = targetRect.top - tooltipRect.height - gap;
            tooltip.setAttribute('data-position', 'top');
          }
          break;
        case 'top':
          top = targetRect.top - tooltipRect.height - gap;
          left = targetRect.left + (targetRect.width / 2) - (tooltipRect.width / 2);
          // If tooltip goes above viewport, flip to bottom
          if (top < 20) {
            top = targetRect.bottom + gap;
            tooltip.setAttribute('data-position', 'bottom');
          }
          break;
        case 'left':
          top = targetRect.top + (targetRect.height / 2) - (tooltipRect.height / 2);
          left = targetRect.left - tooltipRect.width - gap;
          // If tooltip goes off left edge, flip to bottom
          if (left < 20) {
            top = targetRect.bottom + gap;
            left = targetRect.left + (targetRect.width / 2) - (tooltipRect.width / 2);
            tooltip.setAttribute('data-position', 'bottom');
          }
          break;
        case 'right':
          top = targetRect.top + (targetRect.height / 2) - (tooltipRect.height / 2);
          left = targetRect.right + gap;
          // If tooltip goes off right edge, flip to bottom
          if (left + tooltipRect.width > viewportW - 20) {
            top = targetRect.bottom + gap;
            left = targetRect.left + (targetRect.width / 2) - (tooltipRect.width / 2);
            tooltip.setAttribute('data-position', 'bottom');
          }
          break;
      }

      // Clamp to viewport
      left = Math.max(12, Math.min(left, viewportW - tooltipRect.width - 12));
      top = Math.max(12, Math.min(top, viewportH - tooltipRect.height - 12));

      tooltip.style.top = top + 'px';
      tooltip.style.left = left + 'px';

      // Position arrow
      const arrow = tooltip.querySelector('.tour-tooltip-arrow');
      if (arrow) {
        const tooltipPos = tooltip.getAttribute('data-position');
        const targetCenterX = targetRect.left + targetRect.width / 2;
        const tooltipLeft = left;

        if (tooltipPos === 'bottom' || tooltipPos === 'top') {
          const arrowLeft = Math.max(20, Math.min(targetCenterX - tooltipLeft, tooltipRect.width - 20));
          arrow.style.left = arrowLeft + 'px';
          arrow.style.marginLeft = '-8px';
        }
      }
    }

    /* ---- Navigation ---- */
    next() {
      if (this.currentStep < TOUR_STEPS.length - 1) {
        this.elements.tooltip.classList.remove('visible');
        setTimeout(() => this.showStep(this.currentStep + 1), 200);
      }
    }

    prev() {
      if (this.currentStep > 0) {
        this.elements.tooltip.classList.remove('visible');
        setTimeout(() => this.showStep(this.currentStep - 1), 200);
      }
    }

    /* ---- End tour (skip) ---- */
    end() {
      this.isActive = false;
      this.markCompleted();
      this._cleanup();
      this.addReplayButton();
    }

    /* ---- Complete tour with celebration ---- */
    complete() {
      this.isActive = false;
      this.markCompleted();
      this._cleanup();
      this._showCompletion();
    }

    /* ---- Cleanup DOM ---- */
    _cleanup() {
      if (this.previousTarget) {
        this.previousTarget.classList.remove('tour-target-highlight');
      }

      // Fade out
      if (this.elements.overlay) {
        this.elements.overlay.classList.remove('active');
      }
      if (this.elements.tooltip) {
        this.elements.tooltip.classList.remove('visible');
      }

      setTimeout(() => {
        if (this.elements.overlay) this.elements.overlay.remove();
        if (this.elements.spotlight) this.elements.spotlight.remove();
        if (this.elements.tooltip) this.elements.tooltip.remove();
        this.elements = {};
      }, 400);

      if (this._keyHandler) {
        document.removeEventListener('keydown', this._keyHandler);
      }
    }

    /* ---- Show completion celebration ---- */
    _showCompletion() {
      const overlay = createElement('div', 'tour-complete-overlay');
      overlay.innerHTML = `
        <div class="tour-complete-card">
          <div class="tour-complete-title-label">WELL DONE</div>
          <h2 class="tour-complete-title">Tour Complete!</h2>
          <p class="tour-complete-text">
            You're all set! Start exploring OS Odyssey — complete modules, run simulations,
            earn badges, and climb the leaderboard. Happy learning!
          </p>
          <button class="tour-complete-close" id="tourCompleteClose">
            Start Learning!
          </button>
        </div>
      `;

      document.body.appendChild(overlay);

      document.getElementById('tourCompleteClose').addEventListener('click', () => {
        overlay.style.opacity = '0';
        overlay.style.transition = 'opacity 0.3s ease';
        setTimeout(() => {
          overlay.remove();
          this.addReplayButton();
        }, 300);
      });

      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          overlay.style.opacity = '0';
          overlay.style.transition = 'opacity 0.3s ease';
          setTimeout(() => {
            overlay.remove();
            this.addReplayButton();
          }, 300);
        }
      });
    }

    /* ---- Add replay button ---- */
    addReplayButton() {
      // Don't add if already exists
      if (document.getElementById('tourReplayBtn')) return;

      const btn = createElement('button', 'tour-replay-btn');
      btn.id = 'tourReplayBtn';
      btn.innerHTML = '<span class="replay-icon">↻</span> Replay Tour';
      btn.setAttribute('aria-label', 'Replay onboarding tour');
      document.body.appendChild(btn);

      btn.addEventListener('click', () => {
        btn.remove();
        this.showWelcome();
      });
    }

    /* ---- Handle window resize — reposition elements ---- */
    _initResizeHandler() {
      let resizeTimer;
      window.addEventListener('resize', () => {
        if (!this.isActive) return;
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
          this.showStep(this.currentStep);
        }, 200);
      });
    }

    /* ---- Initialize ---- */
    init() {
      this._initResizeHandler();

      // Only run on dashboard page
      if (!document.body.classList.contains('dashboard-page')) {
        return;
      }

      // Wait for the page to fully render (profile data, etc.)
      const waitForReady = () => {
        // Check if the main dashboard elements exist
        const hasWelcome = document.querySelector('.welcome-row');
        const hasCourseHero = document.querySelector('.course-hero');

        if (hasWelcome && hasCourseHero) {
          if (this.shouldAutoStart()) {
            // Delay slightly so the page animations complete first
            setTimeout(() => this.showWelcome(), 1200);
          } else {
            this.addReplayButton();
          }
        } else {
          // Retry after a short delay
          setTimeout(waitForReady, 300);
        }
      };

      if (document.readyState === 'complete') {
        waitForReady();
      } else {
        window.addEventListener('load', waitForReady);
      }
    }
  }

  /* ================================================================
     BOOT
     ================================================================ */
  const tour = new OnboardingTour();
  tour.init();

})();
