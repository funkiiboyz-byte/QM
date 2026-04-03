export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const method = request.method.toUpperCase();

    if (method === 'OPTIONS') return cors(new Response(null, { status: 204 }));
    if (url.pathname === '/health') return cors(json({ ok: true, service: 'mpqm-worker' }));

    const token = request.headers.get('x-admin-token') || '';
    if (!env.ADMIN_TOKEN || token !== env.ADMIN_TOKEN) {
      return cors(json({ ok: false, error: 'Unauthorized' }, 401));
    }

    if (url.pathname === '/workspace' && method === 'GET') {
      const row = await env.DB.prepare('SELECT id, workspace_data, dark_mode, print_config, credentials, updated_at FROM app_settings WHERE id = 1').first();
      return cors(json({ ok: true, data: row || null }));
    }

    if (url.pathname === '/workspace' && method === 'PUT') {
      const payload = await request.json().catch(() => ({}));
      const workspace = JSON.stringify(payload.workspace_data || {});
      const printConfig = JSON.stringify(payload.print_config || {});
      const credentials = JSON.stringify(payload.credentials || {});
      const darkMode = payload.dark_mode ? 1 : 0;
      await env.DB.prepare(`
        INSERT INTO app_settings (id, workspace_data, dark_mode, print_config, credentials, updated_at)
        VALUES (1, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(id) DO UPDATE SET
          workspace_data = excluded.workspace_data,
          dark_mode = excluded.dark_mode,
          print_config = excluded.print_config,
          credentials = excluded.credentials,
          updated_at = CURRENT_TIMESTAMP
      `).bind(workspace, darkMode, printConfig, credentials).run();
      return cors(json({ ok: true }));
    }

    if (url.pathname === '/profiles/upsert' && method === 'POST') {
      const payload = await request.json().catch(() => ({}));
      if (!payload.id) return cors(json({ ok: false, error: 'id is required' }, 400));
      await env.DB.prepare(`
        INSERT INTO profiles (id, role, full_name, updated_at)
        VALUES (?, COALESCE(?, 'admin'), ?, CURRENT_TIMESTAMP)
        ON CONFLICT(id) DO UPDATE SET
          role = excluded.role,
          full_name = excluded.full_name,
          updated_at = CURRENT_TIMESTAMP
      `).bind(payload.id, payload.role || 'admin', payload.full_name || '').run();
      return cors(json({ ok: true }));
    }

    return cors(json({ ok: false, error: 'Not found' }, 404));
  },
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

function cors(response) {
  const headers = new Headers(response.headers);
  headers.set('access-control-allow-origin', '*');
  headers.set('access-control-allow-methods', 'GET,PUT,POST,OPTIONS');
  headers.set('access-control-allow-headers', 'content-type,x-admin-token');
  return new Response(response.body, { status: response.status, headers });
}
