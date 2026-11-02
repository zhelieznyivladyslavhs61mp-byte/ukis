/* Розрахунок у фоновому потоці, щоб інтерфейс не зависав. */
importScripts('engine.js?v=8ad41d98');
self.onmessage = function (e) {
  try {
    var last = 0;
    var r = self.SlopeEngine.search(e.data.model, function (p) {
      if (p - last >= 0.04 || p >= 1) { last = p; self.postMessage({ progress: p }); }
    });
    self.postMessage({ result: r });
  } catch (err) {
    self.postMessage({ error: err && err.message ? err.message : String(err) });
  }
};
