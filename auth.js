(() => {
  const STORAGE_KEY = 'megaprep-cms-state-v2';
  const SESSION_KEY = 'megaprep-session-v1';
  const DASHBOARD_URL = 'index.html';
  const SUPABASE_URL = 'https://qjwwsijubeiimoloeksa.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFqd3dzaWp1YmVpaW1vbG9la3NhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ5NjkyNTgsImV4cCI6MjA5MDU0NTI1OH0.TST4rsA7dM0HYIrgvoq05tZVUWd3RBF7IIYVWLeHbuU';

  document.addEventListener('DOMContentLoaded', () => { init(); });

  async function waitForSession(supabase, retries = 5, delayMs = 200) {
    for (let attempt = 0; attempt < retries; attempt += 1) {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) return session;
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
    ensureSupabaseClient()
      .then((supabase) => {
        const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
          if (event === 'SIGNED_IN' && session?.user) {
            window.location.replace(DASHBOARD_URL);
          }
        });
        window.addEventListener('beforeunload', () => authListener?.subscription?.unsubscribe(), { once: true });
      })
      .catch(() => {
        // ignore listener wiring failure
      });
  }

  async function redirectIfAdminAlreadyLoggedIn() {
    if (!/admin-login\.html|admin-signup\.html/.test(window.location.pathname)) return;
    try {
      const supabase = await ensureSupabaseClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', session.user.id).maybeSingle();
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
      let supabase;
      try {
        supabase = await ensureSupabaseClient();
      } catch {
        if (submitBtn) submitBtn.disabled = false;
        return alert('Supabase সংযোগ হচ্ছে না। Admin login এর জন্য internet/Supabase connection লাগবে।');
      }
      const email = form.querySelector('input[type="email"]').value.trim();
      const password = form.querySelector('input[type="password"]').value;
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      console.log('Admin login response:', {
        hasUser: !!data?.user,
        hasSession: !!data?.session,
        error: error?.message || null,
      });
      if (error || !data?.user) {
        if (submitBtn) submitBtn.disabled = false;
        return alert('Invalid admin credentials.');
      }
      window.location.href = DASHBOARD_URL;
      const authSession = await waitForSession(supabase);
      if (!authSession?.user) {
        if (submitBtn) submitBtn.disabled = false;
        return alert('Login session তৈরি হচ্ছে না। আবার login দিন।');
      }
      const { error: profileError } = await supabase.from('profiles').upsert({
        id: authSession.user.id,
        role: 'admin',
        full_name: email.split('@')[0] || 'Admin',
      });
      if (profileError) {
        console.warn('Profile upsert failed, continuing with active Supabase session:', profileError.message || profileError);
      }
      const state = getState();
      await seedCloudWorkspaceFromLocal(supabase, state);
      const session = createSession('admin', email || 'admin');
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
      saveDevice(state, session);
      window.location.replace(DASHBOARD_URL);
    });
  }

  function bindAdminSignup() {
    const form = document.getElementById('adminSignupForm');
    if (!form) return;
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      let supabase;
      try {
        supabase = await ensureSupabaseClient();
      } catch {
        return alert('Supabase সংযোগ হচ্ছে না। কিছুক্ষণ পর আবার চেষ্টা করুন।');
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

  async function seedCloudWorkspaceFromLocal(supabase, localState) {
    try {
      const { data } = await supabase.from('app_settings').select('workspace_data').eq('id', 1).maybeSingle();
      const hasCloud = data?.workspace_data && Object.keys(data.workspace_data || {}).length;
      if (hasCloud) return;
      await supabase.from('app_settings').upsert({
        id: 1,
        workspace_data: localState,
        dark_mode: !!localState.settings?.darkMode,
        print_config: localState.settings?.printConfig || {},
        credentials: localState.credentials || {},
      });
    } catch {
      // ignore cloud seed issues
    }
  }

  async function ensureSupabaseClient() {
    if (window.__supabaseClient) return window.__supabaseClient;
    await ensureScript('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2');
    if (!window.supabase?.createClient) throw new Error('Supabase SDK failed to load.');
    window.__supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
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
