const API_BASE = 'http://localhost:8080/api';

function clearSession() {
  localStorage.removeItem('nextalk_token');
  localStorage.removeItem('nextalk_user_id');
  localStorage.removeItem('nextalk_username');
  localStorage.removeItem('nextalk_display');
}

function handleUnauthorized(message) {
  clearSession();
  try {
    sessionStorage.setItem('nextalk_auth_notice', message || 'Session expired. Please sign in again.');
  } catch (error) {
  }
  const current = window.location.pathname || '';
  if (!current.endsWith('/index.html') && current !== '/index.html') {
    window.location.replace('index.html');
  }
}


function getToken() {
  return localStorage.getItem('nextalk_token');
}

function buildHeaders(extraHeaders = {}, isFormData = false) {
  const headers = { ...extraHeaders };
  if (!isFormData && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  const token = getToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

async function apiFetch(endpoint, options = {}) {
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: buildHeaders(options.headers, isFormData),
  });

  const text = await response.text();
  let data = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch (error) {
      data = { message: text };
    }
  }

  if (!response.ok) {
    const message = data.message || response.statusText;
    const isAuthEndpoint = endpoint.startsWith('/auth/');
    if ((response.status === 401 || response.status === 403) && !isAuthEndpoint) {
      handleUnauthorized(message);
    }
    throw new Error(message);
  }

  return data;
}


const api = {
  get(endpoint) {
    return apiFetch(endpoint, { method: 'GET' });
  },

  post(endpoint, body) {
    return apiFetch(endpoint, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  put(endpoint, body) {
    return apiFetch(endpoint, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  },

  postForm(endpoint, formData) {
    return apiFetch(endpoint, {
      method: 'POST',
      body: formData,
    });
  },

  delete(endpoint) {
    return apiFetch(endpoint, { method: 'DELETE' });
  },
};
