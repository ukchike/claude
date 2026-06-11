const API = (() => {
  const BASE = '/api';

  function getToken() { return localStorage.getItem('token'); }
  function setToken(t) { localStorage.setItem('token', t); }
  function clearToken() { localStorage.removeItem('token'); }

  async function request(method, path, body, isFormData = false) {
    const headers = {};
    const token = getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (!isFormData) headers['Content-Type'] = 'application/json';

    const res = await fetch(BASE + path, {
      method,
      headers,
      body: isFormData ? body : (body ? JSON.stringify(body) : undefined)
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  }

  return {
    getToken, setToken, clearToken,
    isLoggedIn: () => !!getToken(),

    auth: {
      register: (d) => request('POST', '/auth/register', d),
      login: (d) => request('POST', '/auth/login', d),
      logout: () => request('POST', '/auth/logout'),
      logoutAll: () => request('POST', '/auth/logout-all'),
    },

    profile: {
      me: () => request('GET', '/profile/me'),
      update: (d) => request('PATCH', '/profile/me', d),
      changePassword: (d) => request('PUT', '/profile/me/password', d),
      deleteAccount: (d) => request('DELETE', '/profile/me', d),
      uploadAvatar: (file) => {
        const fd = new FormData();
        fd.append('avatar', file);
        return request('POST', '/profile/me/avatar', fd, true);
      },
      removeAvatar: () => request('DELETE', '/profile/me/avatar'),
      getPublic: (username) => request('GET', `/profile/${username}`),
    }
  };
})();
