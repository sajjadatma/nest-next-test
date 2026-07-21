const tokenKey = 'nest-dashboard-token';
let mode = 'register';
const $ = (id) => document.getElementById(id);

function setMode(next) {
  mode = next;
  $('submit').textContent = mode === 'register' ? 'Create account' : 'Sign in';
  $('mode-toggle').textContent = mode === 'register' ? 'Sign in' : 'Create an account';
  document.querySelector('.switch').firstChild.textContent = mode === 'register' ? 'Already registered? ' : 'New here? ';
  $('name').closest('label').hidden = mode === 'login';
  $('form-message').textContent = '';
}
async function request(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  const token = localStorage.getItem(tokenKey);
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`/api${path}`, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(Array.isArray(data.message) ? data.message[0] : data.message || 'Something went wrong');
  return data;
}
function showAuth() { $('auth-view').hidden = false; $('dashboard-view').hidden = true; }
async function showDashboard() {
  const [me, dashboard] = await Promise.all([request('/auth/me'), request('/dashboard')]);
  $('auth-view').hidden = true; $('dashboard-view').hidden = false;
  const displayName = me.name || me.email.split('@')[0];
  $('profile-name').textContent = me.email; $('welcome-name').textContent = displayName;
  $('metrics').innerHTML = dashboard.metrics.map((metric) => `<article class="metric"><p>${metric.label}</p><strong>${metric.value}</strong></article>`).join('');
  $('users').innerHTML = dashboard.recentUsers.map((user) => `<div class="user"><span class="avatar">${(user.name || user.email)[0].toUpperCase()}</span><span><strong>${user.name || 'Unnamed user'}</strong><small>${user.email}</small></span><time>${new Date(user.createdAt).toLocaleDateString()}</time></div>`).join('') || '<p class="muted">No users yet.</p>';
}
$('auth-form').addEventListener('submit', async (event) => {
  event.preventDefault(); $('form-message').textContent = '';
  try {
    const payload = { email: $('email').value, password: $('password').value };
    if (mode === 'register') payload.name = $('name').value;
    const session = await request(`/auth/${mode}`, { method: 'POST', body: JSON.stringify(payload) });
    localStorage.setItem(tokenKey, session.accessToken); await showDashboard();
  } catch (error) { $('form-message').textContent = error.message; }
});
$('mode-toggle').addEventListener('click', () => setMode(mode === 'register' ? 'login' : 'register'));
$('logout').addEventListener('click', () => { localStorage.removeItem(tokenKey); showAuth(); });
if (localStorage.getItem(tokenKey)) showDashboard().catch(() => { localStorage.removeItem(tokenKey); showAuth(); });
