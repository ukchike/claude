let currentUser = null;

// ---- Router ----
function showPage(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const page = document.getElementById(id);
  if (page) page.classList.add('active');
}

function navigate(path) {
  history.pushState({}, '', path);
  route();
}

function route() {
  const path = location.pathname;
  const loggedIn = API.isLoggedIn();

  if (!loggedIn && (path === '/' || path === '/profile')) {
    showPage('page-login');
    document.getElementById('app-nav').style.display = 'none';
  } else if (path === '/register') {
    showPage('page-register');
    document.getElementById('app-nav').style.display = 'none';
  } else if (path === '/login' || !loggedIn) {
    showPage('page-login');
    document.getElementById('app-nav').style.display = 'none';
  } else if (path === '/profile') {
    document.getElementById('app-nav').style.display = 'flex';
    loadProfile();
  } else {
    navigate(loggedIn ? '/profile' : '/login');
  }
}

// ---- Alerts ----
function showAlert(selector, msg, type = 'error') {
  const el = document.querySelector(selector);
  if (!el) return;
  el.textContent = msg;
  el.className = `alert alert-${type} show`;
  setTimeout(() => el.classList.remove('show'), 4000);
}

// ---- Nav ----
function updateNav(user) {
  const initials = (user.full_name || user.username || '?').charAt(0).toUpperCase();
  const navAvatar = document.getElementById('nav-avatar');
  if (user.avatar_url) {
    navAvatar.innerHTML = `<img src="${user.avatar_url}" alt="${user.username}" style="width:36px;height:36px;border-radius:50%;object-fit:cover;">`;
  } else {
    navAvatar.textContent = initials;
  }
  document.getElementById('nav-username').textContent = `@${user.username}`;
}

// ---- Avatar rendering ----
function renderAvatar(user, size = 96, fontSize = '2rem') {
  const initial = (user.full_name || user.username || '?').charAt(0).toUpperCase();
  if (user.avatar_url) {
    return `<img src="${user.avatar_url}" class="avatar-img" style="width:${size}px;height:${size}px;" alt="${user.username}">`;
  }
  return `<div class="avatar-img" style="width:${size}px;height:${size}px;font-size:${fontSize};background:var(--primary);display:flex;align-items:center;justify-content:center;color:white;border-radius:50%;">${initial}</div>`;
}

// ---- Load Profile ----
async function loadProfile() {
  showPage('page-profile');
  try {
    currentUser = await API.profile.me();
    renderProfile(currentUser);
  } catch (e) {
    if (e.message.includes('401')) { API.clearToken(); navigate('/login'); }
  }
}

function renderProfile(user) {
  updateNav(user);

  // Header
  const joinDate = new Date(user.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  document.getElementById('profile-header').innerHTML = `
    <div class="avatar-wrapper">
      ${renderAvatar(user)}
      <label class="avatar-upload-btn" title="Change avatar" for="avatar-file-input">&#9998;</label>
      <input type="file" id="avatar-file-input" accept="image/*" style="display:none">
    </div>
    <div class="profile-info">
      <div class="profile-name">${user.full_name || user.username}</div>
      <div class="profile-username">@${user.username}</div>
      ${user.bio ? `<div class="profile-bio">${user.bio}</div>` : ''}
      <div class="profile-meta">
        ${user.location ? `<span>&#127759; ${user.location}</span>` : ''}
        ${user.website ? `<span>&#127760; <a href="${user.website}" target="_blank" rel="noopener">${user.website.replace(/^https?:\/\//, '')}</a></span>` : ''}
        ${user.phone ? `<span>&#128222; ${user.phone}</span>` : ''}
        <span>&#128197; Joined ${joinDate}</span>
      </div>
    </div>
  `;

  document.getElementById('avatar-file-input')?.addEventListener('change', handleAvatarUpload);

  // Stats
  const updated = new Date(user.updated_at).toLocaleDateString();
  document.getElementById('profile-stats').innerHTML = `
    <div class="stat-card"><div class="stat-value">${user.id}</div><div class="stat-label">Member #</div></div>
    <div class="stat-card"><div class="stat-value">${joinDate.split(' ')[1]}</div><div class="stat-label">Year Joined</div></div>
    <div class="stat-card"><div class="stat-value">${updated}</div><div class="stat-label">Last Updated</div></div>
  `;

  // Prefill edit form
  document.getElementById('edit-full-name').value = user.full_name || '';
  document.getElementById('edit-bio').value = user.bio || '';
  document.getElementById('edit-phone').value = user.phone || '';
  document.getElementById('edit-location').value = user.location || '';
  document.getElementById('edit-website').value = user.website || '';
}

// ---- Avatar Upload ----
async function handleAvatarUpload(e) {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const res = await API.profile.uploadAvatar(file);
    currentUser.avatar_url = res.avatar_url;
    renderProfile(currentUser);
    showAlert('#edit-alert', 'Avatar updated!', 'success');
  } catch (err) {
    showAlert('#edit-alert', err.message);
  }
}

// ---- Tab switching ----
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const target = btn.dataset.tab;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`tab-${target}`).classList.add('active');
  });
});

// ---- Edit Profile Form ----
document.getElementById('edit-profile-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true;
  try {
    const updated = await API.profile.update({
      full_name: document.getElementById('edit-full-name').value.trim(),
      bio: document.getElementById('edit-bio').value.trim(),
      phone: document.getElementById('edit-phone').value.trim(),
      location: document.getElementById('edit-location').value.trim(),
      website: document.getElementById('edit-website').value.trim(),
    });
    currentUser = updated;
    renderProfile(updated);
    showAlert('#edit-alert', 'Profile updated successfully!', 'success');
  } catch (err) {
    showAlert('#edit-alert', err.message);
  } finally {
    btn.disabled = false;
  }
});

// ---- Change Password Form ----
document.getElementById('password-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const newPass = document.getElementById('new-password').value;
  const confirm = document.getElementById('confirm-password').value;
  if (newPass !== confirm) {
    showAlert('#password-alert', 'Passwords do not match');
    return;
  }
  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true;
  try {
    await API.profile.changePassword({
      current_password: document.getElementById('current-password').value,
      new_password: newPass
    });
    e.target.reset();
    showAlert('#password-alert', 'Password changed successfully!', 'success');
  } catch (err) {
    showAlert('#password-alert', err.message);
  } finally {
    btn.disabled = false;
  }
});

// ---- Delete Account ----
document.getElementById('delete-account-btn')?.addEventListener('click', async () => {
  const pw = prompt('Enter your password to permanently delete your account:');
  if (!pw) return;
  if (!confirm('This action cannot be undone. Are you sure?')) return;
  try {
    await API.profile.deleteAccount({ password: pw });
    API.clearToken();
    navigate('/login');
  } catch (err) {
    showAlert('#danger-alert', err.message);
  }
});

// ---- Logout ----
document.getElementById('logout-btn')?.addEventListener('click', async () => {
  try { await API.auth.logout(); } catch {}
  API.clearToken();
  navigate('/login');
});

// ---- Login Form ----
document.getElementById('login-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true;
  try {
    const res = await API.auth.login({
      email: document.getElementById('login-email').value.trim(),
      password: document.getElementById('login-password').value
    });
    API.setToken(res.token);
    navigate('/profile');
  } catch (err) {
    showAlert('#login-alert', err.message);
  } finally {
    btn.disabled = false;
  }
});

// ---- Register Form ----
document.getElementById('register-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const pw = document.getElementById('reg-password').value;
  const cpw = document.getElementById('reg-confirm').value;
  if (pw !== cpw) { showAlert('#register-alert', 'Passwords do not match'); return; }
  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true;
  try {
    const res = await API.auth.register({
      email: document.getElementById('reg-email').value.trim(),
      username: document.getElementById('reg-username').value.trim(),
      password: pw,
      full_name: document.getElementById('reg-fullname').value.trim()
    });
    API.setToken(res.token);
    navigate('/profile');
  } catch (err) {
    showAlert('#register-alert', err.message);
  } finally {
    btn.disabled = false;
  }
});

// ---- Nav link shortcuts ----
document.getElementById('nav-profile-link')?.addEventListener('click', (e) => {
  e.preventDefault(); navigate('/profile');
});
document.getElementById('go-register')?.addEventListener('click', (e) => {
  e.preventDefault(); navigate('/register');
});
document.getElementById('go-login')?.addEventListener('click', (e) => {
  e.preventDefault(); navigate('/login');
});

window.addEventListener('popstate', route);
route();
