# Cloudflare Worker + D1 scaffold (MPQM)

## 1) Install wrangler
```bash
npm i -g wrangler
wrangler login
```

## 2) Create D1 DB
```bash
wrangler d1 create mpqm1
```
Configured values already set:
- `account_id`: `27e876b1534341f8b0088d0ba21d6a34`
- `database_name`: `mpqm1`
- `database_id`: `0a627255-21ae-42dc-b2a1-75b1ff7c061a`

## 3) Apply schema
```bash
wrangler d1 execute mpqm1 --file=cloudflare/schema.sql
```

## 4) Set admin token secret
```bash
wrangler secret put ADMIN_TOKEN
```
Use this value when prompted:
`9f8a7b6c5d4e3f2a1b0jhjkhkjyfy77665`

## 5) Deploy worker
```bash
cd cloudflare
wrangler deploy
```

## 6) Frontend integration notes
Set these globals in your frontend (before app.js/auth.js):
```html
<script>
  window.MPQM_CLOUDFLARE_API = "https://megaprep-question-maker-project.funkiiboyz.workers.dev";
  window.MPQM_CLOUDFLARE_TOKEN = "9f8a7b6c5d4e3f2a1b0jhjkhkjyfy77665";
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
