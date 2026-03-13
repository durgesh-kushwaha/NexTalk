const TOKEN = localStorage.getItem('nextalk_token');
const CURRENT_USER = localStorage.getItem('nextalk_username');
if (!TOKEN) {
  window.location.replace('index.html');
}
if (!CURRENT_USER || CURRENT_USER.toLowerCase() !== 'durgesh') {
  window.location.replace('chat.html');
}

const THEME_KEY = 'nextalk_theme';
const statusMsg = document.getElementById('status-msg');
const statsEl = document.getElementById('stats');
const themeBtn = document.getElementById('theme-toggle-btn');
const usersTableBody = document.getElementById('users-table-body');

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

async function loadStats() {
  try {
    const stats = await api.get('/admin/stats');
    statsEl.textContent = `Users: ${stats.users} | Conversations: ${stats.conversations} | Messages: ${stats.messages}`;
  } catch (error) {
    statsEl.textContent = error.message || 'Failed to load stats';
  }
}

function formatBytes(bytes) {
  const value = Number(bytes || 0);
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(2)} MB`;
}

function renderUsers(rows) {
  if (!rows || !rows.length) {
    usersTableBody.innerHTML = '<tr><td colspan="5">No users found.</td></tr>';
    return;
  }
  usersTableBody.innerHTML = '';
  rows.forEach((row) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>
        <div class="user-meta">
          <strong>${row.displayName || row.username}</strong>
          <span>@${row.username} | ${row.email || 'no-email'}</span>
        </div>
      </td>
      <td><span class="status-pill">${row.status || 'UNKNOWN'}</span></td>
      <td>${row.messageCount || 0}</td>
      <td>${formatBytes(row.storageBytes)}<br/><span class="muted">media ${formatBytes(row.messageMediaBytes)} + avatar ${formatBytes(row.avatarBytes)}</span></td>
      <td>
        <div class="row-actions">
          <button class="warn" data-action="purge" data-id="${row.id}" data-username="${row.username}">Delete Data</button>
          <button class="danger" data-action="delete" data-id="${row.id}" data-username="${row.username}">Delete User</button>
        </div>
      </td>
    `;
    usersTableBody.appendChild(tr);
  });
}

async function loadUsers() {
  try {
    const rows = await api.get('/admin/users');
    renderUsers(rows);
  } catch (error) {
    usersTableBody.innerHTML = `<tr><td colspan="5">${error.message || 'Failed to load users'}</td></tr>`;
  }
}

async function runUserAction(action, userId, username) {
  const deletingUser = action === 'delete';
  const confirmationText = deletingUser
    ? `Delete user @${username} and all associated data?`
    : `Delete data/storage used by @${username} but keep account?`;
  if (!confirm(confirmationText)) {
    return;
  }
  statusMsg.textContent = 'Processing user action...';
  try {
    const endpoint = deletingUser
      ? `/admin/users/${encodeURIComponent(userId)}/delete`
      : `/admin/users/${encodeURIComponent(userId)}/delete-data`;
    const response = await api.post(endpoint, {});
    statusMsg.textContent = response.deletedUser
      ? `Deleted @${response.deletedUser}`
      : `Deleted data for @${response.username || username}`;
    await loadStats();
    await loadUsers();
  } catch (error) {
    statusMsg.textContent = error.message || 'User action failed';
  }
}

async function runAction(endpoint, confirmationText) {
  if (!confirm(confirmationText)) {
    return;
  }
  statusMsg.textContent = 'Processing...';
  try {
    const response = await api.post(endpoint, {});
    statusMsg.textContent = response.message || 'Done';
    await loadStats();
  } catch (error) {
    statusMsg.textContent = error.message || 'Action failed';
  }
}

document.getElementById('refresh-stats-btn').addEventListener('click', loadStats);
document.getElementById('delete-messages-btn').addEventListener('click', () => runAction('/admin/purge/messages', 'Delete all messages from database?'));
document.getElementById('delete-chats-btn').addEventListener('click', () => runAction('/admin/purge/all-chats', 'Delete all conversations and messages?'));
document.getElementById('back-btn').addEventListener('click', () => { window.location.href = 'chat.html'; });
themeBtn.addEventListener('click', toggleTheme);
usersTableBody.addEventListener('click', (event) => {
  const btn = event.target.closest('button[data-action]');
  if (!btn) {
    return;
  }
  const action = btn.getAttribute('data-action');
  const userId = btn.getAttribute('data-id');
  const username = btn.getAttribute('data-username');
  runUserAction(action, userId, username);
});

applyTheme(localStorage.getItem(THEME_KEY) || 'dark');
loadStats();
loadUsers();
