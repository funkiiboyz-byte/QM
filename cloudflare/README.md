# Cloudflare Worker + D1 scaffold (MPQM)

## 1) Install wrangler
```bash
npm i -g wrangler
wrangler login
```

## 2) Create D1 DB
```bash
wrangler d1 create mpqm-db
```
Copy returned `database_id` into `cloudflare/wrangler.toml`.

## 3) Apply schema
```bash
wrangler d1 execute mpqm-db --file=cloudflare/schema.sql
```

## 4) Set admin token secret
```bash
wrangler secret put ADMIN_TOKEN
```
(Set a strong random token)

## 5) Deploy worker
```bash
cd cloudflare
wrangler deploy
```

## 6) Frontend integration notes
Set these globals in your frontend (before app.js/auth.js):
```html
<script>
  window.MPQM_CLOUDFLARE_API = "https://your-worker.your-subdomain.workers.dev";
  window.MPQM_CLOUDFLARE_TOKEN = "YOUR_ADMIN_TOKEN";
</script>
```

Then replace Firebase read/write calls with:
- `GET /workspace`
- `PUT /workspace`
- `POST /profiles/upsert`

## Endpoints
- `GET /health` (public)
- `GET /workspace` (protected)
- `PUT /workspace` (protected)
- `POST /profiles/upsert` (protected)
