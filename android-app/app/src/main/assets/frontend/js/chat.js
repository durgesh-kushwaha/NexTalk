const TOKEN = localStorage.getItem('nextalk_token');
const CURRENT_USER = localStorage.getItem('nextalk_username');
const DISPLAY_NAME = localStorage.getItem('nextalk_display');
const USER_ID = localStorage.getItem('nextalk_user_id');
const THEME_KEY = 'nextalk_theme';
const NOTIF_DESKTOP_KEY = 'nextalk_notif_desktop';
const NOTIF_MESSAGE_SOUND_KEY = 'nextalk_notif_message_sound';
const NOTIF_CALL_SOUND_KEY = 'nextalk_notif_call_sound';
const MAX_IMAGE_FILE_SIZE = 5 * 1024 * 1024;
const MAX_VIDEO_FILE_SIZE = 50 * 1024 * 1024;
const BACKEND_ORIGIN = typeof getNextalkBackendOrigin === 'function'
  ? getNextalkBackendOrigin().replace(/\/$/, '')
  : 'http://localhost:8080';
const WS_BASE = `${BACKEND_ORIGIN}/ws`;

if (!TOKEN || !CURRENT_USER) {
  window.location.replace('index.html');
}

let stompClient = null;
let currentConversation = null;
let activeSubscription = null;
let userMessageSubscription = null;
let conversationsCache = [];
let searchTimer = null;
let refreshIntervalId = null;
let refreshConversationsTimer = null;
let messageLongPressTimer = null;
let longPressMessageId = null;
let desktopContextMessageId = null;
let currentUserAvatarUrl = '';
let activeChatAvatarUrl = '';
let replyTarget = null;
let wheelReplyAccumulator = 0;
let wheelReplyTimer = null;
let wheelReplyMessageId = null;
let desktopNotificationsEnabled = localStorage.getItem(NOTIF_DESKTOP_KEY) !== '0';
let messageSoundEnabled = localStorage.getItem(NOTIF_MESSAGE_SOUND_KEY) !== '0';
let callSoundEnabled = localStorage.getItem(NOTIF_CALL_SOUND_KEY) !== '0';
const conversationSnapshot = new Map();
const messageSnapshot = new Map();
const unreadByConversation = new Map();
const MOBILE_BREAKPOINT = 860;
const TYPING_IDLE_TIMEOUT_MS = 1400;
const TYPING_STATUS_TIMEOUT_MS = 1800;

const recentNotificationMap = new Map();
const recentSignalMap = new Map();
const recentRealtimeMessageMap = new Map();

let chatStatusBaseText = 'offline';
let typingStatusTimer = null;
let typingIdleTimer = null;
let isTypingBroadcasted = false;
let hasLoadedOfflineBootstrap = false;

const offlineStore = window.nextalkOfflineStore || null;

function shouldProcessSignal(signal) {
  const key = [
    signal?.type || '',
    signal?.fromUsername || '',
    signal?.toUsername || '',
    signal?.data || '',
    signal?.videoEnabled ? '1' : '0',
  ].join('|');
  const now = Date.now();
  const seen = recentSignalMap.get(key) || 0;
  if (now - seen < 1200) {
    return false;
  }
  recentSignalMap.set(key, now);
  if (recentSignalMap.size > 120) {
    for (const [entryKey, ts] of recentSignalMap.entries()) {
      if (now - ts > 5000) {
        recentSignalMap.delete(entryKey);
      }
    }
  }
  return true;
}

function shouldProcessRealtimeMessage(message) {
  const key = message?.id
    ? `id:${message.id}`
    : [message?.conversationId || '', message?.sender?.username || '', message?.content || '', message?.sentAt || ''].join('|');
  const now = Date.now();
  const seen = recentRealtimeMessageMap.get(key) || 0;
  if (now - seen < 1500) {
    return false;
  }
  recentRealtimeMessageMap.set(key, now);
  if (recentRealtimeMessageMap.size > 300) {
    for (const [entryKey, ts] of recentRealtimeMessageMap.entries()) {
      if (now - ts > 15000) {
        recentRealtimeMessageMap.delete(entryKey);
      }
    }
  }
  return true;
}

const sidebar = document.getElementById('sidebar');
const appShell = document.querySelector('.app-shell');
const scrim = document.getElementById('scrim');
const myProfileTrigger = document.getElementById('my-profile-trigger');
const chatProfileTrigger = document.getElementById('chat-profile-trigger');
const myDisplayNameEl = document.getElementById('my-display-name');
const myAvatarEl = document.getElementById('my-avatar');
const appStatus = document.getElementById('app-status');
const searchInput = document.getElementById('search-input');
const listEl = document.getElementById('conversation-list');
const emptyState = document.getElementById('empty-state');
const chatView = document.getElementById('chat-view');
const chatAvatar = document.getElementById('chat-avatar');
const chatPartnerName = document.getElementById('chat-partner-name');
const chatStatus = document.getElementById('chat-status');
const messagesContainer = document.getElementById('messages-container');
const messageInput = document.getElementById('message-input');
const sendBtn = document.getElementById('send-btn');
const attachMenuBtn = document.getElementById('attach-menu-btn');
const attachMenu = document.getElementById('attach-menu');
const attachImageBtn = document.getElementById('attach-image-btn');
const attachVideoBtn = document.getElementById('attach-video-btn');
const attachContactBtn = document.getElementById('attach-contact-btn');
const imageInput = document.getElementById('image-input');
const videoInput = document.getElementById('video-input');
const newChatModal = document.getElementById('new-chat-modal');
const userSearchInput = document.getElementById('user-search-input');
const userSearchResults = document.getElementById('user-search-results');
const toast = document.getElementById('toast');
const audioCallBtn = document.getElementById('btn-audio-call');
const videoCallBtn = document.getElementById('btn-video-call');
const notifyBtn = document.getElementById('notify-btn');
const notifSheet = document.getElementById('notif-sheet');
const notifSheetClose = document.getElementById('notif-sheet-close');
const notifDesktopToggle = document.getElementById('notif-desktop-toggle');
const notifMessageSoundToggle = document.getElementById('notif-message-sound-toggle');
const notifCallSoundToggle = document.getElementById('notif-call-sound-toggle');
const themeToggleBtn = document.getElementById('theme-toggle-btn');
const adminBtn = document.getElementById('admin-btn');
const mobileBackBtn = document.getElementById('mobile-back-btn');
const msgActionSheet = document.getElementById('msg-action-sheet');
const msgReplyBtn = document.getElementById('msg-reply-btn');
const msgInfoBtn = document.getElementById('msg-info-btn');
const msgDeleteMeBtn = document.getElementById('msg-delete-me-btn');
const msgDeleteAllBtn = document.getElementById('msg-delete-all-btn');
const msgSheetCancelBtn = document.getElementById('msg-sheet-cancel-btn');
const msgContextMenu = document.getElementById('msg-context-menu');
const ctxReplyBtn = document.getElementById('ctx-reply-btn');
const ctxInfoBtn = document.getElementById('ctx-info-btn');
const ctxDeleteMeBtn = document.getElementById('ctx-delete-me-btn');
const ctxDeleteAllBtn = document.getElementById('ctx-delete-all-btn');
const messageInfoModal = document.getElementById('message-info-modal');
const messageInfoClose = document.getElementById('message-info-close');
const infoSentAt = document.getElementById('info-sent-at');
const infoDeliveredAt = document.getElementById('info-delivered-at');
const infoReadAt = document.getElementById('info-read-at');
const replyStrip = document.getElementById('reply-strip');
const replyToName = document.getElementById('reply-to-name');
const replyToPreview = document.getElementById('reply-to-preview');
const replyCancelBtn = document.getElementById('reply-cancel-btn');
const avatarViewer = document.getElementById('avatar-viewer');
const avatarViewerBack = document.getElementById('avatar-viewer-back');
const avatarViewerImage = document.getElementById('avatar-viewer-image');
const avatarViewerTitle = document.getElementById('avatar-viewer-title');
const avatarViewerDownload = document.getElementById('avatar-viewer-download');
let viewerDownloadUrl = '';
let pendingNativeContactResolve = null;
let nativePushRegistered = false;
let nativePushRetryTimer = null;
let nativePushLastAttemptAt = 0;
let nativePushAttemptCount = 0;
let pendingNativeNotificationPermissionResolve = null;

function isTouchLayout() {
  return window.matchMedia('(hover: none), (pointer: coarse)').matches;
}

function showToast(text) {
  toast.textContent = text;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2200);
}

function setStatus(text, connected) {
  appStatus.textContent = text;
  appStatus.style.color = connected ? '#6ee7bf' : '#f6b26b';
}

function setCallButtonsEnabled(enabled) {
  audioCallBtn.disabled = !enabled;
  videoCallBtn.disabled = !enabled;
}

function isAway() {
  return document.hidden || !document.hasFocus();
}

function hasAndroidBridge() {
  return typeof window.AndroidBridge !== 'undefined';
}

function closeAttachMenu() {
  if (attachMenu) {
    attachMenu.hidden = true;
  }
}

function toggleAttachMenu(forceOpen) {
  if (!attachMenu) {
    return;
  }
  if (typeof forceOpen === 'boolean') {
    attachMenu.hidden = !forceOpen;
    return;
  }
  attachMenu.hidden = !attachMenu.hidden;
}

function handleNativeContactPicked(rawPayload) {
  if (!pendingNativeContactResolve) {
    return;
  }
  let payload = { name: '', phone: '' };
  try {
    payload = JSON.parse(rawPayload || '{}');
  } catch (error) {
    payload = { name: '', phone: '' };
  }
  const resolver = pendingNativeContactResolve;
  pendingNativeContactResolve = null;
  resolver({
    name: String(payload.name || '').trim(),
    phone: String(payload.phone || '').trim(),
  });
}

window.onNativeContactPicked = handleNativeContactPicked;

function handleNativeNotificationPermissionResult(rawPayload) {
  let payload = { granted: false };
  try {
    payload = JSON.parse(rawPayload || '{}');
  } catch (error) {
    payload = { granted: false };
  }
  const granted = !!payload.granted;
  if (pendingNativeNotificationPermissionResolve) {
    const resolve = pendingNativeNotificationPermissionResolve;
    pendingNativeNotificationPermissionResolve = null;
    resolve(granted);
  }
}

window.onNativeNotificationPermissionResult = handleNativeNotificationPermissionResult;

function requestNativeContactPick() {
  return new Promise((resolve) => {
    if (!hasAndroidBridge() || typeof window.AndroidBridge.pickContact !== 'function') {
      resolve({ name: '', phone: '' });
      return;
    }
    pendingNativeContactResolve = resolve;
    try {
      window.AndroidBridge.pickContact();
    } catch (error) {
      pendingNativeContactResolve = null;
      resolve({ name: '', phone: '' });
    }
    setTimeout(() => {
      if (!pendingNativeContactResolve) {
        return;
      }
      const resolver = pendingNativeContactResolve;
      pendingNativeContactResolve = null;
      resolver({ name: '', phone: '' });
    }, 12000);
  });
}

function clearNativePushRetryTimer() {
  if (!nativePushRetryTimer) {
    return;
  }
  clearInterval(nativePushRetryTimer);
  nativePushRetryTimer = null;
}

function ensureNativePushRetryLoop() {
  if (!isNativeAppClient() || nativePushRegistered || nativePushRetryTimer) {
    return;
  }
  nativePushRetryTimer = setInterval(() => {
    if (nativePushRegistered) {
      clearNativePushRetryTimer();
      return;
    }
    registerNativePushToken();
  }, 12000);
}

function handleNativeFcmRegisterResult(rawPayload) {
  let payload = { success: false, status: 0 };
  try {
    payload = JSON.parse(rawPayload || '{}');
  } catch (error) {
    payload = { success: false, status: 0 };
  }

  nativePushRegistered = !!payload.success;
  if (nativePushRegistered) {
    clearNativePushRetryTimer();
    return;
  }

  ensureNativePushRetryLoop();
}

window.onNativeFcmRegisterResult = handleNativeFcmRegisterResult;
window.__nextalkTriggerPushRegistration = () => registerNativePushToken(true);

function registerNativePushToken(force) {
  if (!hasAndroidBridge()) {
    return;
  }
  if (typeof window.AndroidBridge.registerFcmToken !== 'function') {
    return;
  }

  const now = Date.now();
  if (!force && (now - nativePushLastAttemptAt) < 8000) {
    return;
  }

  nativePushLastAttemptAt = now;
  nativePushAttemptCount += 1;

  try {
    window.AndroidBridge.registerFcmToken(TOKEN || '', BACKEND_ORIGIN || '');
    ensureNativePushRetryLoop();
  } catch (error) {
    ensureNativePushRetryLoop();
  }
}

function isNativeAppClient() {
  return hasAndroidBridge();
}

function formatFileSize(bytes) {
  const size = Number(bytes || 0);
  if (!size || size < 1024) {
    return `${size || 0} B`;
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function encodeVideoNoticeContent(fileName, fileSize) {
  const safeName = String(fileName || 'video').replaceAll('|', ' ').trim() || 'video';
  const safeSize = Math.max(0, Number(fileSize || 0));
  return `VIDEO_NOTICE|${safeName}|${safeSize}`;
}

function parseVideoNoticeContent(content) {
  const raw = String(content || '');
  if (!raw.startsWith('VIDEO_NOTICE|')) {
    return null;
  }
  const parts = raw.split('|');
  const name = (parts[1] || 'Video').trim() || 'Video';
  const size = Number(parts[2] || 0);
  return {
    fileName: name,
    fileSize: Number.isFinite(size) ? Math.max(0, size) : 0,
  };
}

function createLocalMessage(type, payload) {
  const sentAt = new Date().toISOString();
  return {
    id: `local-${type.toLowerCase()}-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
    type,
    localOnly: true,
    sentAt,
    sender: {
      id: USER_ID || '',
      username: CURRENT_USER || '',
      displayName: DISPLAY_NAME || CURRENT_USER || 'Me',
    },
    ...payload,
  };
}

function isAndroidNotificationsGranted() {
  if (!hasAndroidBridge()) {
    return false;
  }
  if (typeof window.AndroidBridge.isNotificationPermissionGranted !== 'function') {
    return true;
  }
  try {
    return !!window.AndroidBridge.isNotificationPermissionGranted();
  } catch (error) {
    return false;
  }
}

function updateNotifyButton() {
  if (!desktopNotificationsEnabled && !messageSoundEnabled && !callSoundEnabled) {
    notifyBtn.innerHTML = '<span class="material-symbols-rounded">notifications_off</span>';
    return;
  }
  if (desktopNotificationsEnabled && hasAndroidBridge() && isAndroidNotificationsGranted()) {
    notifyBtn.innerHTML = '<span class="material-symbols-rounded">notifications_active</span>';
    return;
  }
  if (desktopNotificationsEnabled && 'Notification' in window && Notification.permission === 'granted') {
    notifyBtn.innerHTML = '<span class="material-symbols-rounded">notifications_active</span>';
    return;
  }
  notifyBtn.innerHTML = '<span class="material-symbols-rounded">notifications</span>';
}

function syncNotificationControls() {
  notifDesktopToggle.checked = desktopNotificationsEnabled;
  notifMessageSoundToggle.checked = messageSoundEnabled;
  notifCallSoundToggle.checked = callSoundEnabled;
}

async function requestNotificationPermission() {
  if (hasAndroidBridge()) {
    if (isAndroidNotificationsGranted()) {
      return true;
    }
    if (typeof window.AndroidBridge.requestNotificationPermission !== 'function') {
      return false;
    }
    return await new Promise((resolve) => {
      pendingNativeNotificationPermissionResolve = resolve;
      try {
        window.AndroidBridge.requestNotificationPermission();
      } catch (error) {
        pendingNativeNotificationPermissionResolve = null;
        resolve(false);
      }
      setTimeout(() => {
        if (!pendingNativeNotificationPermissionResolve) {
          return;
        }
        const callback = pendingNativeNotificationPermissionResolve;
        pendingNativeNotificationPermissionResolve = null;
        callback(isAndroidNotificationsGranted());
      }, 4500);
    });
  }
  if (!('Notification' in window)) {
    return false;
  }
  if (Notification.permission === 'granted') {
    return true;
  }
  if (Notification.permission === 'denied') {
    return false;
  }
  const permission = await Notification.requestPermission();
  return permission === 'granted';
}

function playNotificationTone(kind) {
  if (hasAndroidBridge() && typeof window.AndroidBridge.playNotificationTone === 'function') {
    try {
      window.AndroidBridge.playNotificationTone(kind || 'message');
      return;
    } catch (error) {
    }
  }

  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) {
    return;
  }
  const ctx = new AudioCtx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = kind === 'call' ? 960 : 740;
  gain.gain.value = 0.0001;
  osc.connect(gain);
  gain.connect(ctx.destination);
  const t = ctx.currentTime;
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(0.08, t + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
  osc.start(t);
  osc.stop(t + 0.26);
  setTimeout(() => {
    ctx.close().catch(() => {});
  }, 320);
}

function showDesktopNotification(title, body, tag, kind = 'message') {
  const notificationsEnabled = hasAndroidBridge() ? true : desktopNotificationsEnabled;
  if (!notificationsEnabled) {
    return;
  }

  if (hasAndroidBridge() && typeof window.AndroidBridge.showNotification === 'function') {
    try {
      window.AndroidBridge.showNotification(title || 'NexTalk', body || '', tag || '', kind || 'message');
      return;
    } catch (error) {
    }
  }

  if (!('Notification' in window) || Notification.permission !== 'granted') {
    return;
  }
  try {
    new Notification(title, {
      body,
      tag,
      renotify: true,
    });
  } catch (error) {
  }
}

function notifyIncomingMessage(conversation, message) {
  const title = getConversationName(conversation);
  const content = message || 'New message';
  const key = `msg:${conversation?.id || 'unknown'}`;
  const signature = `${title}|${content}`;
  const now = Date.now();
  const previous = recentNotificationMap.get(key);
  if (previous && previous.signature === signature && (now - previous.at) < 2500) {
    return;
  }
  recentNotificationMap.set(key, { signature, at: now });

  showDesktopNotification(title, content, `msg-${conversation.id}`, 'message');
  if (hasAndroidBridge()) {
    if (!isAndroidNotificationsGranted()) {
      showToast(`${title}: ${content}`);
    }
    // Also play sound on Android
    if (messageSoundEnabled && typeof window.AndroidBridge.playNotificationTone === 'function') {
      try { window.AndroidBridge.playNotificationTone('message'); } catch (e) {}
    }
  }
  if (messageSoundEnabled && !hasAndroidBridge()) {
    playNotificationTone('message');
  }
}

function notifyIncomingCall(fromUsername, isVideo) {
  const key = `call:${String(fromUsername || 'incoming').toLowerCase()}`;
  const signature = isVideo ? 'video' : 'audio';
  const now = Date.now();
  const previous = recentNotificationMap.get(key);
  if (previous && previous.signature === signature && (now - previous.at) < 4000) {
    return;
  }
  recentNotificationMap.set(key, { signature, at: now });

  if (hasAndroidBridge()) {
    showDesktopNotification(
      fromUsername || 'Incoming call',
      isVideo ? 'Incoming video call' : 'Incoming audio call',
      `call-${fromUsername || 'incoming'}`,
      'call'
    );
    if (!isAndroidNotificationsGranted() && callSoundEnabled) {
      showToast(`${fromUsername || 'Incoming call'} (${isVideo ? 'video' : 'audio'})`);
      playNotificationTone('call');
    }
    return;
  }
  showDesktopNotification(fromUsername || 'Incoming call', isVideo ? 'Incoming video call' : 'Incoming audio call', `call-${fromUsername || 'incoming'}`, 'call');
}

function snapshotConversationActivity(items) {
  items.forEach((item) => {
    const marker = `${item.lastMessageAt || ''}|${item.lastMessage || ''}`;
    conversationSnapshot.set(item.id, marker);
  });
}

function isCurrentConversationPrivateWithPartner(username) {
  if (!currentConversation || currentConversation.type !== 'PRIVATE') {
    return false;
  }
  const partner = getConversationPartner(currentConversation);
  return String(partner?.username || '').toLowerCase() === String(username || '').toLowerCase();
}

function setChatStatusBase(text) {
  chatStatusBaseText = text || 'offline';
  if (!typingStatusTimer) {
    chatStatus.textContent = chatStatusBaseText;
  }
}

function showTypingStatus(username) {
  if (!isCurrentConversationPrivateWithPartner(username)) {
    return;
  }
  if (typingStatusTimer) {
    clearTimeout(typingStatusTimer);
  }
  chatStatus.textContent = 'typing...';
  typingStatusTimer = setTimeout(() => {
    typingStatusTimer = null;
    chatStatus.textContent = chatStatusBaseText;
  }, TYPING_STATUS_TIMEOUT_MS);
}

function clearTypingStatus() {
  if (typingStatusTimer) {
    clearTimeout(typingStatusTimer);
    typingStatusTimer = null;
  }
  chatStatus.textContent = chatStatusBaseText;
}

function sendTypingSignal(type) {
  if (!stompClient?.connected || !currentConversation || currentConversation.type !== 'PRIVATE') {
    return;
  }
  const partner = getConversationPartner(currentConversation);
  if (!partner?.username) {
    return;
  }
  sendSignal({
    type,
    toUsername: partner.username,
    data: currentConversation.id,
  });
}

function queueTypingStopSignal() {
  if (typingIdleTimer) {
    clearTimeout(typingIdleTimer);
  }
  typingIdleTimer = setTimeout(() => {
    if (!isTypingBroadcasted) {
      return;
    }
    sendTypingSignal('TYPING_STOP');
    isTypingBroadcasted = false;
  }, TYPING_IDLE_TIMEOUT_MS);
}

function onLocalComposerInput() {
  if (!currentConversation || currentConversation.type !== 'PRIVATE') {
    return;
  }
  const hasText = !!messageInput.value.trim();
  if (!hasText) {
    if (isTypingBroadcasted) {
      sendTypingSignal('TYPING_STOP');
      isTypingBroadcasted = false;
    }
    if (typingIdleTimer) {
      clearTimeout(typingIdleTimer);
      typingIdleTimer = null;
    }
    return;
  }
  if (!isTypingBroadcasted) {
    sendTypingSignal('TYPING_START');
    isTypingBroadcasted = true;
  }
  queueTypingStopSignal();
}

function stopLocalTyping() {
  if (typingIdleTimer) {
    clearTimeout(typingIdleTimer);
    typingIdleTimer = null;
  }
  if (!isTypingBroadcasted) {
    return;
  }
  sendTypingSignal('TYPING_STOP');
  isTypingBroadcasted = false;
}

function applyTheme(theme) {
  const nextTheme = theme === 'light' ? 'light' : 'dark';
  document.body.setAttribute('data-theme', nextTheme);
  themeToggleBtn.innerHTML = `<span class="material-symbols-rounded">${nextTheme === 'light' ? 'dark_mode' : 'light_mode'}</span>`;
}

function toggleTheme() {
  const current = localStorage.getItem(THEME_KEY) || 'dark';
  const next = current === 'dark' ? 'light' : 'dark';
  localStorage.setItem(THEME_KEY, next);
  applyTheme(next);
}

function canCallCurrentConversation() {
  if (!currentConversation || currentConversation.type === 'GROUP') {
    return false;
  }
  const partner = getConversationPartner(currentConversation);
  return !!partner?.username && !!stompClient?.connected;
}

function updateCallButtonsState() {
  setCallButtonsEnabled(canCallCurrentConversation());
}

function safeName(name) {
  return name ? name.trim() : '';
}

function getInitial(name) {
  return safeName(name).slice(0, 1).toUpperCase() || '?';
}

function resolveMediaUrl(path) {
  const value = String(path || '').trim();
  if (!value) {
    return '';
  }
  if (/^(https?:|data:|blob:)/i.test(value)) {
    return value;
  }
  if (value.startsWith('/')) {
    return `${BACKEND_ORIGIN}${value}`;
  }
  return `${BACKEND_ORIGIN}/${value}`;
}

function offlineReady() {
  return !!offlineStore;
}

async function bootstrapOfflineStore() {
  if (!offlineReady()) {
    return;
  }
  try {
    await offlineStore.init();
  } catch (error) {
  }
}

async function cacheConversationsOffline(items) {
  if (!offlineReady()) {
    return;
  }
  try {
    await offlineStore.saveConversations(items || []);
  } catch (error) {
  }
}

async function loadOfflineConversations() {
  if (!offlineReady()) {
    return [];
  }
  try {
    return await offlineStore.loadConversations();
  } catch (error) {
    return [];
  }
}

async function cacheMessagesOffline(conversationId, messages) {
  if (!offlineReady() || !conversationId) {
    return;
  }
  try {
    await offlineStore.saveMessages(conversationId, messages || []);
  } catch (error) {
  }
}

async function cacheMessageOffline(conversationId, message) {
  if (!offlineReady() || !conversationId || !message) {
    return;
  }
  try {
    await offlineStore.upsertMessage(conversationId, message);
  } catch (error) {
  }
}

async function loadOfflineMessages(conversationId, limit) {
  if (!offlineReady() || !conversationId) {
    return [];
  }
  try {
    return await offlineStore.loadMessages(conversationId, limit || 200);
  } catch (error) {
    return [];
  }
}

async function cacheImageAsset(url) {
  if (!offlineReady() || !url || !/^https?:\/\//i.test(url)) {
    return;
  }
  try {
    await offlineStore.cacheImageFromUrl(url);
  } catch (error) {
  }
}

async function resolveCachedImageUrl(url) {
  if (!offlineReady() || !url) {
    return '';
  }
  try {
    return await offlineStore.getCachedImageUrl(url);
  } catch (error) {
    return '';
  }
}

async function resolveCachedImageBlob(url) {
  if (!offlineReady() || !url) {
    return null;
  }
  try {
    return await offlineStore.getCachedImageBlob(url);
  } catch (error) {
    return null;
  }
}

async function storeLocalFile(file) {
  if (!offlineReady() || !file || !offlineStore.saveLocalFile) {
    return '';
  }
  try {
    return await offlineStore.saveLocalFile(file);
  } catch (error) {
    return '';
  }
}

async function getLocalFileUrl(fileId) {
  if (!offlineReady() || !fileId || !offlineStore.getLocalFileUrl) {
    return '';
  }
  try {
    return await offlineStore.getLocalFileUrl(fileId);
  } catch (error) {
    return '';
  }
}

function setAvatarVisual(element, name, avatarUrl) {
  if (!element) {
    return;
  }
  const resolved = resolveMediaUrl(avatarUrl);
  if (resolved) {
    element.classList.add('avatar-photo');
    element.innerHTML = `<img src="${escapeHtml(resolved)}" alt="${escapeHtml(name || 'Avatar')}" />`;
    return;
  }
  element.classList.remove('avatar-photo');
  element.textContent = getInitial(name);
}

function getAvatarMarkup(name, avatarUrl) {
  const resolved = resolveMediaUrl(avatarUrl);
  if (!resolved) {
    return escapeHtml(getInitial(name));
  }
  return `<img src="${escapeHtml(resolved)}" alt="${escapeHtml(name || 'Avatar')}" />`;
}

function getDownloadNameFromUrl(url) {
  const clean = String(url || '').split('?')[0];
  const leaf = clean.split('/').pop() || '';
  return leaf || `image-${Date.now()}.jpg`;
}

async function downloadViewerImage() {
  if (!viewerDownloadUrl) {
    return;
  }
  try {
    let blob = null;
    try {
      const response = await fetch(viewerDownloadUrl);
      if (!response.ok) {
        throw new Error('Download failed');
      }
      blob = await response.blob();
    } catch (networkError) {
      blob = await resolveCachedImageBlob(viewerDownloadUrl);
      if (!blob) {
        throw networkError;
      }
    }

    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = getDownloadNameFromUrl(viewerDownloadUrl);
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(blobUrl);
  } catch (error) {
    showToast(error.message || 'Could not download image');
  }
}

function openAvatarViewer(url, title) {
  const resolved = resolveMediaUrl(url);
  if (!resolved || !avatarViewer || !avatarViewerImage) {
    return;
  }
  viewerDownloadUrl = resolved;
  avatarViewerImage.src = resolved;
  avatarViewerTitle.textContent = title || 'Profile Photo';
  avatarViewer.classList.add('open');
}

function closeAvatarViewer() {
  if (!avatarViewer) {
    return;
  }
  avatarViewer.classList.remove('open');
}

function parseServerDate(value) {
  if (!value) {
    return null;
  }
  const raw = String(value).trim();
  if (!raw) {
    return null;
  }
  const hasTimezone = /([zZ]|[+-]\d{2}:?\d{2})$/.test(raw);
  const normalized = hasTimezone ? raw : `${raw}Z`;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date;
}

function toEpochMs(value) {
  const date = parseServerDate(value);
  return date ? date.getTime() : 0;
}

function formatTime(iso) {
  const date = parseServerDate(iso);
  if (!date) {
    return '';
  }
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function formatDateTime(iso) {
  const date = parseServerDate(iso);
  if (!date) {
    return 'Not yet';
  }
  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatLastSeen(iso) {
  const date = parseServerDate(iso);
  if (!date) {
    return 'offline';
  }
  return `last seen ${date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })}`;
}

function getUnreadCount(conversationId) {
  return unreadByConversation.get(conversationId) || 0;
}

function incrementUnread(conversationId) {
  if (!conversationId) {
    return;
  }
  unreadByConversation.set(conversationId, getUnreadCount(conversationId) + 1);
}

function resetUnread(conversationId) {
  if (!conversationId) {
    return;
  }
  unreadByConversation.delete(conversationId);
}

function tickIcon() {
  return '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 8.5 5.4 12 14 3.5"/></svg>';
}

function getMessageStatusType(message) {
  if (currentConversation?.type === 'GROUP') {
    return '';
  }
  if (!message) {
    return '';
  }
  const senderId = message.sender?.id || '';
  const senderUsername = String(message.sender?.username || '').toLowerCase();
  const mine = (USER_ID && senderId === USER_ID)
    || (senderUsername && senderUsername === String(CURRENT_USER || '').toLowerCase());
  if (!mine) {
    return '';
  }
  if (message.readAt) {
    return 'read';
  }
  if (message.deliveredAt) {
    return 'delivered';
  }
  return 'sent';
}

function getMessageStatusMarkup(message) {
  const type = getMessageStatusType(message);
  if (!type) {
    return '';
  }
  const cls = type === 'read' ? 'message-status read' : 'message-status';
  if (type === 'sent') {
    return `<span class="${cls}" title="Sent">${tickIcon()}</span>`;
  }
  if (type === 'delivered') {
    return `<span class="${cls}" title="Delivered">${tickIcon()}${tickIcon()}</span>`;
  }
  return `<span class="${cls}" title="Read">${tickIcon()}${tickIcon()}</span>`;
}

function getMessagePreview(message) {
  if (!message) {
    return '';
  }
  if (message.type === 'IMAGE') {
    return 'Image';
  }
  if (message.type === 'FILE' && parseVideoNoticeContent(message.content)) {
    return 'Video';
  }
  const text = String(message.content || '').trim();
  return text.length > 80 ? `${text.slice(0, 77)}...` : text;
}

function setReplyTarget(message) {
  if (!message) {
    return;
  }
  replyTarget = {
    id: message.id,
    name: message.sender?.displayName || message.sender?.username || 'Message',
    preview: getMessagePreview(message),
  };
  replyToName.textContent = `Replying to ${replyTarget.name}`;
  replyToPreview.textContent = replyTarget.preview || 'Message';
  replyStrip.hidden = false;
  messageInput.focus();
}

function clearReplyTarget() {
  replyTarget = null;
  replyStrip.hidden = true;
  replyToName.textContent = 'Replying';
  replyToPreview.textContent = '';
}

function openMessageInfo(messageId) {
  const message = messageSnapshot.get(messageId);
  if (!message) {
    showToast('Message info unavailable');
    return;
  }
  infoSentAt.textContent = formatDateTime(message.sentAt);
  infoDeliveredAt.textContent = formatDateTime(message.deliveredAt);
  infoReadAt.textContent = formatDateTime(message.readAt);
  messageInfoModal.classList.add('open');
}

function closeMessageInfo() {
  messageInfoModal.classList.remove('open');
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function getConversationPartner(conversation) {
  if (conversation.type === 'GROUP') {
    return null;
  }
  return (conversation.participants || []).find((user) => user.username !== CURRENT_USER) || null;
}

function getConversationName(conversation) {
  if (conversation.type === 'GROUP') {
    return conversation.name || 'Group chat';
  }
  const partner = getConversationPartner(conversation);
  return partner?.displayName || partner?.username || 'Unknown';
}

function toggleSidebar(open) {
  sidebar.classList.toggle('open', open);
  scrim.classList.toggle('active', open);
}

function isMobileScreen() {
  return window.innerWidth <= MOBILE_BREAKPOINT;
}

function setMobileView(mode) {
  if (!isMobileScreen()) {
    appShell.classList.remove('mobile-list-mode', 'mobile-chat-mode');
    return;
  }
  appShell.classList.toggle('mobile-list-mode', mode === 'list');
  appShell.classList.toggle('mobile-chat-mode', mode === 'chat');
}

function handleNativeBack() {
  if (window.webRTC?.overlay?.classList.contains('open')) {
    window.webRTC.endCall();
    return true;
  }
  if (window.webRTC?.notification?.classList.contains('open')) {
    window.webRTC.rejectCall();
    return true;
  }
  if (avatarViewer?.classList.contains('open')) {
    closeAvatarViewer();
    return true;
  }
  if (messageInfoModal?.classList.contains('open')) {
    closeMessageInfo();
    return true;
  }
  if (newChatModal?.classList.contains('open')) {
    newChatModal.classList.remove('open');
    return true;
  }
  if (notifSheet?.classList.contains('open')) {
    notifSheet.classList.remove('open');
    return true;
  }
  if (attachMenu && !attachMenu.hidden) {
    closeAttachMenu();
    return true;
  }
  if (isMobileScreen() && sidebar?.classList.contains('open')) {
    toggleSidebar(false);
    return true;
  }
  if (isMobileScreen() && appShell.classList.contains('mobile-chat-mode')) {
    setMobileView('list');
    return true;
  }
  return false;
}

window.nextalkHandleNativeBack = handleNativeBack;

function applySidebarModeFromStorage() {
  const collapsed = localStorage.getItem('nextalk_sidebar_collapsed') === '1';
  appShell.classList.toggle('sidebar-collapsed', collapsed && window.innerWidth > MOBILE_BREAKPOINT);
}

function renderConversationList(data) {
  if (!data.length) {
    listEl.innerHTML = '<div class="placeholder">No conversations yet. Click New to start one.</div>';
    return;
  }

  listEl.innerHTML = '';
  data.forEach((conversation) => {
    const row = document.createElement('div');
    row.className = 'conversation-item';
    row.dataset.id = conversation.id;
    const title = getConversationName(conversation);
    const rawPreview = conversation.lastMessage || '';
    const previewText = rawPreview.startsWith('/media/chat-images/')
      ? 'Image'
      : (parseVideoNoticeContent(rawPreview) ? 'Video' : rawPreview);
    const preview = previewText ? escapeHtml(previewText) : 'No messages yet';
    const time = formatTime(conversation.lastMessageAt);
    const unreadCount = getUnreadCount(conversation.id);
    const unreadMarkup = unreadCount > 0
      ? `<span class="conv-unread" aria-label="${unreadCount} unread">${unreadCount > 99 ? '99+' : unreadCount}</span>`
      : '';

    row.innerHTML = `
      <div class="avatar">${getAvatarMarkup(title, getConversationPartner(conversation)?.avatarUrl)}</div>
      <div class="conv-info">
        <div class="conv-name">${escapeHtml(title)}</div>
        <div class="conv-preview">${preview}</div>
      </div>
      <div class="conv-time-wrap">
        <div class="conv-time">${escapeHtml(time)}</div>
        ${unreadMarkup}
      </div>
    `;

    row.addEventListener('click', () => {
      openConversation(conversation);
    });

    if (currentConversation?.id === conversation.id) {
      row.classList.add('active');
    }

    listEl.appendChild(row);
  });
}

function refreshFilteredList() {
  const query = searchInput.value.trim().toLowerCase();
  const filtered = conversationsCache.filter((item) => {
    const title = getConversationName(item).toLowerCase();
    const preview = (item.lastMessage || '').toLowerCase();
    return title.includes(query) || preview.includes(query);
  });
  renderConversationList(filtered);
}

function createMessageActionButton(label, handler) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'msg-action-btn';
  btn.textContent = label;
  btn.addEventListener('click', (event) => {
    event.stopPropagation();
    handler();
  });
  return btn;
}

function closeMessageActionSheet() {
  msgActionSheet.classList.remove('open');
  // Remove highlight from previously selected message
  const selected = messagesContainer.querySelector('.msg-selected');
  if (selected) {
    selected.classList.remove('msg-selected');
  }
  longPressMessageId = null;
}

function openMessageActionSheet(messageId) {
  longPressMessageId = messageId;
  const message = messageSnapshot.get(messageId);
  const senderId = message?.sender?.id || '';
  const senderUsername = String(message?.sender?.username || '').toLowerCase();
  const own = (USER_ID && senderId === USER_ID)
    || (senderUsername && senderUsername === String(CURRENT_USER || '').toLowerCase());
  msgDeleteAllBtn.style.display = own ? 'inline-flex' : 'none';
  msgActionSheet.classList.add('open');

  // Highlight the selected message
  const row = messagesContainer.querySelector(`[data-message-id="${messageId}"]`);
  if (row) {
    const messageRow = row.closest('.message-row') || row;
    messageRow.classList.add('msg-selected');
  }
}

function closeDesktopContextMenu() {
  msgContextMenu.classList.remove('open');
  desktopContextMessageId = null;
}

function openDesktopContextMenu(messageId, x, y) {
  desktopContextMessageId = messageId;
  const message = messageSnapshot.get(messageId);
  const senderId = message?.sender?.id || '';
  const senderUsername = String(message?.sender?.username || '').toLowerCase();
  const own = (USER_ID && senderId === USER_ID)
    || (senderUsername && senderUsername === String(CURRENT_USER || '').toLowerCase());
  ctxDeleteAllBtn.style.display = own ? 'block' : 'none';
  msgContextMenu.classList.add('open');
  const menuWidth = 190;
  const menuHeight = own ? 162 : 124;
  const left = Math.min(Math.max(8, x), window.innerWidth - menuWidth - 8);
  const top = Math.min(Math.max(8, y), window.innerHeight - menuHeight - 8);
  msgContextMenu.style.left = `${left}px`;
  msgContextMenu.style.top = `${top}px`;
}

function bindLongPressActions(bubble, messageId) {
  if (!isTouchLayout()) {
    return;
  }
  const clear = () => {
    if (messageLongPressTimer) {
      clearTimeout(messageLongPressTimer);
      messageLongPressTimer = null;
    }
  };

  bubble.addEventListener('touchstart', () => {
    clear();
    messageLongPressTimer = setTimeout(() => {
      openMessageActionSheet(messageId);
    }, 420);
  }, { passive: true });

  bubble.addEventListener('touchend', clear, { passive: true });
  bubble.addEventListener('touchcancel', clear, { passive: true });
}

function bindSwipeToReply(bubble, message) {
  let startX = 0;
  let startY = 0;
  let active = false;
  let triggered = false;

  const resetBubble = () => {
    bubble.style.setProperty('--swipe-x', '0px');
    bubble.classList.remove('swiping');
    triggered = false;
  };

  bubble.addEventListener('touchstart', (event) => {
    const point = event.touches?.[0];
    if (!point) {
      return;
    }
    startX = point.clientX;
    startY = point.clientY;
    active = true;
    triggered = false;
    bubble.classList.add('swiping');
  }, { passive: true });

  bubble.addEventListener('touchmove', (event) => {
    if (!active) {
      return;
    }
    const point = event.touches?.[0];
    if (!point) {
      return;
    }
    const dx = point.clientX - startX;
    const dy = Math.abs(point.clientY - startY);
    if (dy > 34) {
      active = false;
      resetBubble();
      return;
    }

    const clamped = Math.max(-56, Math.min(56, dx));
    bubble.style.setProperty('--swipe-x', `${clamped}px`);

    if (!triggered && Math.abs(dx) > 44) {
      triggered = true;
      active = false;
      setReplyTarget(message);
      showToast('Reply attached');
      resetBubble();
    }
  }, { passive: true });

  bubble.addEventListener('touchend', () => {
    active = false;
    resetBubble();
  }, { passive: true });

  bubble.addEventListener('touchcancel', () => {
    active = false;
    resetBubble();
  }, { passive: true });

}

function renderReplyChip(message) {
  if (!message.replyToMessageId && !message.replyToPreview) {
    return '';
  }
  return `
    <div class="reply-chip">
      <strong>Reply</strong>
      <span>${escapeHtml(message.replyToPreview || 'Message')}</span>
    </div>
  `;
}

async function deleteMessage(messageId, scope) {
  if (!currentConversation) {
    return;
  }
  try {
    await api.delete(`/conversations/${currentConversation.id}/messages/${messageId}?scope=${encodeURIComponent(scope)}`);
    if (scope === 'me') {
      const bubble = messagesContainer.querySelector(`[data-message-id="${messageId}"]`);
      if (bubble) {
        bubble.remove();
      }
    }
  } catch (error) {
    showToast(error.message || 'Delete failed');
  }
}

async function markConversationDelivered() {
  if (!currentConversation) {
    return;
  }
  try {
    await api.post(`/conversations/${currentConversation.id}/messages/mark-delivered`, {});
  } catch (error) {
  }
}

async function markConversationRead() {
  if (!currentConversation || isAway()) {
    return;
  }
  try {
    await api.post(`/conversations/${currentConversation.id}/messages/mark-read`, {});
  } catch (error) {
  }
}

async function runNativeFcmDiagnostics() {
  if (!isNativeAppClient()) {
    return;
  }
  try {
    const debug = await api.get('/devices/fcm-debug');
    if (!debug?.fcmReady) {
      registerNativePushToken(true);
      return;
    }
    const count = Number(debug?.tokenCount || 0);
    if (count < 1) {
      registerNativePushToken(true);
      return;
    }
  } catch (error) {
    registerNativePushToken(true);
  }
}

let webPushRegistered = false;

async function registerWebPushToken() {
  if (hasAndroidBridge()) {
    return;
  }
  if (webPushRegistered) {
    return;
  }
  if (typeof firebase === 'undefined' || !firebase.messaging) {
    return;
  }

  try {
    const firebaseConfig = {
      apiKey: 'AIzaSyBxLYNdJBqSJbKG8j185JdQ3RJw4MS_K24',
      authDomain: 'nextalk-ff7ad.firebaseapp.com',
      projectId: 'nextalk-ff7ad',
      storageBucket: 'nextalk-ff7ad.firebasestorage.app',
      messagingSenderId: '1007904785580',
      appId: '1:1007904785580:web:nextalk-web'
    };

    if (!firebase.apps.length) {
      firebase.initializeApp(firebaseConfig);
    }

    const messaging = firebase.messaging();

    let swRegistration = null;
    if ('serviceWorker' in navigator) {
      try {
        swRegistration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
        await navigator.serviceWorker.ready;
      } catch (swError) {
        // service worker registration failed
      }
    }

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      return;
    }

    const tokenOptions = {};
    if (swRegistration) {
      tokenOptions.serviceWorkerRegistration = swRegistration;
    }

    const fcmToken = await messaging.getToken(tokenOptions);
    if (!fcmToken) {
      return;
    }

    await api.post('/devices/fcm-token', { token: fcmToken });
    webPushRegistered = true;

    messaging.onMessage((payload) => {
      if (document.hasFocus() && !document.hidden) {
        return;
      }
      const data = payload.data || {};
      const title = payload.notification?.title || data.title || 'NexTalk';
      const body = payload.notification?.body || data.body || 'You have a new message';
      const tag = data.type === 'call' ? 'nextalk-call' : 'nextalk-msg-' + (data.conversationId || 'default');
      showDesktopNotification(title, body, tag, data.type || 'message');
    });
  } catch (error) {
    // web push registration failed
  }
}

async function loadRuntimeClientConfig() {
  try {
    const config = await api.get('/config/client');
    if (Array.isArray(config?.iceServers) && window.webRTC?.setIceServers) {
      window.webRTC.setIceServers(config.iceServers);
    }
  } catch (error) {
  }
}

async function loadConversations(quiet) {
  try {
    const data = await api.get('/conversations');
    conversationsCache = data.sort((a, b) => {
      const t1 = toEpochMs(a.lastMessageAt);
      const t2 = toEpochMs(b.lastMessageAt);
      return t2 - t1;
    });
    await cacheConversationsOffline(conversationsCache);
    snapshotConversationActivity(conversationsCache);
    if (currentConversation) {
      const updated = conversationsCache.find((item) => item.id === currentConversation.id);
      if (updated) {
        currentConversation = updated;
        setChatHeader(currentConversation);
      }
    }
    refreshFilteredList();
    if (!currentConversation && conversationsCache.length && !isMobileScreen()) {
      await openConversation(conversationsCache[0]);
    }
  } catch (error) {
    const offlineConversations = await loadOfflineConversations();
    if (offlineConversations.length) {
      conversationsCache = offlineConversations;
      snapshotConversationActivity(conversationsCache);
      refreshFilteredList();
      if (!quiet) {
        showToast('Offline mode: showing cached chats');
      }
      return;
    }
    if (!quiet) {
      showToast(error.message || 'Failed to load conversations');
    }
    listEl.innerHTML = '<div class="placeholder">Could not load conversations.</div>';
  }
}

function scheduleConversationsRefresh() {
  if (refreshConversationsTimer) {
    return;
  }
  refreshConversationsTimer = setTimeout(async () => {
    refreshConversationsTimer = null;
    await loadConversations(true);
  }, 1200);
}

function applyConversationRealtimeUpdate(message, own) {
  if (!message?.conversationId) {
    return;
  }

  const conversationId = message.conversationId;
  const existing = conversationsCache.find((item) => item.id === conversationId);
  const preview = message.type === 'IMAGE'
    ? 'Image'
    : (message.type === 'FILE' && parseVideoNoticeContent(message.content)
      ? 'Video'
      : (message.content || 'New message'));
  const sentAt = message.sentAt || new Date().toISOString();

  if (existing) {
    existing.lastMessage = preview;
    existing.lastMessageAt = sentAt;
  } else {
    conversationsCache.unshift({
      id: conversationId,
      type: 'PRIVATE',
      name: message.sender?.displayName || message.sender?.username || 'Chat',
      participants: own ? [] : [{
        username: message.sender?.username || '',
        displayName: message.sender?.displayName || message.sender?.username || 'Chat',
      }],
      lastMessage: preview,
      lastMessageAt: sentAt,
    });
  }

  conversationsCache.sort((a, b) => toEpochMs(b.lastMessageAt) - toEpochMs(a.lastMessageAt));
  refreshFilteredList();
}

async function loadCurrentUserProfile() {
  try {
    const me = await api.get('/users/me');
    const name = me.displayName || me.username || DISPLAY_NAME || CURRENT_USER;
    currentUserAvatarUrl = me.avatarUrl || '';
    myDisplayNameEl.textContent = name;
    setAvatarVisual(myAvatarEl, name, currentUserAvatarUrl);
  } catch (error) {
    myDisplayNameEl.textContent = DISPLAY_NAME || CURRENT_USER;
    setAvatarVisual(myAvatarEl, DISPLAY_NAME || CURRENT_USER, '');
  }
}

function setChatHeader(conversation) {
  const partner = getConversationPartner(conversation);
  const title = getConversationName(conversation);
  activeChatAvatarUrl = partner?.avatarUrl || '';
  setAvatarVisual(chatAvatar, title, activeChatAvatarUrl);
  chatPartnerName.textContent = title;
  if (conversation.type === 'GROUP') {
    setChatStatusBase(`${conversation.participants?.length || 0} members`);
    activeChatAvatarUrl = '';
    setAvatarVisual(chatAvatar, title, '');
  } else {
    const online = partner?.status === 'ONLINE';
    setChatStatusBase(online ? 'online' : formatLastSeen(partner?.lastSeenAt));
  }
  updateCallButtonsState();
  if (window.webRTC) {
    window.webRTC.setCallTarget(
      partner?.username || null,
      partner?.displayName || partner?.username || null,
      resolveMediaUrl(partner?.avatarUrl || '')
    );
  }
}

function subscribeConversation(conversationId) {
  if (activeSubscription) {
    activeSubscription.unsubscribe();
    activeSubscription = null;
  }
  if (!stompClient || !stompClient.connected) {
    return;
  }
  activeSubscription = stompClient.subscribe(`/topic/conversation/${conversationId}`, (frame) => {
    const message = JSON.parse(frame.body);
    const messageFrom = String(message.sender?.username || '').toLowerCase();
    if (messageFrom && messageFrom !== String(CURRENT_USER || '').toLowerCase()) {
      clearTypingStatus();
    }
    handleRealtimeIncomingMessage(message);
  });
}

function handleRealtimeIncomingMessage(message) {
  if (!message || !message.id || !message.conversationId) {
    return;
  }

  if (!shouldProcessRealtimeMessage(message)) {
    return;
  }

  const conversationId = message.conversationId;
  const senderId = message.sender?.id || '';
  const senderUsername = String(message.sender?.username || '').toLowerCase();
  const own = (USER_ID && senderId === USER_ID)
    || (senderUsername && senderUsername === String(CURRENT_USER || '').toLowerCase());

  if (currentConversation?.id === conversationId) {
    appendMessage(message, true);
    applyConversationRealtimeUpdate(message, own);
    if (!own) {
      markConversationDelivered();
      if (!isAway()) {
        markConversationRead();
      }
    }
    scheduleConversationsRefresh();
    return;
  }

  applyConversationRealtimeUpdate(message, own);

  if (!own) {
    incrementUnread(conversationId);
    const preview = message.type === 'IMAGE'
      ? 'Image'
      : (message.type === 'FILE' && parseVideoNoticeContent(message.content)
        ? 'Video'
        : (message.content || 'New message'));
    const conversation = conversationsCache.find((item) => item.id === conversationId)
      || { id: conversationId, name: message.sender?.displayName || message.sender?.username || 'Chat', type: 'PRIVATE', participants: [] };
    notifyIncomingMessage(conversation, preview);
  }

  scheduleConversationsRefresh();
}

function renderMessageContent(message) {
  if (message.deletedForEveryone) {
    return escapeHtml('This message was deleted');
  }

  const videoNotice = message.type === 'FILE' ? parseVideoNoticeContent(message.content) : null;

  if (message.type === 'VIDEO' || message.type === 'VIDEO_LOCAL' || videoNotice) {
    const baseName = message.localFileName || videoNotice?.fileName || message.content || 'Video file';
    const baseSize = message.localFileSize || videoNotice?.fileSize || 0;
    const fileName = escapeHtml(baseName);
    const sizeLabel = baseSize ? ` (${escapeHtml(formatFileSize(baseSize))})` : '';
    let note = 'Use app to see video file';
    if (isNativeAppClient()) {
      if (message.localSendState === 'sending') {
        note = 'Sending...';
      } else if (message.localSendState === 'sent' && message.localFileId) {
        note = 'Sent and stored on this device';
      } else if (message.localFileId) {
        note = 'Stored on this device';
      } else {
        note = 'Open app to view video';
      }
    }
    return `
      <div class="local-media-card" data-local-file-id="${escapeHtml(message.localFileId || '')}" data-local-kind="video">
        <strong>${fileName}${sizeLabel}</strong>
        <video class="local-video-message" controls playsinline hidden></video>
        <div class="local-media-note">${escapeHtml(note)}</div>
      </div>
    `;
  }

  if (message.type === 'CONTACT_LOCAL') {
    const contactName = escapeHtml(message.contactName || 'Contact');
    const contactPhone = escapeHtml(message.contactPhone || 'No number');
    return `
      <div class="local-media-card local-contact-card">
        <strong>${contactName}</strong>
        <div>${contactPhone}</div>
      </div>
    `;
  }

  if (message.type === 'IMAGE') {
    const src = resolveMediaUrl(message.content || '');
    if (!src) {
      return escapeHtml('[image unavailable]');
    }
    return `<a class="message-image-link" href="${escapeHtml(src)}" data-image-url="${escapeHtml(src)}"><img class="message-image" src="${escapeHtml(src)}" data-source-url="${escapeHtml(src)}" alt="Image" loading="lazy" /></a>`;
  }
  return escapeHtml(message.content || '');
}

function appendMessage(message, smooth) {
  const messageId = message.id || `temp-${Date.now()}`;
  messageSnapshot.set(messageId, message);
  const existing = messagesContainer.querySelector(`[data-message-id="${messageId}"]`);
  const senderId = message.sender?.id || '';
  const senderUsername = String(message.sender?.username || '').toLowerCase();
  const isSent = (USER_ID && senderId === USER_ID)
    || (senderUsername && senderUsername === String(CURRENT_USER || '').toLowerCase());
  const bubble = existing || document.createElement('div');
  bubble.className = `message-bubble ${isSent ? 'sent' : 'received'}`;
  bubble.dataset.messageId = messageId;
  bubble.dataset.own = isSent ? '1' : '0';
  const sender = message.sender?.displayName || message.sender?.username || 'Unknown';
  const prefix = isSent ? '' : `${escapeHtml(sender)} · `;
  bubble.innerHTML = `
    ${renderReplyChip(message)}
    <div class="bubble-text">${renderMessageContent(message)}</div>
    <div class="bubble-meta">${prefix}${escapeHtml(formatTime(message.sentAt))}${getMessageStatusMarkup(message)}</div>
  `;
  if (!message.deletedForEveryone) {
    if (isTouchLayout()) {
      bindLongPressActions(bubble, messageId);
    }
    bindSwipeToReply(bubble, message);
  }
  if (!isTouchLayout()) {
    bubble.oncontextmenu = (event) => {
      event.preventDefault();
      openDesktopContextMenu(messageId, event.clientX, event.clientY);
    };
  }
  if (!existing) {
    messagesContainer.appendChild(bubble);
  }

  if (currentConversation?.id) {
    cacheMessageOffline(currentConversation.id, message);
  }

  if (message.type === 'IMAGE') {
    const imageUrl = resolveMediaUrl(message.content || '');
    if (imageUrl) {
      cacheImageAsset(imageUrl);
      const imageEl = bubble.querySelector('.message-image');
      if (imageEl) {
        resolveCachedImageUrl(imageUrl).then((cachedUrl) => {
          if (cachedUrl) {
            imageEl.src = cachedUrl;
          }
        });
      }
    }
  }

  if (message.type === 'VIDEO_LOCAL' || message.type === 'VIDEO' || (message.type === 'FILE' && parseVideoNoticeContent(message.content))) {
    hydrateLocalVideoCard(bubble, message);
  }

  messagesContainer.scrollTo({
    top: messagesContainer.scrollHeight,
    behavior: smooth ? 'smooth' : 'auto',
  });
}

async function hydrateLocalVideoCard(bubble, message) {
  if (!bubble || !message || !isNativeAppClient()) {
    return;
  }
  const mediaCard = bubble.querySelector('.local-media-card[data-local-kind="video"]');
  const videoEl = mediaCard?.querySelector('.local-video-message');
  const noteEl = mediaCard?.querySelector('.local-media-note');
  if (!mediaCard || !videoEl) {
    return;
  }

  const fileId = message.localFileId || mediaCard.getAttribute('data-local-file-id') || '';
  if (!fileId) {
    if (noteEl) {
      noteEl.textContent = 'Use app to see video file';
    }
    return;
  }

  const localUrl = await getLocalFileUrl(fileId);
  if (!localUrl) {
    if (noteEl) {
      noteEl.textContent = 'Video not available on this device';
    }
    return;
  }

  videoEl.src = localUrl;
  videoEl.hidden = false;
  if (noteEl) {
    noteEl.textContent = 'Stored on this device';
  }
}

async function openConversation(conversation) {
  stopLocalTyping();
  clearTypingStatus();
  currentConversation = conversation;
  resetUnread(conversation.id);
  clearReplyTarget();
  if (isMobileScreen()) {
    setMobileView('chat');
  }
  refreshFilteredList();
  emptyState.style.display = 'none';
  chatView.style.display = 'grid';
  setChatHeader(conversation);
  messagesContainer.innerHTML = '';

  const cachedMessages = await loadOfflineMessages(conversation.id, 200);
  if (cachedMessages.length) {
    cachedMessages.forEach((message) => appendMessage(message, false));
  }

  try {
    const messages = await api.get(`/conversations/${conversation.id}/messages?size=100`);
    if (messages.length) {
      await cacheMessagesOffline(conversation.id, messages);
    }
    messages.forEach((message) => appendMessage(message, false));
    await markConversationDelivered();
    if (!isAway()) {
      await markConversationRead();
    }
  } catch (error) {
    if (!cachedMessages.length) {
      showToast(error.message || 'Failed to load messages');
    } else {
      showToast('Offline mode: showing cached messages');
    }
  }

  subscribeConversation(conversation.id);
}

function autoResize() {
  messageInput.style.height = 'auto';
  messageInput.style.height = `${Math.min(messageInput.scrollHeight, 130)}px`;
}

async function sendMessage() {
  if (!currentConversation) {
    showToast('Pick a conversation first');
    return;
  }
  const content = messageInput.value.trim();
  const replyToMessageId = replyTarget?.id || null;
  if (!content) {
    return;
  }
  messageInput.value = '';
  autoResize();
  clearReplyTarget();
  stopLocalTyping();

  if (stompClient?.connected) {
    stompClient.publish({
      destination: `/app/chat/${currentConversation.id}`,
      body: JSON.stringify({ content, replyToMessageId }),
    });
  } else {
    try {
      const message = await api.post(`/conversations/${currentConversation.id}/messages`, { content, replyToMessageId });
      appendMessage(message, true);
      loadConversations(true);
    } catch (error) {
      showToast(error.message || 'Failed to send message');
    }
  }
}

async function sendImageMessage(file) {
  if (!currentConversation) {
    showToast('Pick a conversation first');
    return;
  }
  if (!file || !file.type || !file.type.startsWith('image/')) {
    showToast('Only image files are allowed');
    return;
  }
  if (file.size > MAX_IMAGE_FILE_SIZE) {
    showToast('Image exceeds 5MB limit');
    return;
  }
  const formData = new FormData();
  formData.append('image', file);
  try {
    const message = await api.postForm(`/conversations/${currentConversation.id}/messages/image`, formData);
    if (!stompClient?.connected) {
      appendMessage(message, true);
    }
    loadConversations(true);
  } catch (error) {
    showToast(error.message || 'Failed to send image');
  }
}

async function sendLocalVideoMessage(file) {
  if (!isNativeAppClient()) {
    showToast('Video send is available only in app');
    return;
  }
  if (!currentConversation) {
    showToast('Pick a conversation first');
    return;
  }
  if (!file || !file.type || !file.type.startsWith('video/')) {
    showToast('Only video files are allowed');
    return;
  }
  if (file.size > MAX_VIDEO_FILE_SIZE) {
    showToast('Video exceeds 50MB limit');
    return;
  }

  const pendingMessage = createLocalMessage('VIDEO_LOCAL', {
    content: file.name,
    localFileId: '',
    localFileName: file.name,
    localFileSize: file.size,
    localSendState: 'sending',
  });
  appendMessage(pendingMessage, true);

  const localFileId = await storeLocalFile(file);
  if (!localFileId) {
    const bubble = messagesContainer.querySelector(`[data-message-id="${pendingMessage.id}"]`);
    bubble?.remove();
    showToast('Could not save video locally');
    return;
  }

  try {
    const remote = await api.post(`/conversations/${currentConversation.id}/messages/video-notice`, {
      fileName: file.name,
      fileSize: file.size,
    });

    const bubble = messagesContainer.querySelector(`[data-message-id="${pendingMessage.id}"]`);
    bubble?.remove();

    const message = {
      ...remote,
      content: encodeVideoNoticeContent(file.name, file.size),
      localFileId,
      localFileName: file.name,
      localFileSize: file.size,
      localSendState: 'sent',
    };

    appendMessage(message, true);
    loadConversations(true);
    showToast('Video sent. Receiver can open in app');
  } catch (error) {
    const bubble = messagesContainer.querySelector(`[data-message-id="${pendingMessage.id}"]`);
    bubble?.remove();
    showToast(error.message || 'Failed to send video notice');
  }
}

async function sendLocalContactMessage() {
  if (!isNativeAppClient()) {
    showToast('Contact share is available only in app');
    return;
  }
  if (!currentConversation) {
    showToast('Pick a conversation first');
    return;
  }

  let contactName = '';
  let contactPhone = '';

  if (hasAndroidBridge()) {
    const picked = await requestNativeContactPick();
    contactName = picked.name;
    contactPhone = picked.phone;
  }

  if (!contactName) {
    contactName = (window.prompt('Contact name', '') || '').trim();
  }
  if (!contactPhone) {
    contactPhone = (window.prompt('Contact phone number', '') || '').trim();
  }

  if (!contactPhone) {
    showToast('Phone number is required');
    return;
  }

  const message = createLocalMessage('CONTACT_LOCAL', {
    content: `${contactName} (${contactPhone})`,
    contactName,
    contactPhone,
  });

  appendMessage(message, true);
  showToast('Contact shared locally in app chat');
}

async function searchUsers(query) {
  try {
    const users = await api.get(`/users/search?q=${encodeURIComponent(query)}`);
    const items = users.filter((user) => user.username !== CURRENT_USER);
    if (!items.length) {
      userSearchResults.innerHTML = '<div class="placeholder">No matching users.</div>';
      return;
    }
    userSearchResults.innerHTML = '';

    items.forEach((user) => {
      const row = document.createElement('div');
      const name = user.displayName || user.username;
      row.className = 'user-result-item';
      row.innerHTML = `
        <div class="avatar">${getAvatarMarkup(name, user.avatarUrl)}</div>
        <div>
          <div class="user-result-name">${escapeHtml(name)}</div>
          <div class="user-result-username">@${escapeHtml(user.username)}</div>
        </div>
      `;
      row.addEventListener('click', async () => {
        try {
          const conversation = await api.post(`/conversations/private/${user.id}`, {});
          newChatModal.classList.remove('open');
          await loadConversations(true);
          await openConversation(conversation);
          showToast('Conversation ready');
        } catch (error) {
          showToast(error.message || 'Could not create conversation');
        }
      });
      userSearchResults.appendChild(row);
    });
  } catch (error) {
    showToast(error.message || 'User search failed');
  }
}

function onConnected() {
  setStatus('Connected', true);
  updateCallButtonsState();
  registerNativePushToken(true);
  if (userMessageSubscription) {
    userMessageSubscription.unsubscribe();
    userMessageSubscription = null;
  }
  const handleSignalFrame = (frame) => {
    let signal = null;
    try {
      signal = JSON.parse(frame.body);
    } catch (error) {
      return;
    }
    if (!signal || !shouldProcessSignal(signal)) {
      return;
    }
    const target = String(signal.toUsername || '').toLowerCase();
    if (target && target !== String(CURRENT_USER || '').toLowerCase()) {
      return;
    }
    if (window.webRTC) {
      window.webRTC.handleSignal(signal);
    }
    if (signal.type === 'TYPING_START') {
      showTypingStatus(signal.fromUsername);
      return;
    }
    if (signal.type === 'TYPING_STOP') {
      clearTypingStatus();
      return;
    }
    if (signal.type === 'CALL_REQUEST' && isAway()) {
      notifyIncomingCall(signal.fromUsername, !!signal.videoEnabled);
    }
  };
  userMessageSubscription = stompClient.subscribe('/user/queue/messages', (frame) => {
    let message = null;
    try {
      message = JSON.parse(frame.body);
    } catch (error) {
      return;
    }
    handleRealtimeIncomingMessage(message);
  });
  stompClient.subscribe('/user/queue/signals', handleSignalFrame);
  stompClient.subscribe(`/topic/signals/${CURRENT_USER}`, handleSignalFrame);
  if (currentConversation) {
    subscribeConversation(currentConversation.id);
  }
}

function connectWebSocket() {
  setStatus('Connecting', false);
  stompClient = new StompJs.Client({
    webSocketFactory: () => new SockJS(WS_BASE),
    connectHeaders: {
      Authorization: `Bearer ${TOKEN}`,
    },
    heartbeatIncoming: 10000,
    heartbeatOutgoing: 10000,
    reconnectDelay: 2000,
    onConnect: onConnected,
    onWebSocketClose: () => {
      setStatus('Reconnecting', false);
      updateCallButtonsState();
    },
    onStompError: () => {
      setStatus('Disconnected', false);
      updateCallButtonsState();
    },
  });
  stompClient.activate();
}

function sendSignal(signal) {
  if (!stompClient?.connected) {
    showToast('Call signaling unavailable');
    return false;
  }
  stompClient.publish({
    destination: '/app/signal',
    body: JSON.stringify(signal),
  });
  return true;
}

window.sendSignal = sendSignal;

document.getElementById('new-chat-btn').addEventListener('click', () => {
  newChatModal.classList.add('open');
  userSearchResults.innerHTML = '';
  userSearchInput.value = '';
  userSearchInput.focus();
});

document.getElementById('close-new-chat-modal').addEventListener('click', () => {
  newChatModal.classList.remove('open');
  userSearchInput.value = '';
  userSearchResults.innerHTML = '';
});

document.getElementById('refresh-btn').addEventListener('click', () => {
  loadConversations(false);
});

document.getElementById('sidebar-toggle-btn').addEventListener('click', () => {
  if (window.innerWidth <= MOBILE_BREAKPOINT) {
    toggleSidebar(!sidebar.classList.contains('open'));
    return;
  }
  const collapsed = !appShell.classList.contains('sidebar-collapsed');
  appShell.classList.toggle('sidebar-collapsed', collapsed);
  localStorage.setItem('nextalk_sidebar_collapsed', collapsed ? '1' : '0');
});

themeToggleBtn.addEventListener('click', toggleTheme);

notifyBtn.addEventListener('click', async () => {
  notifSheet.classList.toggle('open');
});

notifSheetClose.addEventListener('click', () => {
  notifSheet.classList.remove('open');
});

notifDesktopToggle.addEventListener('change', async () => {
  if (notifDesktopToggle.checked) {
    const granted = await requestNotificationPermission();
    desktopNotificationsEnabled = granted;
    if (!granted) {
      showToast('Desktop notifications are blocked by browser settings');
    }
  } else {
    desktopNotificationsEnabled = false;
  }
  localStorage.setItem(NOTIF_DESKTOP_KEY, desktopNotificationsEnabled ? '1' : '0');
  syncNotificationControls();
  updateNotifyButton();
});

notifMessageSoundToggle.addEventListener('change', () => {
  messageSoundEnabled = notifMessageSoundToggle.checked;
  localStorage.setItem(NOTIF_MESSAGE_SOUND_KEY, messageSoundEnabled ? '1' : '0');
  updateNotifyButton();
});

notifCallSoundToggle.addEventListener('change', () => {
  callSoundEnabled = notifCallSoundToggle.checked;
  localStorage.setItem(NOTIF_CALL_SOUND_KEY, callSoundEnabled ? '1' : '0');
  updateNotifyButton();
});

document.getElementById('profile-btn').addEventListener('click', () => {
  window.location.href = 'profile.html';
});

myProfileTrigger.addEventListener('click', () => {
  window.location.href = 'profile.html';
});

myAvatarEl.addEventListener('click', (event) => {
  event.stopPropagation();
  openAvatarViewer(currentUserAvatarUrl, `${myDisplayNameEl.textContent || 'My'} photo`);
});

myProfileTrigger.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    window.location.href = 'profile.html';
  }
});

chatProfileTrigger.addEventListener('click', () => {
  window.location.href = 'profile.html';
});

chatAvatar.addEventListener('click', (event) => {
  event.stopPropagation();
  if (!currentConversation || currentConversation.type === 'GROUP') {
    return;
  }
  openAvatarViewer(activeChatAvatarUrl, `${chatPartnerName.textContent || 'Contact'} photo`);
});

chatProfileTrigger.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    window.location.href = 'profile.html';
  }
});

adminBtn.addEventListener('click', () => {
  window.location.href = 'admin.html';
});

document.getElementById('empty-start-chat').addEventListener('click', () => {
  newChatModal.classList.add('open');
  userSearchResults.innerHTML = '';
  userSearchInput.value = '';
  userSearchInput.focus();
});

const mobileMenuBtn = document.getElementById('mobile-menu-btn');
if (mobileMenuBtn) {
  mobileMenuBtn.addEventListener('click', () => {
    setMobileView('list');
  });
}

if (mobileBackBtn) {
  mobileBackBtn.addEventListener('click', () => {
    setMobileView('list');
  });
}

msgDeleteMeBtn.addEventListener('click', async () => {
  if (longPressMessageId) {
    await deleteMessage(longPressMessageId, 'me');
  }
  closeMessageActionSheet();
});

msgDeleteAllBtn.addEventListener('click', async () => {
  if (longPressMessageId) {
    await deleteMessage(longPressMessageId, 'everyone');
  }
  closeMessageActionSheet();
});

msgReplyBtn.addEventListener('click', () => {
  if (longPressMessageId) {
    setReplyTarget(messageSnapshot.get(longPressMessageId));
  }
  closeMessageActionSheet();
});

msgInfoBtn.addEventListener('click', () => {
  if (longPressMessageId) {
    openMessageInfo(longPressMessageId);
  }
  closeMessageActionSheet();
});

ctxReplyBtn.addEventListener('click', () => {
  if (desktopContextMessageId) {
    setReplyTarget(messageSnapshot.get(desktopContextMessageId));
  }
  closeDesktopContextMenu();
});

ctxInfoBtn.addEventListener('click', () => {
  if (desktopContextMessageId) {
    openMessageInfo(desktopContextMessageId);
  }
  closeDesktopContextMenu();
});

ctxDeleteMeBtn.addEventListener('click', async () => {
  if (desktopContextMessageId) {
    await deleteMessage(desktopContextMessageId, 'me');
  }
  closeDesktopContextMenu();
});

ctxDeleteAllBtn.addEventListener('click', async () => {
  if (desktopContextMessageId) {
    await deleteMessage(desktopContextMessageId, 'everyone');
  }
  closeDesktopContextMenu();
});

msgSheetCancelBtn.addEventListener('click', closeMessageActionSheet);
scrim.addEventListener('click', closeMessageActionSheet);
messageInfoClose.addEventListener('click', closeMessageInfo);
replyCancelBtn.addEventListener('click', clearReplyTarget);

scrim.addEventListener('click', () => toggleSidebar(false));

if (avatarViewerBack) {
  avatarViewerBack.addEventListener('click', closeAvatarViewer);
}

if (avatarViewerDownload) {
  avatarViewerDownload.addEventListener('click', downloadViewerImage);
}

if (avatarViewer) {
  avatarViewer.addEventListener('click', (event) => {
    if (event.target === avatarViewer) {
      closeAvatarViewer();
    }
  });
}

if (messageInfoModal) {
  messageInfoModal.addEventListener('click', (event) => {
    if (event.target === messageInfoModal) {
      closeMessageInfo();
    }
  });
}

messagesContainer.addEventListener('click', (event) => {
  const link = event.target.closest('.message-image-link');
  if (!link) {
    return;
  }
  event.preventDefault();
  const imageUrl = link.getAttribute('data-image-url') || link.getAttribute('href');
  openAvatarViewer(imageUrl, 'Image');
});

messagesContainer.addEventListener('error', (event) => {
  const imageEl = event.target;
  if (!(imageEl instanceof HTMLImageElement) || !imageEl.classList.contains('message-image')) {
    return;
  }
  const sourceUrl = imageEl.getAttribute('data-source-url') || imageEl.getAttribute('src') || '';
  resolveCachedImageUrl(sourceUrl).then((cachedUrl) => {
    if (cachedUrl && imageEl.src !== cachedUrl) {
      imageEl.src = cachedUrl;
    }
  });
}, true);

messagesContainer.addEventListener('contextmenu', (event) => {
  if (!isTouchLayout()) {
    return;
  }
  const targetInMessage = event.target.closest('.message-bubble, .message-image-link, .message-image');
  if (!targetInMessage) {
    return;
  }
  event.preventDefault();
});

messagesContainer.addEventListener('wheel', (event) => {
  if (isTouchLayout()) {
    return;
  }
  if (Math.abs(event.deltaX) < 1 || Math.abs(event.deltaX) < Math.abs(event.deltaY)) {
    return;
  }
  const bubble = event.target.closest('.message-bubble');
  if (!bubble) {
    return;
  }
  const messageId = bubble.dataset.messageId;
  if (!messageId) {
    return;
  }
  if (wheelReplyMessageId && wheelReplyMessageId !== messageId) {
    wheelReplyAccumulator = 0;
  }
  wheelReplyMessageId = messageId;
  wheelReplyAccumulator += event.deltaX;
  if (wheelReplyTimer) {
    clearTimeout(wheelReplyTimer);
  }
  wheelReplyTimer = setTimeout(() => {
    wheelReplyAccumulator = 0;
    wheelReplyMessageId = null;
  }, 220);
  if (Math.abs(wheelReplyAccumulator) > 44) {
    wheelReplyAccumulator = 0;
    wheelReplyMessageId = null;
    const message = messageSnapshot.get(messageId);
    if (message) {
      setReplyTarget(message);
      showToast('Reply attached');
    }
  }
}, { passive: true });

searchInput.addEventListener('input', refreshFilteredList);

userSearchInput.addEventListener('input', () => {
  clearTimeout(searchTimer);
  const query = userSearchInput.value.trim();
  if (!query) {
    userSearchResults.innerHTML = '';
    return;
  }
  searchTimer = setTimeout(() => searchUsers(query), 260);
});

sendBtn.addEventListener('click', sendMessage);
if (attachMenuBtn) {
  attachMenuBtn.addEventListener('click', () => {
    if (!currentConversation) {
      showToast('Pick a conversation first');
      return;
    }
    toggleAttachMenu();
  });
}

if (attachImageBtn && imageInput) {
  attachImageBtn.addEventListener('click', () => {
    if (!currentConversation) {
      showToast('Pick a conversation first');
      return;
    }
    closeAttachMenu();
    imageInput.click();
  });

  imageInput.addEventListener('change', async () => {
    const file = imageInput.files && imageInput.files[0];
    if (file) {
      await sendImageMessage(file);
    }
    imageInput.value = '';
  });
}

if (attachVideoBtn && videoInput) {
  attachVideoBtn.addEventListener('click', () => {
    if (!currentConversation) {
      showToast('Pick a conversation first');
      return;
    }
    closeAttachMenu();
    videoInput.click();
  });

  videoInput.addEventListener('change', async () => {
    const file = videoInput.files && videoInput.files[0];
    if (file) {
      await sendLocalVideoMessage(file);
    }
    videoInput.value = '';
  });
}

if (attachContactBtn) {
  attachContactBtn.addEventListener('click', async () => {
    closeAttachMenu();
    await sendLocalContactMessage();
  });
}

messageInput.addEventListener('input', autoResize);
messageInput.addEventListener('input', onLocalComposerInput);
messageInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    sendMessage();
  }
});

document.getElementById('btn-audio-call').addEventListener('click', () => {
  if (!window.webRTC) return;
  window.webRTC.initiateCall(false);
});

document.getElementById('btn-video-call').addEventListener('click', () => {
  if (!window.webRTC) return;
  window.webRTC.initiateCall(true);
});

document.getElementById('logout-btn').addEventListener('click', () => {
  stopLocalTyping();
  if (stompClient) {
    stompClient.deactivate();
  }
  localStorage.removeItem('nextalk_token');
  localStorage.removeItem('nextalk_user_id');
  localStorage.removeItem('nextalk_username');
  localStorage.removeItem('nextalk_display');
  window.location.replace('index.html');
});

async function init() {
  await bootstrapOfflineStore();
  if (isNativeAppClient()) {
    desktopNotificationsEnabled = true;
    messageSoundEnabled = true;
    callSoundEnabled = true;
    localStorage.setItem(NOTIF_DESKTOP_KEY, '1');
    localStorage.setItem(NOTIF_MESSAGE_SOUND_KEY, '1');
    localStorage.setItem(NOTIF_CALL_SOUND_KEY, '1');
  }
  applyTheme(localStorage.getItem(THEME_KEY) || 'dark');
  await loadRuntimeClientConfig();
  registerNativePushToken();
  runNativeFcmDiagnostics();
  registerWebPushToken();
  clearReplyTarget();
  syncNotificationControls();
  updateNotifyButton();
  myDisplayNameEl.textContent = DISPLAY_NAME || CURRENT_USER;
  setAvatarVisual(myAvatarEl, DISPLAY_NAME || CURRENT_USER, '');
  await loadCurrentUserProfile();
  if (CURRENT_USER && CURRENT_USER.toLowerCase() === 'durgesh') {
    adminBtn.style.display = 'inline-flex';
  }

  if (attachVideoBtn) {
    attachVideoBtn.hidden = !isNativeAppClient();
  }
  if (attachContactBtn) {
    attachContactBtn.hidden = !isNativeAppClient();
  }

  setCallButtonsEnabled(false);
  applySidebarModeFromStorage();
  if (!USER_ID) {
    showToast('Session metadata missing; re-login recommended');
  }
  if (isMobileScreen()) {
    setMobileView('list');
  }

  // OFFLINE-FIRST: Show cached conversations immediately
  if (!hasLoadedOfflineBootstrap) {
    const cachedConversations = await loadOfflineConversations();
    if (cachedConversations.length) {
      conversationsCache = cachedConversations;
      refreshFilteredList();
      hasLoadedOfflineBootstrap = true;
      // Open first conversation on desktop
      if (!currentConversation && cachedConversations.length && !isMobileScreen()) {
        const firstConv = cachedConversations[0];
        if (firstConv) {
          await openConversation(firstConv);
        }
      }
    }
  }

  // Fetch from server in background (non-blocking)
  loadConversations(false).catch(() => {});
  connectWebSocket();
  if (!refreshIntervalId) {
    refreshIntervalId = setInterval(() => loadConversations(true), 15000);
  }
}

window.addEventListener('resize', () => {
  if (isMobileScreen()) {
    appShell.classList.remove('sidebar-collapsed');
    if (currentConversation) {
      setMobileView('chat');
    } else {
      setMobileView('list');
    }
  } else {
    toggleSidebar(false);
    appShell.classList.remove('mobile-list-mode', 'mobile-chat-mode');
    applySidebarModeFromStorage();
  }
});

document.addEventListener('click', (event) => {
  if (msgContextMenu.classList.contains('open') && !msgContextMenu.contains(event.target)) {
    closeDesktopContextMenu();
  }
  if (attachMenu && !attachMenu.hidden && !attachMenu.contains(event.target) && !(attachMenuBtn && attachMenuBtn.contains(event.target))) {
    closeAttachMenu();
  }
  if (!notifSheet.classList.contains('open')) {
    return;
  }
  if (notifSheet.contains(event.target) || notifyBtn.contains(event.target)) {
    return;
  }
  notifSheet.classList.remove('open');
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && avatarViewer?.classList.contains('open')) {
    closeAvatarViewer();
    return;
  }
  if (event.key === 'Escape' && messageInfoModal.classList.contains('open')) {
    closeMessageInfo();
  }
});

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    markConversationRead();
    registerNativePushToken(true);
  }
});

window.addEventListener('focus', () => {
  markConversationRead();
  registerNativePushToken(true);
});

init();

// Participant picker for group calls
(function () {
  const participantPickerModal = document.getElementById('participant-picker-modal');
  const closeParticipantBtn = document.getElementById('close-participant-picker');
  const participantSearchInput = document.getElementById('participant-search-input');
  const participantSearchResults = document.getElementById('participant-search-results');
  let participantSearchTimer = null;

  if (!participantPickerModal || !closeParticipantBtn) {
    return;
  }

  closeParticipantBtn.addEventListener('click', () => {
    participantPickerModal.classList.remove('open');
  });

  participantPickerModal.addEventListener('click', (event) => {
    if (event.target === participantPickerModal) {
      participantPickerModal.classList.remove('open');
    }
  });

  if (participantSearchInput) {
    participantSearchInput.addEventListener('input', () => {
      if (participantSearchTimer) {
        clearTimeout(participantSearchTimer);
      }
      participantSearchTimer = setTimeout(async () => {
        const query = participantSearchInput.value.trim();
        if (!query) {
          participantSearchResults.innerHTML = '';
          // Show conversations list when empty
          renderParticipantConversations();
          return;
        }
        try {
          const users = await api.get(`/users/search?query=${encodeURIComponent(query)}`);
          renderParticipantUsers(users || []);
        } catch (error) {
          participantSearchResults.innerHTML = '<div class="placeholder">Search failed</div>';
        }
      }, 350);
    });

    // Show conversations initially
    participantPickerModal.addEventListener('transitionend', () => {
      if (participantPickerModal.classList.contains('open') && !participantSearchInput.value.trim()) {
        renderParticipantConversations();
      }
    });
  }

  function renderParticipantConversations() {
    if (!participantSearchResults) {
      return;
    }
    const items = conversationsCache.filter((c) => c.type === 'PRIVATE');
    if (!items.length) {
      participantSearchResults.innerHTML = '<div class="placeholder">No conversations</div>';
      return;
    }
    participantSearchResults.innerHTML = items.map((conv) => {
      const name = getConversationName(conv);
      const partner = getPrivatePartner(conv);
      const username = partner?.username || '';
      return `<div class="user-result-item" data-username="${username}">
        <div class="avatar">${(name || '?').slice(0, 1).toUpperCase()}</div>
        <div>
          <div class="user-result-name">${name || 'Chat'}</div>
          <div class="user-result-username">@${username || 'unknown'}</div>
        </div>
      </div>`;
    }).join('');

    participantSearchResults.querySelectorAll('.user-result-item').forEach((item) => {
      item.addEventListener('click', () => {
        const username = item.getAttribute('data-username');
        if (username && window.webRTC) {
          window.webRTC.sendInviteToParticipant(username);
          participantPickerModal.classList.remove('open');
        }
      });
    });
  }

  function renderParticipantUsers(users) {
    if (!participantSearchResults) {
      return;
    }
    if (!users.length) {
      participantSearchResults.innerHTML = '<div class="placeholder">No users found</div>';
      return;
    }
    participantSearchResults.innerHTML = users
      .filter((u) => String(u.username || '').toLowerCase() !== String(CURRENT_USER || '').toLowerCase())
      .map((user) => {
        return `<div class="user-result-item" data-username="${user.username}">
          <div class="avatar">${(user.displayName || user.username || '?').slice(0, 1).toUpperCase()}</div>
          <div>
            <div class="user-result-name">${user.displayName || user.username}</div>
            <div class="user-result-username">@${user.username}</div>
          </div>
        </div>`;
      }).join('');

    participantSearchResults.querySelectorAll('.user-result-item').forEach((item) => {
      item.addEventListener('click', () => {
        const username = item.getAttribute('data-username');
        if (username && window.webRTC) {
          window.webRTC.sendInviteToParticipant(username);
          participantPickerModal.classList.remove('open');
        }
      });
    });
  }
})();
