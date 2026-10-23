(function () {
  'use strict';

  const body = document.body;
  if (!body || (!body.classList.contains('app-page') && !body.classList.contains('home-page') && !body.classList.contains('instructor-apply-page'))) return;

  const currentFile = window.location.pathname.split('/').pop().toLowerCase();
  const simNames = new Set([
    'boot-sim.html', 'deadlock-sim.html', 'disk-sim.html', 'filesystem-sim.html',
    'memory-sim.html', 'process-sim.html', 'scheduling-sim.html', 'syscall-sim.html',
    'thread-sim.html', 'virtual-memory-sim.html'
  ]);
  const isSimulation = simNames.has(currentFile);

  const home = { key: 'home', label: 'Home', icon: 'pixelatedhome.png', href: 'dashboard.html', files: ['dashboard.html'] };
  const learn = { key: 'learn', label: 'My Learning', icon: 'pixelatedlearning.png', href: 'course.html', files: ['course.html'] };
  const explore = { key: 'explore', label: 'Explore Lessons', icon: 'pixelatedlessons.png', href: 'explore-lessons.html', files: ['explore-lessons.html'] };
  const classes = { key: 'classes', label: 'Classes', icon: 'pixelatedclasses1.png', href: 'classroom.html', files: ['classroom.html'] };
  const profile = { key: 'profile', label: 'Profile', href: 'profile.html', files: ['profile.html', 'leaderboard.html', 'character-select.html'] };
  const management = { key: 'management', label: 'Management', href: 'admin.html', files: ['admin.html'] };

  function tabsForRole(role) {
    if (role === 'admin') {
      return [home, learn, explore, management, profile];
    }
    if (role === 'professor' || role === 'instructor') {
      return [home, { ...classes, label: 'My Classes', href: 'professor.html', files: ['professor.html', 'classroom.html'] }, learn, explore, profile];
    }
    return [home, learn, explore, classes, profile];
  }

  function activeKey(tabs) {
    const matchingTab = tabs.find(tab => tab.files.includes(currentFile));
    if (matchingTab) return matchingTab.key;
    if (isSimulation) return 'learn';
    return '';
  }

  function placeThemeToggle() {
    const appNav = document.querySelector('.app-nav');
    const courseBrand = !appNav && body.classList.contains('course-page')
      ? document.querySelector('.course-shell-brand')
      : null;
    const navHost = appNav || courseBrand;
    if (!navHost) return;
    const links = appNav ? appNav.querySelector('.app-nav-links') : document.querySelector('.course-shell-nav');
    let toggle = document.getElementById('dashThemeToggle') || document.getElementById('mobileDashThemeToggle');
    if (toggle) toggle.textContent = 'Theme';

    if (window.innerWidth > 768 && toggle && toggle.id === 'mobileDashThemeToggle') {
      toggle.remove();
      return;
    }

    if (!toggle && window.innerWidth <= 768) {
      toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.id = 'mobileDashThemeToggle';
      toggle.className = 'app-theme-toggle mobile-theme-toggle';
      toggle.setAttribute('aria-label', 'Toggle dark/light mode');
      toggle.setAttribute('aria-hidden', 'true');
      toggle.tabIndex = -1;
      toggle.style.position = 'fixed';
      toggle.style.left = '-10000px';
      toggle.textContent = 'Theme';
      toggle.addEventListener('click', () => {
        body.classList.toggle('light-mode');
        localStorage.setItem('os-odyssey-dash-theme', body.classList.contains('light-mode') ? 'light' : 'dark');
      });
      body.appendChild(toggle);
      return;
    }

    if (!toggle) return;
    toggle.classList.add('mobile-theme-toggle');
    if (window.innerWidth <= 768) {
      // The mobile header keeps only the brand and More. Theme lives in that menu.
      return;
    } else if (links && toggle.parentElement !== links) {
      const logout = links.querySelector('[data-logout]');
      links.insertBefore(toggle, logout || null);
    }
  }

  function mountTabs(role) {
    const previous = document.querySelector('.mobile-bottom-nav');
    if (previous) previous.remove();

    body.dataset.mobileRole = role;
    if (isSimulation || role === 'guest') {
      body.classList.toggle('mobile-focused-sim', isSimulation);
      body.classList.add('mobile-nav-ready');
      return;
    }

    body.classList.remove('mobile-focused-sim');
    const tabs = tabsForRole(role);
    const active = activeKey(tabs);
    const nav = document.createElement('nav');
    nav.className = 'mobile-bottom-nav';
    nav.setAttribute('aria-label', 'Main navigation');
    nav.innerHTML = tabs.map(tab => {
      const isActive = tab.key === active;
      const icon = tab.icon
        ? `<img class="mobile-bottom-nav__icon" src="../../assets/${tab.icon}" alt="" aria-hidden="true">`
        : '';
      return `<a class="mobile-bottom-nav__item${isActive ? ' is-active' : ''}" href="${tab.href}"${isActive ? ' aria-current="page"' : ''}>${icon}<span class="mobile-bottom-nav__label">${tab.label}</span></a>`;
    }).join('');
    body.appendChild(nav);
    body.classList.add('mobile-nav-ready');
  }

  function mountMoreMenu(role) {
    const appNav = document.querySelector('.app-nav')
      || (body.classList.contains('home-page') ? document.querySelector('.navbar') : null)
      || (body.classList.contains('course-page') ? document.querySelector('.course-shell-brand') : null);
    if (!appNav || window.innerWidth > 768 || role === 'guest') return;
    appNav.querySelector('.mobile-more-toggle')?.remove();
    document.querySelector('.mobile-more-menu')?.remove();

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'mobile-more-toggle';
    toggle.setAttribute('aria-label', body.classList.contains('odyssey-home-page') ? 'Open navigation menu' : 'More account options');
    toggle.setAttribute('aria-expanded', 'false');
    if (body.classList.contains('odyssey-home-page')) {
      toggle.classList.add('mobile-home-menu-toggle');
      toggle.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" /></svg>';
    } else {
      toggle.textContent = 'More';
    }

    const menu = document.createElement('div');
    menu.className = 'mobile-more-menu';
    menu.hidden = true;
    const entries = [
      ['leaderboard.html', 'Leaderboard'],
      ['character-select.html', 'Change avatar']
    ];
    if (role === 'admin') entries.push(['admin.html', 'Management']);
    if (role === 'professor' || role === 'instructor') entries.push(['professor.html', 'My classes']);
    if (role === 'student') entries.push(['apply-instructor.html', 'Apply as instructor']);
    menu.innerHTML = entries.map(([href, label]) => `<a href="${href}">${label}</a>`).join('');
    const themeToggle = document.getElementById('dashThemeToggle') || document.getElementById('mobileDashThemeToggle');
    if (themeToggle) {
      const themeAction = document.createElement('button');
      themeAction.type = 'button';
      themeAction.className = 'mobile-more-menu__action';
      themeAction.textContent = 'Theme';
      themeAction.addEventListener('click', () => {
        themeToggle.click();
        menu.hidden = true;
        toggle.setAttribute('aria-expanded', 'false');
      });
      menu.appendChild(themeAction);
    }
    const originalLogout = document.querySelector('[data-logout]');
    if (originalLogout) {
      const logout = document.createElement('button');
      logout.type = 'button';
      logout.className = 'mobile-more-menu__logout';
      logout.textContent = 'Log out';
      logout.addEventListener('click', () => originalLogout.click());
      menu.appendChild(logout);
    }

    toggle.addEventListener('click', () => {
      const open = menu.hidden;
      menu.hidden = !open;
      toggle.setAttribute('aria-expanded', String(open));
    });
    if (!body.dataset.mobileMoreEvents) {
      body.dataset.mobileMoreEvents = 'ready';
      document.addEventListener('click', event => {
        const currentMenu = document.querySelector('.mobile-more-menu');
        const currentToggle = document.querySelector('.mobile-more-toggle');
        if (currentMenu && !currentMenu.hidden && !currentMenu.contains(event.target) && !currentToggle?.contains(event.target)) {
          currentMenu.hidden = true;
          currentToggle?.setAttribute('aria-expanded', 'false');
        }
      });
      document.addEventListener('keydown', event => {
        const currentMenu = document.querySelector('.mobile-more-menu');
        const currentToggle = document.querySelector('.mobile-more-toggle');
        if (event.key === 'Escape' && currentMenu && !currentMenu.hidden) {
          currentMenu.hidden = true;
          currentToggle?.setAttribute('aria-expanded', 'false');
          currentToggle?.focus();
        }
      });
    }
    appNav.appendChild(toggle);
    body.appendChild(menu);
  }

  const simControls = {
    'boot-sim.html': { primary: ['#startBoot', 'Power on'], reset: '#resetBoot' },
    'deadlock-sim.html': { primary: ['#dlDetect', 'Detect'] },
    'disk-sim.html': { primary: ['#diskRun', 'Run'] },
    'filesystem-sim.html': { primary: ['#fsCreate', 'Create file'] },
    'memory-sim.html': { primary: ['#runPaging', 'Run'], reset: '#resetPaging', tabs: { paging: ['#runPaging', 'Run', '#resetPaging'], fragmentation: ['#allocateProc', 'Allocate', '#resetFrag'] } },
    'process-sim.html': { primary: ['#psRunSim', 'Run'], step: '#psStepSim', reset: '#psResetSim' },
    'scheduling-sim.html': { primary: ['#runSim', 'Run'], reset: '#resetSim' },
    'syscall-sim.html': { primary: ['#runSyscall', 'Execute'], reset: '#resetSyscall' },
    'thread-sim.html': { primary: ['#runParallel', 'Simulate'], reset: '#resetParallel', tabs: { parallel: ['#runParallel', 'Simulate', '#resetParallel'], models: ['#runModel', 'Visualize'], pool: ['#runPool', 'Execute', '#resetPool'] } },
    'virtual-memory-sim.html': { primary: ['#vmRun', 'Run'], step: '#vmStep' }
  };

  function addDockButton(dock, selector, label, className) {
    const target = document.querySelector(selector);
    if (!target) return null;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `mobile-sim-dock__action${className ? ` ${className}` : ''}`;
    button.dataset.target = selector;
    button.textContent = label;
    button.addEventListener('click', () => {
      const currentTarget = document.querySelector(button.dataset.target);
      if (currentTarget) currentTarget.click();
    });
    dock.appendChild(button);
    return button;
  }

  function mountSimulationDock() {
    if (!isSimulation) return;
    body.classList.add('mobile-focused-sim');
    const dock = document.createElement('nav');
    dock.className = 'mobile-sim-dock';
    dock.setAttribute('aria-label', 'Simulation controls');
    dock.innerHTML = '<a class="mobile-sim-dock__back" href="explore-lessons.html">Back to Lessons</a><span class="mobile-sim-dock__label">Lab controls</span>';
    body.appendChild(dock);

    const config = simControls[currentFile];
    let primaryButton = null;
    let resetButton = null;

    function syncTabControls() {
      if (!config || !config.tabs || !primaryButton) return;
      const activeTab = document.querySelector('.mem-tab.active, .mem-tab[aria-selected="true"]');
      const tabKey = activeTab && (activeTab.dataset.tab || activeTab.getAttribute('aria-selected'));
      const actions = config.tabs[tabKey] || config.tabs[Object.keys(config.tabs)[0]];
      if (!actions) return;
      const target = document.querySelector(actions[0]);
      if (target) {
        primaryButton.dataset.target = actions[0];
        primaryButton.textContent = actions[1];
      }
      if (actions[2]) {
        const resetTarget = document.querySelector(actions[2]);
        if (resetTarget) {
          if (!resetButton) {
            resetButton = document.createElement('button');
            resetButton.type = 'button';
            resetButton.className = 'mobile-sim-dock__action mobile-sim-dock__action--quiet';
            resetButton.textContent = 'Reset';
            resetButton.addEventListener('click', () => {
              const resetTarget = document.querySelector(resetButton.dataset.target);
              if (resetTarget) resetTarget.click();
            });
            dock.appendChild(resetButton);
          }
          resetButton.dataset.target = actions[2];
        }
      } else if (resetButton) {
        resetButton.remove();
        resetButton = null;
      }
    }

    if (config && config.primary) {
      primaryButton = addDockButton(dock, config.primary[0], config.primary[1], 'mobile-sim-dock__action--primary');
    }
    if (config && config.step) addDockButton(dock, config.step, 'Step', 'mobile-sim-dock__action--quiet');
    if (config && config.reset && !config.tabs) addDockButton(dock, config.reset, 'Reset', 'mobile-sim-dock__action--quiet');

    if (config && config.tabs) {
      const sync = () => syncTabControls();
      document.querySelectorAll('.mem-tab').forEach(tab => tab.addEventListener('click', () => window.setTimeout(sync, 0)));
      syncTabControls();
    }
  }

  function setKeyboardState() {
    if (!window.visualViewport) return;
    const keyboardOpen = window.visualViewport.height < window.innerHeight - 140;
    body.classList.toggle('mobile-keyboard-open', keyboardOpen);
  }

  function onProfileReady() {
    const role = window.odysseyProfileReady ? window.odysseyUserRole : 'student';
    mountTabs(role || 'student');
    mountMoreMenu(role || 'student');
  }

  mountSimulationDock();
  placeThemeToggle();
  window.addEventListener('resize', () => {
    placeThemeToggle();
    if (window.innerWidth > 768) {
      document.querySelector('.mobile-more-toggle')?.remove();
      document.querySelector('.mobile-more-menu')?.remove();
    } else if (window.odysseyProfileReady) {
      mountMoreMenu(window.odysseyUserRole || 'guest');
    }
  }, { passive: true });
  if (window.odysseyProfileReady) onProfileReady();
  window.addEventListener('odyssey:profile-ready', onProfileReady);

  document.addEventListener('focusin', event => {
    if (event.target.matches('input, textarea, select, [contenteditable="true"]')) body.classList.add('mobile-input-focused');
  });
  document.addEventListener('focusout', event => {
    if (event.target.matches('input, textarea, select, [contenteditable="true"]')) {
      window.setTimeout(() => {
        if (!document.activeElement.matches('input, textarea, select, [contenteditable="true"]')) body.classList.remove('mobile-input-focused');
      }, 80);
    }
  });
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', setKeyboardState);
    window.visualViewport.addEventListener('scroll', setKeyboardState);
    setKeyboardState();
  }
})();
