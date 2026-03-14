function trimTrailingSlash(value) {
  return (value || '').replace(/\/+$/, '');
}

const DEFAULT_PROD_BACKEND_ORIGIN = 'https://durgesh-kushwaha-nextalk.hf.space';

function sanitizeBackendOrigin(value) {
  const candidate = trimTrailingSlash((value || '').trim());
  if (!candidate) {
    return '';
  }
  if (!/^https?:\/\//i.test(candidate)) {
    return '';
  }
  return candidate;
}

function resolveConfiguredBackendOrigin() {
  let fromQuery = '';
  try {
    const url = new URL(window.location.href);
    fromQuery = sanitizeBackendOrigin(url.searchParams.get('backend') || '');
    if (fromQuery) {
      localStorage.setItem('nextalk_backend_origin', fromQuery);
    }
  } catch (error) {
    fromQuery = '';
  }

  if (fromQuery) {
    return fromQuery;
  }

  try {
    const legacyApiBase = (localStorage.getItem('nextalk_api_base') || '').trim();
    const storedOrigin = sanitizeBackendOrigin(localStorage.getItem('nextalk_backend_origin') || '');
    if (storedOrigin) {
      return storedOrigin;
    }
    if (legacyApiBase) {
      const normalized = toApiBase(legacyApiBase);
      if (normalized.startsWith('http://') || normalized.startsWith('https://')) {
        return normalized.replace(/\/api\/?$/, '');
      }
    }
  } catch (error) {
    return '';
  }

  const protocol = (window.location.protocol || '').toLowerCase();
  const host = window.location.hostname || '';
  const isLocalHost = host === 'localhost' || host === '127.0.0.1';

  // Android WebView file:// pages need an explicit backend origin fallback.
  if (protocol === 'file:') {
    return DEFAULT_PROD_BACKEND_ORIGIN;
  }

  // Hosted frontend domain uses Hugging Face backend by default.
  if (host.endsWith('durgesh.me')) {
    return DEFAULT_PROD_BACKEND_ORIGIN;
  }

  return '';
}

function saveBackendOrigin(origin) {
  const sanitized = sanitizeBackendOrigin(origin);
  if (!sanitized) {
    return '';
  }
  try {
    localStorage.setItem('nextalk_backend_origin', sanitized);
  } catch (error) {
  }
  return sanitized;
}

function promptForBackendOrigin() {
  const message = 'Enter backend URL (example: https://your-backend-domain.com)';
  const input = window.prompt(message, '');
  const sanitized = saveBackendOrigin(input || '');
  if (!sanitized) {
    return '';
  }
  return sanitized;
}

function toApiBase(value) {
  const base = trimTrailingSlash(value);
  if (!base) {
    return '/api';
  }
  return base.endsWith('/api') ? base : `${base}/api`;
}

function resolveApiBase() {
  const configuredOrigin = resolveConfiguredBackendOrigin();
  if (configuredOrigin) {
    return `${configuredOrigin}/api`;
  }

  let configuredBase = '';
  try {
    configuredBase = (window.NEXTALK_API_BASE || '').trim();
  } catch (error) {
    configuredBase = '';
  }

  if (configuredBase) {
    const normalized = toApiBase(configuredBase);
    if (normalized.startsWith('http://') || normalized.startsWith('https://')) {
      try {
        localStorage.setItem('nextalk_backend_origin', normalized.replace(/\/api\/?$/, ''));
      } catch (error) {
      }
    }
    return normalized;
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
window.setNextalkBackendOrigin = saveBackendOrigin;

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
  const executeFetch = async function (baseUrl) {
    return fetch(`${baseUrl}${endpoint}`, {
      ...options,
      headers: buildHeaders(options.headers, isFormData),
    });
  };

  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  let response;
  try {
    response = await executeFetch(API_BASE);
  } catch (error) {
    throw new Error('Cannot reach NexTalk API. Open app with ?backend=https://YOUR-BACKEND-DOMAIN once, then retry.');
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

    // Vercel returns NOT_FOUND when /api is not mapped to backend.
    if (response.status === 404 && /NOT_FOUND/i.test(message) && API_BASE === '/api') {
      const selectedOrigin = promptForBackendOrigin();
      if (selectedOrigin) {
        const retryBase = `${selectedOrigin}/api`;
        const retryResponse = await executeFetch(retryBase);
        const retryText = await retryResponse.text();
        let retryData = {};
        if (retryText) {
          try {
            retryData = JSON.parse(retryText);
          } catch (error) {
            retryData = { message: retryText };
          }
        }
        if (!retryResponse.ok) {
          throw new Error(retryData.message || retryResponse.statusText);
        }
        window.location.reload();
        return retryData;
      }
      throw new Error('Backend URL is not configured. Open app with ?backend=https://YOUR-BACKEND-DOMAIN');
    }

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
