(() => {
  const STORAGE_KEY = 'megaprep-cms-state-v1';
  const SESSION_KEY = 'megaprep-session-v1';

  document.addEventListener('DOMContentLoaded', init);

  function init() {
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
    });
  }

  function bindAdminSignup() {
    const form = document.getElementById('adminSignupForm');
    if (!form) return;
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const state = getState();
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
})();
