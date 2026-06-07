// 일시정지 DOM 오버레이 (Three 캔버스 위). 기존 PauseScene(키 입력 재개 처리)은 그대로 두고,
// 보이는 메뉴 + 클릭 버튼만 DOM으로 보강. mountPause({onResume,onMenu}) → { show, hide, destroy }.
export function mountPause({ onResume, onMenu }, parent = document.getElementById('game-container')) {
  const root = document.createElement('div');
  root.className = 'pause-ui';
  root.hidden = true;
  root.innerHTML = `
    <div class="pause-ui__panel" role="dialog" aria-modal="true" aria-label="일시정지">
      <span class="pause-ui__eyebrow">SURF PAUSE</span>
      <h2 class="pause-ui__title">잠깐 쉬어가기</h2>
      <p class="pause-ui__hint">파도는 그대로 기다리고 있어요</p>
      <div class="pause-ui__actions">
        <button class="btn pause-ui__button pause-ui__button--resume" data-act="resume">계속 서핑하기</button>
        <button class="btn pause-ui__button pause-ui__button--menu" data-act="menu">메인으로</button>
      </div>
      <p class="pause-ui__shortcut">P / ESC</p>
    </div>
  `;
  parent.appendChild(root);

  const onClick = (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'resume') onResume?.();
    else if (act === 'menu') onMenu?.();
  };
  root.addEventListener('click', onClick);

  return {
    show() { root.hidden = false; },
    hide() { root.hidden = true; },
    destroy() { root.removeEventListener('click', onClick); root.remove(); },
  };
}
