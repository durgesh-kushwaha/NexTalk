const TOKEN = localStorage.getItem('nextalk_token');
if (!TOKEN) {
  window.location.replace('index.html');
}

const THEME_KEY = 'nextalk_theme';
const form = document.getElementById('profile-form');
const statusMsg = document.getElementById('status-msg');
const displayNameInput = document.getElementById('display-name');
const avatarFileInput = document.getElementById('avatar-file');
const bioInput = document.getElementById('bio');
const avatarPreview = document.getElementById('avatar-preview');
const themeBtn = document.getElementById('theme-toggle-btn');
const BACKEND_ORIGIN = typeof getNextalkBackendOrigin === 'function'
  ? getNextalkBackendOrigin().replace(/\/$/, '')
  : 'http://localhost:8080';

function avatarSrc(path) {
  if (!path) {
    return 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="76" height="76"><rect width="100%" height="100%" fill="%23153445"/></svg>';
  }
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }
  return `${BACKEND_ORIGIN}${path}?v=${Date.now()}`;
}

function applyTheme(theme) {
  const nextTheme = theme === 'light' ? 'light' : 'dark';
  document.body.setAttribute('data-theme', nextTheme);
  themeBtn.textContent = nextTheme === 'light' ? 'Dark' : 'Light';
}

function toggleTheme() {
  const current = localStorage.getItem(THEME_KEY) || 'dark';
  const next = current === 'dark' ? 'light' : 'dark';
  localStorage.setItem(THEME_KEY, next);
  applyTheme(next);
}

async function loadProfile() {
  const me = await api.get('/users/me');
  displayNameInput.value = me.displayName || '';
  bioInput.value = me.bio || '';
  avatarPreview.src = avatarSrc(me.avatarUrl || '');
}

avatarFileInput.addEventListener('change', () => {
  const file = avatarFileInput.files && avatarFileInput.files[0];
  if (!file) {
    return;
  }
  avatarPreview.src = URL.createObjectURL(file);
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  statusMsg.textContent = 'Saving...';
  try {
    let updated = await api.put('/users/me', {
      displayName: displayNameInput.value.trim(),
      bio: bioInput.value.trim(),
    });

    const file = avatarFileInput.files && avatarFileInput.files[0];
    if (file) {
      const formData = new FormData();
      formData.append('avatar', file);
      updated = await api.postForm('/users/me/avatar', formData);
      avatarFileInput.value = '';
    }

    localStorage.setItem('nextalk_display', updated.displayName || updated.username);
    avatarPreview.src = avatarSrc(updated.avatarUrl || '');
    statusMsg.textContent = 'Profile updated';
  } catch (error) {
    statusMsg.textContent = error.message || 'Update failed';
  }
});

document.getElementById('back-btn').addEventListener('click', () => {
  window.location.href = 'chat.html';
});

themeBtn.addEventListener('click', toggleTheme);
applyTheme(localStorage.getItem(THEME_KEY) || 'dark');
loadProfile();
