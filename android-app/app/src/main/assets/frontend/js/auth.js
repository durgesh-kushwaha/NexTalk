const existingToken = localStorage.getItem('nextalk_token');

const THEME_KEY = 'nextalk_theme';

const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const tabLogin = document.getElementById('tab-login');
const tabRegister = document.getElementById('tab-register');
const loginError = document.getElementById('login-error');
const registerError = document.getElementById('register-error');
const themeToggleBtn = document.getElementById('theme-toggle-btn');
const introCard = document.querySelector('.intro-card');

function clearSession() {
  localStorage.removeItem('nextalk_token');
  localStorage.removeItem('nextalk_user_id');
  localStorage.removeItem('nextalk_username');
  localStorage.removeItem('nextalk_display');
}

async function validateExistingSession() {
  if (!existingToken) {
    return;
  }
  try {
    await api.get('/users/me');
    window.location.replace('chat.html');
  } catch (error) {
    clearSession();
  }
}

function applyTheme(theme) {
  const nextTheme = theme === 'light' ? 'light' : 'dark';
  document.body.setAttribute('data-theme', nextTheme);
  themeToggleBtn.textContent = nextTheme === 'light' ? 'Dark' : 'Light';
}

function toggleTheme() {
  const current = localStorage.getItem(THEME_KEY) || 'dark';
  const next = current === 'dark' ? 'light' : 'dark';
  localStorage.setItem(THEME_KEY, next);
  applyTheme(next);
}

function showTab(tab) {
  const isLogin = tab === 'login';
  loginForm.style.display = isLogin ? 'grid' : 'none';
  registerForm.style.display = isLogin ? 'none' : 'grid';
  tabLogin.classList.toggle('active', isLogin);
  tabRegister.classList.toggle('active', !isLogin);
  loginError.textContent = '';
  registerError.textContent = '';
}

function applyMobileAuthLayout() {
  if (!introCard) {
    return;
  }
  const mobile = window.matchMedia('(max-width: 768px)').matches;
  introCard.style.display = mobile ? 'none' : '';
}

function setLoading(buttonId, loading) {
  const btn = document.getElementById(buttonId);
  btn.disabled = loading;
  btn.querySelector('.btn-text').hidden = loading;
  btn.querySelector('.btn-loader').hidden = !loading;
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;

  if (!username || !password) {
    loginError.textContent = 'Username and password are required.';
    return;
  }

  loginError.textContent = '';
  setLoading('login-btn', true);

  try {
    const response = await api.post('/auth/login', { username, password });
    localStorage.setItem('nextalk_token', response.token);
    localStorage.setItem('nextalk_user_id', response.userId);
    localStorage.setItem('nextalk_username', response.username);
    localStorage.setItem('nextalk_display', response.displayName || response.username);
    window.location.replace('chat.html');
  } catch (error) {
    loginError.textContent = error.message || 'Unable to sign in.';
    setLoading('login-btn', false);
  }
});

registerForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  const username = document.getElementById('reg-username').value.trim();
  const displayName = document.getElementById('reg-display').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const password = document.getElementById('reg-password').value;

  if (!username || !email || !password) {
    registerError.textContent = 'Username, email and password are required.';
    return;
  }

  if (password.length < 8) {
    registerError.textContent = 'Password must be at least 8 characters.';
    return;
  }

  registerError.textContent = '';
  setLoading('register-btn', true);

  try {
    const response = await api.post('/auth/register', {
      username,
      displayName: displayName || username,
      email,
      password,
    });
    localStorage.setItem('nextalk_token', response.token);
    localStorage.setItem('nextalk_user_id', response.userId);
    localStorage.setItem('nextalk_username', response.username);
    localStorage.setItem('nextalk_display', response.displayName || response.username);
    window.location.replace('chat.html');
  } catch (error) {
    registerError.textContent = error.message || 'Unable to create account.';
    setLoading('register-btn', false);
  }
});

window.showTab = showTab;

themeToggleBtn.addEventListener('click', toggleTheme);
applyTheme(localStorage.getItem(THEME_KEY) || 'dark');
applyMobileAuthLayout();
window.addEventListener('resize', applyMobileAuthLayout);

const authNotice = sessionStorage.getItem('nextalk_auth_notice');
if (authNotice) {
  loginError.textContent = authNotice;
  sessionStorage.removeItem('nextalk_auth_notice');
}

validateExistingSession();
