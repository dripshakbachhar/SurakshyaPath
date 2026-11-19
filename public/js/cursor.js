'use strict';

(() => {
  const cursor = document.querySelector('#custom-cursor');
  if (!cursor ||
      !window.matchMedia('(hover: hover) and (pointer: fine)').matches ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  document.documentElement.classList.add('has-custom-cursor');
  let visible = false;
  document.addEventListener('pointermove', event => {
    cursor.style.transform = `translate3d(${event.clientX}px,${event.clientY}px,0) translate(-50%,-50%)`;
    if (!visible) {
      cursor.classList.add('is-visible');
      visible = true;
    }
  }, { passive: true });
  document.addEventListener('pointerover', event => {
    cursor.classList.toggle('is-hovering', Boolean(event.target.closest('a,button,input,select,textarea,[role="button"]')));
  }, { passive: true });
  document.addEventListener('pointerleave', () => cursor.classList.remove('is-visible'));
})();
