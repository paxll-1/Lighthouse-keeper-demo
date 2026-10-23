// Start the game owner only after the renderer can create WebGL2. The storage
// experiment keeps a separate save branch; unsupported browsers touch neither.
const BUILD = 'island-next-2026-10-22-r1';
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
  await import('./config.js');
  await import('./model.js');
  await import('./renderer.js');
  await import('./world.js');
  await import('./scene.js');
  await import('./app.js');
  if (!globalThis.CloseDemo) throw new Error('Game startup did not complete');
  ThreeIslandPreview.ready = true;
  document.getElementById('game').setAttribute('aria-busy', 'false');
  status.hidden = true;
} catch (error) {
  failed(error);
}
