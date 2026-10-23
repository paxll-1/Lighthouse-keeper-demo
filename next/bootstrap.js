// Start the game owner only after the renderer can create WebGL2. The storage
// experiment keeps a separate save branch; unsupported browsers touch neither.
const BUILD = 'island-mobile-modes-2026-10-23-r1';
globalThis.ThreeIslandPreview = { build: BUILD, ready: false, error: null };
const status = document.getElementById('boot-status');
function failed(error) {
  ThreeIslandPreview.error = String(error?.message || error);
  status.hidden = false;
  document.getElementById('game').setAttribute('aria-busy', 'false');
  document.getElementById('boot-message').textContent = error?.name === 'WebGL2Unavailable'
    ? 'Для демки нужен WebGL2. Этот браузер его не предоставил. Попробуй современный браузер с включённым аппаратным ускорением. Сохранение не изменено.'
    : 'Не удалось запустить демку. Попробуй обновить страницу. Сохранение не изменено.';
  document.getElementById('legacy-link').hidden = true;
}
try {
  await import('./config.js?build='+BUILD);
  await import('./model.js?build='+BUILD);
  await import('./renderer.js?build='+BUILD);
  await import('./coast.js?build='+BUILD);
  await import('./world.js?build='+BUILD);
  await import('./scene.js?build='+BUILD);
  await import('./ui.js?build='+BUILD);
  await import('./ui-state.js?build='+BUILD);
  await import('./interface.js?build='+BUILD);
  await import('./gear.js?build='+BUILD);
  await import('./bench-ui.js?build='+BUILD);
  await import('./app.js?build='+BUILD);
  if (!globalThis.CloseDemo) throw new Error('Game startup did not complete');
  ThreeIslandPreview.ready = true;
  document.getElementById('game').setAttribute('aria-busy', 'false');
  status.hidden = true;
} catch (error) {
  failed(error);
}
