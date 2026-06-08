// 인게임 튜토리얼 오버레이. GameScene이 게임 루프를 멈춘 상태에서 표시하고,
// 사용자가 넘기면 콜백으로 재개한다.

export function mountTutorial({ onNext, onSkip }, parent = document.getElementById('game-container')) {
  const root = document.createElement('div');
  root.className = 'tutorial-ui';
  root.hidden = true;
  root.innerHTML = `
    <div class="tutorial-ui__panel" role="dialog" aria-modal="true" aria-label="튜토리얼">
      <span class="tutorial-ui__eyebrow">SURF GUIDE</span>
      <h2 class="tutorial-ui__title"></h2>
      <p class="tutorial-ui__body"></p>
      <div class="tutorial-ui__keys"></div>
      <div class="tutorial-ui__actions">
        <button class="btn tutorial-ui__button tutorial-ui__button--next" data-act="next">계속하기</button>
        <button class="tutorial-ui__skip" type="button" data-act="skip">이번 튜토리얼 넘기기</button>
      </div>
    </div>
  `;
  parent.appendChild(root);

  const el = {
    title: root.querySelector('.tutorial-ui__title'),
    body: root.querySelector('.tutorial-ui__body'),
    keys: root.querySelector('.tutorial-ui__keys'),
  };

  const onClick = (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'next') onNext?.();
    else if (act === 'skip') onSkip?.();
  };
  root.addEventListener('click', onClick);

  const onKey = (e) => {
    if (root.hidden || e.key !== 'Enter') return;
    e.preventDefault();
    onNext?.();
  };
  document.addEventListener('keydown', onKey);

  function show(step) {
    el.title.textContent = step.title;
    el.body.textContent = step.body;
    el.keys.innerHTML = (step.keys ?? [])
      .map((key) => `<kbd class="tutorial-ui__key">${escapeHtml(key)}</kbd>`)
      .join('');
    root.hidden = false;
  }

  function hide() {
    root.hidden = true;
  }

  return {
    show,
    hide,
    destroy() {
      root.removeEventListener('click', onClick);
      document.removeEventListener('keydown', onKey);
      root.remove();
    },
  };
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}
