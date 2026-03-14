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

  const unregisterWorkers = async function () {
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((reg) => reg.unregister()));
    } catch (error) {
    }
  };

  clearCaches();
  unregisterWorkers();
})();
