(() => {
  'use strict';

  const STORAGE_KEY = 'os-pdf-study-session';
  const els = {
    title: document.getElementById('pdfSessionTitle'),
    source: document.getElementById('pdfSessionSource'),
    mode: document.getElementById('pdfSessionMode'),
    eyebrow: document.getElementById('pdfSessionEyebrow'),
    heading: document.getElementById('pdfSessionHeading'),
    subheading: document.getElementById('pdfSessionSubheading'),
    progressLabel: document.getElementById('pdfSessionProgressLabel'),
    progressPercent: document.getElementById('pdfSessionProgressPercent'),
    progress: document.getElementById('pdfSessionProgress'),
    content: document.getElementById('pdfSessionContent'),
  };

  let session = null;
  try { session = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || 'null'); } catch { session = null; }
  if (!session || !['quiz', 'flashcards'].includes(session.mode)) {
    els.heading.textContent = 'Your study session has ended';
    els.subheading.textContent = 'Head back to your dashboard to review your saved sets or practice with Pengu.';
    els.content.replaceChildren();
    return;
  }

  const isQuiz = session.mode === 'quiz';
  const items = isQuiz ? session.questions : session.cards;
  if (!Array.isArray(items) || !items.length) {
    els.heading.textContent = 'This study set is empty';
    els.subheading.textContent = 'Try generating a new study set with Pengu on your dashboard.';
    return;
  }

  let index = 0;
  let flipped = false;
  let answered = false;
  let score = 0;

  els.title.textContent = session.title || 'Study session';
  els.source.textContent = session.sourceName || 'PDF study set';
  els.mode.textContent = isQuiz ? 'PENGU QUIZ' : 'PENGU FLASHCARDS';
  els.eyebrow.textContent = isQuiz ? 'QUICK CHECK' : 'FLASHCARD PRACTICE';
  els.heading.textContent = isQuiz ? 'Show what you know.' : 'Let’s make this stick.';
  els.subheading.textContent = isQuiz ? 'Choose your answer. Pengu will explain the why.' : 'Think of your answer, then flip the card to check.';

  function setProgress(current, total) {
    const completed = Math.min(current + 1, total);
    const percent = Math.round((completed / total) * 100);
    els.progressLabel.textContent = `${isQuiz ? 'Question' : 'Card'} ${completed} of ${total}`;
    els.progressPercent.textContent = `${percent}%`;
    els.progress.style.width = `${percent}%`;
    els.progress.style.setProperty('--progress', `${percent}%`);
  }

  function makeButton(text, className, onClick, disabled = false) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    button.textContent = text;
    button.disabled = disabled;
    button.addEventListener('click', onClick);
    return button;
  }

  function renderCompletion() {
    setProgress(items.length - 1, items.length);
    els.progressLabel.textContent = 'Session complete';
    els.progressPercent.textContent = isQuiz ? `${score} / ${items.length}` : '100%';
    els.progress.style.width = '100%';
    els.heading.textContent = isQuiz ? 'Challenge complete!' : 'Nice work, learner.';
    els.subheading.textContent = isQuiz
      ? `${score} of ${items.length} correct. Take a breath, then run it back if you like.`
      : `You reviewed all ${items.length} cards. A little practice goes a long way.`;
    const wrap = document.createElement('section');
    wrap.className = 'pdf-finish';
    const medal = document.createElement('span'); medal.className = 'pdf-finish__icon'; medal.textContent = isQuiz ? '🏆' : '✨';
    const title = document.createElement('h2'); title.textContent = isQuiz ? `${score} / ${items.length}` : `${items.length} cards reviewed`;
    const copy = document.createElement('p'); copy.textContent = isQuiz ? 'Your score is yours to beat.' : 'Your next review will feel even easier.';
    const actions = document.createElement('div'); actions.className = 'pdf-finish__actions';
    actions.append(
      makeButton('Study again', 'pdf-session__button pdf-session__button--primary', () => { index = 0; flipped = false; answered = false; score = 0; render(); }),
      makeButton('Back to dashboard', 'pdf-session__button pdf-session__button--quiet', () => { window.location.href = 'dashboard.html'; })
    );
    wrap.append(medal, title, copy, actions);
    els.content.replaceChildren(wrap);
  }

  function renderFlashcard() {
    const cardData = items[index];
    const layout = document.createElement('div'); layout.className = 'pdf-flashcard-layout';
    const card = document.createElement('button');
    card.type = 'button'; card.className = `pdf-flashcard${flipped ? ' is-flipped' : ''}`;
    card.setAttribute('aria-label', flipped ? 'Show question side' : 'Flip to reveal answer');
    const face = document.createElement('span'); face.className = 'pdf-flashcard__face';
    const label = document.createElement('small'); label.textContent = flipped ? 'ANSWER' : 'QUESTION';
    const text = document.createElement('strong'); text.textContent = flipped ? (cardData.back || '') : (cardData.front || '');
    const hint = document.createElement('span'); hint.className = 'pdf-flashcard__hint'; hint.textContent = flipped ? (cardData.hint || 'You’ve got this.') : 'Tap card to reveal';
    face.append(label, text, hint); card.appendChild(face);
    card.addEventListener('click', () => { flipped = !flipped; render(); });
    const nav = document.createElement('div'); nav.className = 'pdf-session__nav';
    nav.append(
      makeButton('← Previous', 'pdf-session__button pdf-session__button--quiet', () => { index -= 1; flipped = false; render(); }, index === 0),
      makeButton(flipped ? 'Hide answer' : 'Flip card', 'pdf-session__button pdf-session__button--primary', () => { flipped = !flipped; render(); }),
      makeButton(index === items.length - 1 ? 'Finish →' : 'Next →', 'pdf-session__button pdf-session__button--quiet', () => { index += 1; flipped = false; if (index >= items.length) renderCompletion(); else render(); })
    );
    layout.append(card);
    if (cardData.hint) {
      const hintBox = document.createElement('p'); hintBox.className = 'pdf-flashcard-layout__extra';
      hintBox.textContent = flipped ? `Pengu’s tip: ${cardData.hint}` : 'Flip when you’re ready to check your answer.';
      layout.appendChild(hintBox);
    }
    layout.append(nav);
    els.content.replaceChildren(layout);
  }

  function renderQuiz() {
    if (index >= items.length) { renderCompletion(); return; }
    const questionData = items[index];
    const panel = document.createElement('section'); panel.className = 'pdf-question';
    const top = document.createElement('div'); top.className = 'pdf-question__top';
    const tag = document.createElement('span'); tag.textContent = 'PENGU’S QUICK CHECK';
    const count = document.createElement('strong'); count.textContent = `${index + 1} / ${items.length}`;
    top.append(tag, count);
    const question = document.createElement('h2'); question.textContent = questionData.question_text || '';
    const options = document.createElement('div'); options.className = 'pdf-question__options';
    const feedback = document.createElement('div'); feedback.className = 'pdf-question__feedback'; feedback.setAttribute('aria-live', 'polite');
    const answer = questionData.correct_answer;
    (questionData.options || []).slice(0, 4).forEach((option, optionIndex) => {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'pdf-question__option';
      const letter = document.createElement('span'); letter.textContent = String.fromCharCode(65 + optionIndex);
      const text = document.createElement('strong'); text.textContent = option;
      button.append(letter, text);
      button.addEventListener('click', () => {
        if (answered) return;
        answered = true;
        const correct = option === answer;
        if (correct) score += 1;
        options.querySelectorAll('button').forEach((choice) => {
          choice.disabled = true;
          if (choice.querySelector('strong')?.textContent === answer) choice.dataset.correct = 'true';
          if (choice === button && !correct) choice.dataset.wrong = 'true';
        });
        feedback.dataset.result = correct ? 'correct' : 'wrong';
        const result = document.createElement('strong'); result.textContent = correct ? 'That’s right!' : `Good try — the answer is ${answer}.`;
        const explanation = document.createElement('span'); explanation.textContent = questionData.explanation || '';
        feedback.replaceChildren(result, explanation);
        next.hidden = false;
      });
      options.appendChild(button);
    });
    const next = makeButton(index === items.length - 1 ? 'Finish quiz →' : 'Next question →', 'pdf-session__button pdf-session__button--primary pdf-question__next', () => {
      index += 1; answered = false; if (index >= items.length) renderCompletion(); else render();
    });
    next.hidden = true;
    panel.append(top, question, options, feedback, next);
    els.content.replaceChildren(panel);
  }

  function render() {
    setProgress(index, items.length);
    if (isQuiz) renderQuiz(); else renderFlashcard();
  }

  render();
})();
