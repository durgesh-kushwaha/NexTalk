(function () {
  if (!('serviceWorker' in navigator)) {
    return;
  }

  const clearCaches = async function () {
    if (!('caches' in window)) {
      return;
    }
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    } catch (error) {
    }
  };

  clearCaches();

  navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(function () {
    // registration failed — push notifications won't work in background
  });
})();
