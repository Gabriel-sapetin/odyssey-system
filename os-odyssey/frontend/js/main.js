/* =============================================
   OS ODYSSEY — main.js
   Theme toggle, animations, form handling
   ============================================= */

(function () {
  'use strict';

  const DEFAULT_AVATAR = '../../assets/penguin-flower-removebg-preview.png';
  const DEFAULT_CHARACTER = 'Kernel Penguin';
  const USERS_KEY = 'os-odyssey-users';
  const SESSION_KEY = 'os-odyssey-session';

  function readUsers() {
    try {
      return JSON.parse(localStorage.getItem(USERS_KEY)) || {};
    } catch (err) {
      return {};
    }
  }

  function writeUsers(users) {
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
  }

  function getSessionEmail() {
    return localStorage.getItem(SESSION_KEY);
  }

  function getCurrentUser() {
    const email = getSessionEmail();
    if (!email) return null;
    return readUsers()[email] || null;
  }

  function setCurrentUser(user) {
    const users = readUsers();
    users[user.email] = user;
    writeUsers(users);
    localStorage.setItem(SESSION_KEY, user.email);
  }

  function makeUser(email) {
    const cleanEmail = email.trim().toLowerCase();
    const username = cleanEmail.split('@')[0] || 'kernel-cadet';

    return {
      email: cleanEmail,
      username,
      character: localStorage.getItem('os-odyssey-character') || DEFAULT_CHARACTER,
      avatar: localStorage.getItem('os-odyssey-avatar') || DEFAULT_AVATAR,
      level: 1,
      xp: 20,
      rank: 'Bronze',
      badges: 0,
      streak: 1,
      createdAt: new Date().toISOString()
    };
  }

  function renderAvatar(target, user) {
    if (!target || !user) return;

    if (user.avatar === 'computer') {
      target.innerHTML = '<span class="computer-avatar mini"><span class="screen-face"></span></span>';
      return;
    }

    target.innerHTML = `<img src="${user.avatar}" alt="${user.character}" />`;
  }

  function renderSessionUI() {
    const user = getCurrentUser();
    document.querySelectorAll('[data-auth-action="guest"]').forEach(el => {
      el.hidden = Boolean(user);
    });
    document.querySelectorAll('[data-auth-action="user"]').forEach(el => {
      el.hidden = !user;
    });

    if (!user) return;

    document.querySelectorAll('[data-user-name]').forEach(el => {
      el.textContent = user.username;
    });
    document.querySelectorAll('[data-user-avatar]').forEach(el => renderAvatar(el, user));
  }

  function showAuthError(message) {
    const form = document.querySelector('.auth-form');
    if (!form) return;

    let error = form.querySelector('.auth-error');
    if (!error) {
      error = document.createElement('p');
      error.className = 'auth-error';
      form.prepend(error);
    }

    error.textContent = message;
  }

  /* ---- Theme Toggle ---- */
  const html = document.documentElement;
  const toggleBtn = document.getElementById('themeToggle');

  const savedTheme = localStorage.getItem('os-odyssey-theme') || 'light';
  html.setAttribute('data-theme', savedTheme);

  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      const next = html.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
      html.setAttribute('data-theme', next);
      localStorage.setItem('os-odyssey-theme', next);
    });
  }

  /* ---- Navbar scroll shadow ---- */
  const navbar = document.querySelector('.navbar');
  if (navbar) {
    window.addEventListener('scroll', () => {
      navbar.style.boxShadow = window.scrollY > 20 ? '0 4px 0 rgba(0,0,0,0.2)' : 'none';
    }, { passive: true });
  }

  /* ---- Scroll-triggered fade-in for module cards ---- */
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.style.opacity = '1';
        e.target.style.transform = 'translateY(0)';
        observer.unobserve(e.target);
      }
    });
  }, { threshold: 0.12 });

  document.querySelectorAll('.module-card').forEach((card, i) => {
    card.style.opacity = '0';
    card.style.transform = 'translateY(24px)';
    card.style.transition = `opacity 0.45s ease ${i * 0.08}s, transform 0.45s ease ${i * 0.08}s`;
    observer.observe(card);
  });

  /* ---- Snow particle effect over hero ---- */
  function spawnSnow() {
    const hero = document.querySelector('.hero');
    if (!hero) return;

    const style = document.createElement('style');
    style.textContent = `
      .flake {
        position: absolute;
        background: #fff;
        pointer-events: none;
        z-index: 6;
        image-rendering: pixelated;
        animation: fall linear infinite;
        border-radius: 0; /* pixel square flakes */
      }
      @keyframes fall {
        0%   { transform: translateY(-20px) translateX(0px); opacity: 0; }
        5%   { opacity: 1; }
        90%  { opacity: 0.8; }
        100% { transform: translateY(100vh) translateX(var(--drift)); opacity: 0; }
      }
    `;
    document.head.appendChild(style);

    for (let i = 0; i < 35; i++) {
      const f = document.createElement('div');
      const size = Math.random() > 0.6 ? 4 : 2;
      const drift = (Math.random() > 0.5 ? 1 : -1) * (10 + Math.random() * 20);
      f.className = 'flake';
      f.style.cssText = `
        width: ${size}px;
        height: ${size}px;
        left: ${Math.random() * 100}%;
        top: ${Math.random() * 50}%;
        opacity: ${0.5 + Math.random() * 0.5};
        animation-duration: ${4 + Math.random() * 6}s;
        animation-delay: ${Math.random() * 6}s;
        --drift: ${drift}px;
      `;
      hero.appendChild(f);
    }
  }

  spawnSnow();

  /* ---- Module card click ripple ---- */
  document.querySelectorAll('.module-card').forEach(card => {
    card.addEventListener('click', e => {
      const ripple = document.createElement('span');
      const rect = card.getBoundingClientRect();
      ripple.style.cssText = `
        position: absolute;
        width: 8px; height: 8px;
        background: rgba(245,166,35,0.45);
        left: ${e.clientX - rect.left - 4}px;
        top:  ${e.clientY - rect.top  - 4}px;
        pointer-events: none;
        z-index: 99;
        animation: ripple-out 0.55s ease forwards;
      `;
      card.style.position = 'relative';
      card.appendChild(ripple);
      setTimeout(() => ripple.remove(), 600);
    });
  });

  const rippleStyle = document.createElement('style');
  rippleStyle.textContent = `@keyframes ripple-out { to { transform: scale(32); opacity: 0; } }`;
  document.head.appendChild(rippleStyle);

  renderSessionUI();

  /* ---- Auth form ---- */
  const authSubmit = document.querySelector('.auth-submit');
  if (authSubmit) {
    authSubmit.addEventListener('click', e => {
      e.preventDefault();
      const inputs = document.querySelectorAll('.auth-input');
      let valid = true;

      const shakeStyle = document.createElement('style');
      shakeStyle.textContent = `
        @keyframes shake {
          0%,100% { transform: translateX(0); }
          25%      { transform: translateX(-6px); }
          75%      { transform: translateX(6px); }
        }
      `;
      document.head.appendChild(shakeStyle);

      inputs.forEach(inp => {
        if (!inp.value.trim()) {
          valid = false;
          inp.style.borderColor = '#ef4444';
          inp.style.animation = 'shake 0.3s ease';
          setTimeout(() => { inp.style.animation = ''; inp.style.borderColor = ''; }, 400);
        }
      });

      if (valid) {
        const emailInput = document.querySelector('.auth-input[type="email"]');
        const email = emailInput ? emailInput.value.trim().toLowerCase() : '';
        const users = readUsers();
        const existingUser = users[email];
        const mode = authSubmit.dataset.authMode || 'signup';

        if (mode === 'login' && !existingUser) {
          showAuthError('No saved account found for this email. Sign up first.');
          return;
        }

        const user = existingUser || makeUser(email);

        setCurrentUser(user);

        const defaultText = authSubmit.textContent;
        authSubmit.textContent = authSubmit.dataset.loadingText || 'Submitting...';
        authSubmit.disabled = true;

        setTimeout(() => {
          if (authSubmit.dataset.redirect) {
            window.location.href = authSubmit.dataset.redirect;
            return;
          }

          authSubmit.textContent = defaultText;
          authSubmit.disabled = false;
        }, 700);
      }
    });
  }

  /* ---- Character selection and dashboard profile ---- */
  const characterCards = document.querySelectorAll('.character-card');
  const characterContinue = document.getElementById('characterContinue');
  const currentUser = getCurrentUser();
  let selectedCharacter = {
    name: currentUser?.character || localStorage.getItem('os-odyssey-character') || DEFAULT_CHARACTER,
    avatar: currentUser?.avatar || localStorage.getItem('os-odyssey-avatar') || DEFAULT_AVATAR
  };

  function selectCharacter(card) {
    characterCards.forEach(c => c.classList.remove('selected'));
    card.classList.add('selected');
    selectedCharacter = {
      name: card.dataset.character,
      avatar: card.dataset.avatar
    };
  }

  characterCards.forEach(card => {
    if (card.dataset.character === selectedCharacter.name) {
      selectCharacter(card);
    }

    card.addEventListener('click', () => selectCharacter(card));
  });

  if (characterContinue) {
    characterContinue.addEventListener('click', () => {
      localStorage.setItem('os-odyssey-character', selectedCharacter.name);
      localStorage.setItem('os-odyssey-avatar', selectedCharacter.avatar);

      const user = getCurrentUser();
      if (user) {
        user.character = selectedCharacter.name;
        user.avatar = selectedCharacter.avatar;
        setCurrentUser(user);
      }
    });
  }

  const profileName = document.getElementById('profileName');
  const profileAvatar = document.getElementById('profileAvatar');
  const profileLevel = document.getElementById('profileLevel');
  const profileXp = document.getElementById('profileXp');
  const profileRank = document.getElementById('profileRank');
  const profileBadges = document.getElementById('profileBadges');
  const profileStreak = document.getElementById('profileStreak');
  const dashboardUser = getCurrentUser();

  if (profileName && dashboardUser) {
    profileName.textContent = dashboardUser.username;
  }

  if (profileLevel && dashboardUser) {
    profileLevel.textContent = `Level ${dashboardUser.level}`;
  }

  if (profileXp && dashboardUser) {
    profileXp.textContent = dashboardUser.xp;
  }

  if (profileRank && dashboardUser) {
    profileRank.textContent = dashboardUser.rank;
  }

  if (profileBadges && dashboardUser) {
    profileBadges.textContent = dashboardUser.badges;
  }

  if (profileStreak && dashboardUser) {
    profileStreak.textContent = dashboardUser.streak;
  }

  if (profileAvatar && dashboardUser) {
    renderAvatar(profileAvatar, dashboardUser);
  }

  document.querySelectorAll('[data-logout]').forEach(button => {
    button.addEventListener('click', () => {
      localStorage.removeItem(SESSION_KEY);
      window.location.href = 'index.html';
    });
  });

  if (document.body.classList.contains('dashboard-page') && !dashboardUser) {
    window.location.href = 'login.html';
  }

  const clubDismiss = document.querySelector('.club-card button');
  if (clubDismiss) {
    clubDismiss.addEventListener('click', () => {
      clubDismiss.closest('.club-card').style.display = 'none';
    });
  }

  /* ---- Easter egg ---- */
  console.log('%c🐧 OS ODYSSEY', 'font-family:monospace;font-size:22px;color:#f5a623;font-weight:bold;');
  console.log('%cTrain like a coder. Think like a kernel.', 'font-family:monospace;font-size:12px;color:#94a3b8;');

})();
