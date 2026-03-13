function trimTrailingSlash(value) {
  return (value || '').replace(/\/+$/, '');
}

function toApiBase(value) {
  const base = trimTrailingSlash(value);
  if (!base) {
    return '/api';
  }
  return base.endsWith('/api') ? base : `${base}/api`;
}

function resolveApiBase() {
  let configuredBase = '';
  try {
    configuredBase = (window.NEXTALK_API_BASE || localStorage.getItem('nextalk_api_base') || '').trim();
  } catch (error) {
    configuredBase = '';
  }

  if (configuredBase) {
    return toApiBase(configuredBase);
  }

  const host = window.location.hostname;
  const isLocalHost = host === 'localhost' || host === '127.0.0.1';
  if (isLocalHost) {
    return 'http://localhost:8080/api';
  }

  return '/api';
}

function getNextalkBackendOrigin() {
  if (API_BASE.startsWith('http://') || API_BASE.startsWith('https://')) {
    return API_BASE.replace(/\/api\/?$/, '');
  }
  const origin = trimTrailingSlash(window.location.origin || '');
  if (API_BASE === '/api') {
    return origin;
  }
  return `${origin}${API_BASE}`.replace(/\/api\/?$/, '');
}

const API_BASE = resolveApiBase();

window.nextalkApiBase = API_BASE;
window.getNextalkBackendOrigin = getNextalkBackendOrigin;

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
  let response;
  try {
    response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers: buildHeaders(options.headers, isFormData),
    });
  } catch (error) {
    throw new Error('Cannot reach NexTalk API. Ensure backend is running and API base is configured.');
  }

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
