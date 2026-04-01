(() => {
  const STORAGE_KEY = 'megaprep-cms-state-v2';
  const SESSION_KEY = 'megaprep-session-v1';
  const DASHBOARD_URL = 'index.html';
  const FIREBASE_CONFIG = window.MPQM_FIREBASE_CONFIG || {
    apiKey: '',
    authDomain: '',
    projectId: '',
    storageBucket: '',
    messagingSenderId: '',
    appId: '',
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }

  async function waitForSession(auth, retries = 5, delayMs = 200) {
    for (let attempt = 0; attempt < retries; attempt += 1) {
      const user = auth.currentUser;
      if (user) return user;
      if (attempt < retries - 1) await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    return null;
  }

  function init() {
    bindSupabaseAuthRedirect();
    redirectIfAdminAlreadyLoggedIn();
    bindAdminLogin();
    bindAdminSignup();
    bindStudentLogin();
    bindStudentSignup();
  }

  function bindSupabaseAuthRedirect() {
    if (!/admin-login\.html|admin-signup\.html/.test(window.location.pathname)) return;
    ensureFirebaseClient()
      .then(({ auth }) => {
        const unsubscribe = auth.onAuthStateChanged((user) => {
          if (user) window.location.replace(DASHBOARD_URL);
        });
        window.addEventListener('beforeunload', () => unsubscribe?.(), { once: true });
      })
      .catch(() => {
        // ignore listener wiring failure
      });
  }

  async function redirectIfAdminAlreadyLoggedIn() {
    if (!/admin-login\.html|admin-signup\.html/.test(window.location.pathname)) return;
    try {
      const { auth, db } = await ensureFirebaseClient();
      const user = auth.currentUser;
      if (!user) return;
      const profileDoc = await db.collection('profiles').doc(user.uid).get();
      const profile = profileDoc.exists ? profileDoc.data() : null;
      if (profile?.role === 'admin') window.location.replace(DASHBOARD_URL);
    } catch {
      // ignore
    }
  }

  function bindAdminLogin() {
    const form = document.getElementById('adminLoginForm');
    if (!form) return;
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const submitBtn = form.querySelector('button[type="submit"]');
      if (submitBtn) submitBtn.disabled = true;
      let firebaseClient;
      try {
        firebaseClient = await ensureFirebaseClient();
      } catch {
        if (submitBtn) submitBtn.disabled = false;
        return alert('Firebase সংযোগ হচ্ছে না। Admin login এর জন্য internet লাগবে।');
      }
      const email = form.querySelector('input[type="email"]').value.trim();
      const password = form.querySelector('input[type="password"]').value;
      let credential;
      try {
        credential = await firebaseClient.auth.signInWithEmailAndPassword(email, password);
      } catch (error) {
        if (submitBtn) submitBtn.disabled = false;
        return alert('Invalid admin credentials.');
      }
      const user = credential?.user || null;
      console.log('Admin login response:', { hasUser: !!user, error: null });
      const state = getState();
      await seedCloudWorkspaceFromLocal(firebaseClient, state);
      const session = createSession('admin', email || 'admin');
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
      saveDevice(state, session);
      const authUser = await waitForSession(firebaseClient.auth);
      if (authUser) {
        firebaseClient.db.collection('profiles').doc(authUser.uid).set({
          role: 'admin',
          full_name: email.split('@')[0] || 'Admin',
          updated_at: new Date().toISOString(),
        }, { merge: true }).catch((profileError) => {
          console.warn('Profile upsert failed, continuing with active session:', profileError?.message || profileError);
        });
      }
      window.location.replace(DASHBOARD_URL);
    });
  }

  function bindAdminSignup() {
    const form = document.getElementById('adminSignupForm');
    if (!form) return;
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      let firebaseClient;
      try {
        firebaseClient = await ensureFirebaseClient();
      } catch {
        return alert('Firebase সংযোগ হচ্ছে না। কিছুক্ষণ পর আবার চেষ্টা করুন।');
      }
      const inputs = form.querySelectorAll('input');
      const payload = {
        id: `admin-${Date.now()}`,
        name: inputs[0].value.trim(),
        department: inputs[1].value.trim(),
        email: inputs[2].value.trim(),
        phone: inputs[3].value.trim(),
        password: inputs[4].value,
      };
      try {
        await firebaseClient.auth.createUserWithEmailAndPassword(payload.email, payload.password);
      } catch (error) {
        return alert(error?.message || 'Failed to create admin account.');
      }
      const state = getState();
      state.credentials.admins.push(payload);
      saveState(state);
      alert('Admin account created in Firebase Auth. এখন login করুন।');
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

  async function seedCloudWorkspaceFromLocal(firebaseClient, localState) {
    try {
      const doc = await firebaseClient.db.collection('app_settings').doc('workspace').get();
      const cloudData = doc.exists ? (doc.data()?.workspace_data || null) : null;
      const hasCloud = cloudData && Object.keys(cloudData || {}).length;
      if (hasCloud) return;
      const cloudState = buildCloudStateSnapshot(localState);
      await firebaseClient.db.collection('app_settings').doc('workspace').set({
        workspace_data: cloudState,
        dark_mode: !!cloudState.settings?.darkMode,
        print_config: cloudState.settings?.printConfig || {},
        credentials: cloudState.credentials || {},
        updated_at: new Date().toISOString(),
      }, { merge: true });
    } catch {
      // ignore cloud seed issues
    }
  }

  async function ensureFirebaseClient() {
    if (window.__firebaseClient) return window.__firebaseClient;
    await ensureScript('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
    await ensureScript('https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js');
    await ensureScript('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js');
    if (!window.firebase?.initializeApp) throw new Error('Firebase SDK failed to load.');
    if (!FIREBASE_CONFIG.apiKey || !FIREBASE_CONFIG.projectId) throw new Error('Firebase config missing. Set window.MPQM_FIREBASE_CONFIG.');
    const app = window.firebase.apps?.length ? window.firebase.app() : window.firebase.initializeApp(FIREBASE_CONFIG);
    window.__firebaseClient = { app, auth: window.firebase.auth(), db: window.firebase.firestore() };
    return window.__firebaseClient;
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
