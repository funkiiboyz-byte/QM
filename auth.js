(() => {
  const STORAGE_KEY = 'megaprep-cms-state-v2';
  const SESSION_KEY = 'megaprep-session-v1';

  document.addEventListener('DOMContentLoaded', init);

  function init() {
  const DASHBOARD_URL = 'index.html';
  const CLOUDFLARE_API = (window.MPQM_CLOUDFLARE_API || '').replace(/\/+$/, '');
  const CLOUDFLARE_TOKEN = window.MPQM_CLOUDFLARE_TOKEN || '';

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }

  async function cloudflareRequest(path, { method = 'GET', body } = {}) {
    if (!CLOUDFLARE_API || !CLOUDFLARE_TOKEN) throw new Error('Cloudflare config missing.');
    const response = await fetch(`${CLOUDFLARE_API}${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        'x-admin-token': CLOUDFLARE_TOKEN,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data?.ok === false) throw new Error(data?.error || `Request failed (${response.status})`);
    return data;
  }

  function init() {
    bindSupabaseAuthRedirect();
    redirectIfAdminAlreadyLoggedIn();
    bindAdminLogin();
    bindAdminSignup();
    bindStudentLogin();
    bindStudentSignup();
  }

  function bindAdminLogin() {
    const form = document.getElementById('adminLoginForm');
    if (!form) return;
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const state = getState();
      const email = form.querySelector('input[type="email"]').value.trim();
      const password = form.querySelector('input[type="password"]').value;
      const validCustomAdmin = state.credentials.admins.find((admin) => admin.email === email && admin.password === password);
      if (password !== state.credentials.adminPassword && !validCustomAdmin) {
        return alert('Invalid admin credentials.');
      }
      const session = createSession('admin', email || 'admin');
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
      saveDevice(state, session);
      window.location.href = 'index.html';
  function bindSupabaseAuthRedirect() {
    // no-op for Cloudflare token based backend
  }

  async function redirectIfAdminAlreadyLoggedIn() {
    if (!/admin-login\.html|admin-signup\.html/.test(window.location.pathname)) return;
    const session = getSession();
    if (session?.role === 'admin') window.location.replace(DASHBOARD_URL);
  }

  function bindAdminLogin() {
    const form = document.getElementById('adminLoginForm');
    if (!form) return;
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const submitBtn = form.querySelector('button[type="submit"]');
      if (submitBtn) submitBtn.disabled = true;
      const email = form.querySelector('input[type="email"]').value.trim();
      const password = form.querySelector('input[type="password"]').value;
      const state = getState();
      const validCustomAdmin = state.credentials?.admins?.find((admin) => admin.email === email && admin.password === password);
      if (password !== state.credentials?.adminPassword && !validCustomAdmin) {
        if (submitBtn) submitBtn.disabled = false;
        return alert('Invalid admin credentials.');
      }
      await seedCloudWorkspaceFromLocal(state);
      const session = createSession('admin', email || 'admin');
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
      saveDevice(state, session);
      const profileId = btoa(email.toLowerCase());
      cloudflareRequest('/profiles/upsert', { method: 'POST', body: { id: profileId, role: 'admin', full_name: email.split('@')[0] || 'Admin' } })
        .catch((error) => console.warn('Profile upsert failed:', error?.message || error));
      window.location.replace(DASHBOARD_URL);
    });
  }

  function bindAdminSignup() {
    const form = document.getElementById('adminSignupForm');
    if (!form) return;
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const state = getState();
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const inputs = form.querySelectorAll('input');
      const payload = {
        id: `admin-${Date.now()}`,
        name: inputs[0].value.trim(),
        department: inputs[1].value.trim(),
        email: inputs[2].value.trim(),
        phone: inputs[3].value.trim(),
        password: inputs[4].value,
      };
      state.credentials.admins.push(payload);
      saveState(state);
      alert('Admin account created. Please login.');
      const state = getState();
      state.credentials.admins.push(payload);
      saveState(state);
      const profileId = btoa(payload.email.toLowerCase());
      cloudflareRequest('/profiles/upsert', { method: 'POST', body: { id: profileId, role: 'admin', full_name: payload.name || payload.email.split('@')[0] } })
        .catch((error) => console.warn('Profile upsert failed:', error?.message || error));
      alert('Admin account created. এখন login করুন।');
      window.location.href = 'admin-login.html';
    });
  }

  function bindStudentLogin() {
    const form = document.getElementById('studentLoginForm');
    if (!form) return;
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const state = getState();
      const identifier = form.querySelector('input[type="text"]').value.trim();
      const password = form.querySelector('input[type="password"]').value;
      const valid = state.credentials.students.find((student) => (student.email === identifier || student.studentId === identifier) && student.password === password)
        || state.students.find((student) => (student.email === identifier || student.studentId === identifier));
      if (!valid) return alert('Student account not found.');
      const session = createSession('student', identifier);
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
      saveDevice(state, session);
      window.location.href = 'index.html';
    });
  }

  function bindStudentSignup() {
    const form = document.getElementById('studentSignupForm');
    if (!form) return;
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const state = getState();
      const inputs = form.querySelectorAll('input');
      const payload = {
        id: `student-${Date.now()}`,
        name: inputs[0].value.trim(),
        studentId: inputs[1].value.trim(),
        email: inputs[2].value.trim(),
        mobile: inputs[3].value.trim(),
        course: inputs[4].value.trim(),
        password: inputs[5].value,
        active: true,
      };
      state.credentials.students.push(payload);
      state.students.push({ id: payload.id, name: payload.name, studentId: payload.studentId, email: payload.email, course: payload.course, active: true });
      saveState(state);
      alert('Student account created. Please login.');
      window.location.href = 'student-login.html';
    });
  }

  function createSession(role, identifier) {
    return {
      role,
      identifier,
      deviceId: `${role}-${Math.random().toString(36).slice(2, 8)}`,
      label: role === 'admin' ? 'Admin Browser Session' : 'Student Browser Session',
      createdAt: new Date().toISOString(),
    };
  }

  function saveDevice(state, session) {
    state.devices = state.devices || [];
    state.devices.unshift({
      id: session.deviceId,
      label: session.label,
      browser: navigator.userAgent,
      role: session.role,
      lastActive: new Date().toISOString(),
    });
    saveState(state);
  }

  function getState() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || { credentials: { admins: [], students: [], adminPassword: 'admin1234' }, students: [], devices: [] };
    } catch {
      return { credentials: { admins: [], students: [], adminPassword: 'admin1234' }, students: [], devices: [] };
    }
  }

  function saveState(state) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function buildCloudStateSnapshot(sourceState) {
    const snapshot = JSON.parse(JSON.stringify(sourceState || {}));
    if (Array.isArray(snapshot.attempts)) {
      snapshot.attempts = snapshot.attempts.map((attempt) => ({
        ...attempt,
        omrPreview: '',
        omr_preview: '',
      }));
    }
    let raw = JSON.stringify(snapshot);
    if (raw.length > 2_000_000 && Array.isArray(snapshot.questions)) {
      snapshot.questions = snapshot.questions.map((question) => ({
        ...question,
        image: '',
      }));
    }
    return snapshot;
  }

  async function seedCloudWorkspaceFromLocal(localState) {
    try {
      const payload = await cloudflareRequest('/workspace');
      const row = payload?.data || null;
      const cloudData = row?.workspace_data ? JSON.parse(row.workspace_data) : null;
      const hasCloud = cloudData && Object.keys(cloudData || {}).length;
      if (hasCloud) return;
      const cloudState = buildCloudStateSnapshot(localState);
      await cloudflareRequest('/workspace', {
        method: 'PUT',
        body: {
          workspace_data: cloudState,
          dark_mode: !!cloudState.settings?.darkMode,
          print_config: cloudState.settings?.printConfig || {},
          credentials: cloudState.credentials || {},
        },
      });
    } catch {
      // ignore cloud seed issues
    }
  }

  function ensureScript(src) {
    if (document.querySelector(`script[data-src="${src}"]`)) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.dataset.src = src;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
      document.head.appendChild(script);
    });
  }
})();
