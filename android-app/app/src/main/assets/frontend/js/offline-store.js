(function () {
  const DB_NAME = 'nextalk-offline-v1';
  const DB_VERSION = 2;
  const CONVERSATIONS_STORE = 'conversations';
  const MESSAGES_STORE = 'messages';
  const IMAGES_STORE = 'images';
  const LOCAL_FILES_STORE = 'localFiles';

  let dbPromise = null;
  const blobUrlMap = new Map();

  function openDb() {
    if (dbPromise) {
      return dbPromise;
    }

    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = function (event) {
        const db = event.target.result;

        if (!db.objectStoreNames.contains(CONVERSATIONS_STORE)) {
          db.createObjectStore(CONVERSATIONS_STORE, { keyPath: 'id' });
        }

        if (!db.objectStoreNames.contains(MESSAGES_STORE)) {
          const store = db.createObjectStore(MESSAGES_STORE, { keyPath: 'id' });
          store.createIndex('conversationId', 'conversationId', { unique: false });
        }

        if (!db.objectStoreNames.contains(IMAGES_STORE)) {
          db.createObjectStore(IMAGES_STORE, { keyPath: 'url' });
        }

        if (!db.objectStoreNames.contains(LOCAL_FILES_STORE)) {
          db.createObjectStore(LOCAL_FILES_STORE, { keyPath: 'id' });
        }
      };

      request.onsuccess = function () {
        resolve(request.result);
      };

      request.onerror = function () {
        reject(request.error || new Error('Failed to open offline DB'));
      };
    });

    return dbPromise;
  }

  async function withStore(storeName, mode, work) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, mode);
      const store = tx.objectStore(storeName);

      let result;
      try {
        result = work(store);
      } catch (error) {
        reject(error);
        return;
      }

      tx.oncomplete = function () {
        resolve(result);
      };
      tx.onerror = function () {
        reject(tx.error || new Error('Transaction failed'));
      };
      tx.onabort = function () {
        reject(tx.error || new Error('Transaction aborted'));
      };
    });
  }

  function awaitRequest(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = function () {
        resolve(request.result);
      };
      request.onerror = function () {
        reject(request.error || new Error('IndexedDB request failed'));
      };
    });
  }

  async function saveConversations(items) {
    if (!Array.isArray(items)) {
      return;
    }

    await withStore(CONVERSATIONS_STORE, 'readwrite', (store) => {
      items.forEach((item) => {
        if (item && item.id) {
          store.put({ ...item, cachedAt: Date.now() });
        }
      });
    });
  }

  async function loadConversations() {
    const conversations = await withStore(CONVERSATIONS_STORE, 'readonly', async (store) => {
      return await awaitRequest(store.getAll());
    });

    return (conversations || []).sort((a, b) => {
      const t1 = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
      const t2 = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
      return t2 - t1;
    });
  }

  async function saveMessages(conversationId, messages) {
    if (!conversationId || !Array.isArray(messages)) {
      return;
    }

    await withStore(MESSAGES_STORE, 'readwrite', (store) => {
      messages.forEach((item) => {
        if (item && item.id) {
          store.put({
            ...item,
            conversationId,
            cachedAt: Date.now(),
          });
        }
      });
    });
  }

  async function upsertMessage(conversationId, message) {
    if (!conversationId || !message || !message.id) {
      return;
    }

    await withStore(MESSAGES_STORE, 'readwrite', (store) => {
      store.put({
        ...message,
        conversationId,
        cachedAt: Date.now(),
      });
    });
  }

  async function loadMessages(conversationId, limit) {
    if (!conversationId) {
      return [];
    }

    const raw = await withStore(MESSAGES_STORE, 'readonly', async (store) => {
      const index = store.index('conversationId');
      return await awaitRequest(index.getAll(conversationId));
    });

    const sorted = (raw || []).sort((a, b) => {
      const t1 = a.sentAt ? new Date(a.sentAt).getTime() : 0;
      const t2 = b.sentAt ? new Date(b.sentAt).getTime() : 0;
      return t1 - t2;
    });

    if (!limit || limit <= 0) {
      return sorted;
    }
    return sorted.slice(-limit);
  }

  async function cacheImageFromUrl(url) {
    const key = String(url || '').trim();
    if (!key || !/^https?:\/\//i.test(key)) {
      return;
    }

    const response = await fetch(key, { cache: 'force-cache' });
    if (!response.ok) {
      throw new Error('Image download failed');
    }
    const blob = await response.blob();

    await withStore(IMAGES_STORE, 'readwrite', (store) => {
      store.put({
        url: key,
        blob,
        cachedAt: Date.now(),
      });
    });
  }

  async function getCachedImageBlob(url) {
    const key = String(url || '').trim();
    if (!key) {
      return null;
    }

    const result = await withStore(IMAGES_STORE, 'readonly', async (store) => {
      return await awaitRequest(store.get(key));
    });

    return result?.blob || null;
  }

  async function getCachedImageUrl(url) {
    const key = String(url || '').trim();
    if (!key) {
      return '';
    }
    if (blobUrlMap.has(key)) {
      return blobUrlMap.get(key);
    }

    const blob = await getCachedImageBlob(key);
    if (!blob) {
      return '';
    }

    const blobUrl = URL.createObjectURL(blob);
    blobUrlMap.set(key, blobUrl);
    return blobUrl;
  }

  async function saveLocalFile(file) {
    if (!file) {
      return '';
    }
    const id = `file-${Date.now()}-${Math.floor(Math.random() * 100000)}`;

    await withStore(LOCAL_FILES_STORE, 'readwrite', (store) => {
      store.put({
        id,
        blob: file,
        name: file.name || 'file',
        type: file.type || 'application/octet-stream',
        size: Number(file.size || 0),
        cachedAt: Date.now(),
      });
    });

    return id;
  }

  async function getLocalFileBlob(fileId) {
    const key = String(fileId || '').trim();
    if (!key) {
      return null;
    }

    const result = await withStore(LOCAL_FILES_STORE, 'readonly', async (store) => {
      return await awaitRequest(store.get(key));
    });

    return result?.blob || null;
  }

  async function getLocalFileUrl(fileId) {
    const key = String(fileId || '').trim();
    if (!key) {
      return '';
    }
    if (blobUrlMap.has(key)) {
      return blobUrlMap.get(key);
    }

    const blob = await getLocalFileBlob(key);
    if (!blob) {
      return '';
    }

    const blobUrl = URL.createObjectURL(blob);
    blobUrlMap.set(key, blobUrl);
    return blobUrl;
  }

  window.nextalkOfflineStore = {
    init: openDb,
    saveConversations,
    loadConversations,
    saveMessages,
    upsertMessage,
    loadMessages,
    cacheImageFromUrl,
    getCachedImageBlob,
    getCachedImageUrl,
    saveLocalFile,
    getLocalFileBlob,
    getLocalFileUrl,
  };
})();
