// Start the game owner only after the renderer can create WebGL2. The storage
// experiment keeps a separate save branch; unsupported browsers touch neither.
const BUILD = 'island-bench-2026-10-23-r1';
globalThis.ThreeIslandPreview = { build: BUILD, ready: false, error: null };
const status = document.getElementById('boot-status');
function failed(error) {
  ThreeIslandPreview.error = String(error?.message || error);
  status.hidden = false;
  document.getElementById('game').setAttribute('aria-busy', 'false');
  document.getElementById('boot-message').textContent = error?.name === 'WebGL2Unavailable'
    ? 'Новая графика недоступна: браузер не предоставил WebGL2. Прежняя демка остаётся доступной со своим сохранением; прогресс пробы со складом хранится отдельно.'
    : 'Не удалось запустить новую пробу. Можно открыть прежнюю демку со своим сохранением; прогресс пробы со складом хранится отдельно.';
  document.getElementById('legacy-link').hidden = false;
}
try {
  await import('./config.js?build='+BUILD);
  await import('./model.js?build='+BUILD);
  await import('./renderer.js?build='+BUILD);
  await import('./coast.js?build='+BUILD);
  await import('./world.js?build='+BUILD);
  await import('./scene.js?build='+BUILD);
  await import('./ui.js?build='+BUILD);
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
