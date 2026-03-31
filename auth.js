(() => {
  const STORAGE_KEY = 'megaprep-cms-state-v2';
  const SESSION_KEY = 'megaprep-session-v1';
  const SUPABASE_URL = 'https://qjwwsijubeiimoloeksa.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFqd3dzaWp1YmVpaW1vbG9la3NhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ5NjkyNTgsImV4cCI6MjA5MDU0NTI1OH0.TST4rsA7dM0HYIrgvoq05tZVUWd3RBF7IIYVWLeHbuU';

  document.addEventListener('DOMContentLoaded', () => { init(); });

  async function init() {
    await ensureSupabaseClient();
    bindAdminLogin();
    bindAdminSignup();
    bindStudentLogin();
    bindStudentSignup();
  }

  function bindAdminLogin() {
    const form = document.getElementById('adminLoginForm');
    if (!form) return;
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const supabase = await ensureSupabaseClient();
      const email = form.querySelector('input[type="email"]').value.trim();
      const password = form.querySelector('input[type="password"]').value;
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error || !data?.user) return alert('Invalid admin credentials.');
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', data.user.id).single();
      if (!profile || profile.role !== 'admin') {
        await supabase.auth.signOut();
        return alert('This account is not an admin.');
      }
      const state = getState();
      const session = createSession('admin', email || 'admin');
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
      saveDevice(state, session);
      window.location.href = 'index.html';
    });
  }

  function bindAdminSignup() {
    const form = document.getElementById('adminSignupForm');
    if (!form) return;
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const supabase = await ensureSupabaseClient();
      const inputs = form.querySelectorAll('input');
      const payload = {
        id: `admin-${Date.now()}`,
        name: inputs[0].value.trim(),
        department: inputs[1].value.trim(),
        email: inputs[2].value.trim(),
        phone: inputs[3].value.trim(),
        password: inputs[4].value,
      };
      const { data, error } = await supabase.auth.signUp({ email: payload.email, password: payload.password });
      if (error || !data?.user) return alert(error?.message || 'Failed to create admin account.');
      const state = getState();
      state.credentials.admins.push(payload);
      saveState(state);
      alert('Admin auth account created. Set this user as admin in Supabase profiles table, then login.');
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

  async function ensureSupabaseClient() {
    if (window.__supabaseClient) return window.__supabaseClient;
    await ensureScript('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2');
    if (!window.supabase?.createClient) throw new Error('Supabase SDK failed to load.');
    window.__supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    return window.__supabaseClient;
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
