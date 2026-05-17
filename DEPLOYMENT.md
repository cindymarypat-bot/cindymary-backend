# Cindymary Couture — Deployment Guide

## Folder Structure
```
cindymary/
├── frontend/          ← React app (cindymary-couture.jsx → src/App.jsx)
│   └── package.json
├── backend/
│   ├── server.js      ← Node/Express API
│   ├── package.json
│   └── .env           ← Your secrets (never commit this)
└── database/
    └── schema.sql     ← Run once in Supabase SQL Editor
```

---

## Step 1 — Supabase (Database + Auth)

1. Go to https://supabase.com → New Project
2. Copy your **Project URL** and **service_role key** (Project Settings → API)
3. Go to **SQL Editor** → paste the full contents of `schema.sql` → Run
4. Go to **Authentication → Providers** → ensure Email is enabled
5. Create your admin user:
   - Authentication → Users → Invite User
   - Email: admin@cindymarycouture.com
   - Then in SQL Editor run:
     ```sql
     INSERT INTO users (id, email, name, role)
     VALUES ('paste-the-auth-uuid-here', 'admin@cindymarycouture.com', 'Admin', 'admin');
     ```

---

## Step 2 — Backend (Railway)

1. Go to https://railway.app → New Project → Deploy from GitHub
2. Push your `backend/` folder to a GitHub repo
3. Add environment variables in Railway dashboard (copy from .env.example)
4. Railway gives you a URL like: `https://cindymary-api.railway.app`

---

## Step 3 — Frontend (Vercel)

1. Create a React app: `npx create-react-app cindymary-frontend`
2. Replace `src/App.jsx` with the provided `cindymary-couture.jsx`
3. Create `src/api.js` (see below)
4. Push to GitHub → go to https://vercel.com → Import repo → Deploy
5. Add environment variable in Vercel:
   `REACT_APP_API_URL=https://your-railway-url.railway.app`

### src/api.js — connect frontend to backend
```js
const BASE = process.env.REACT_APP_API_URL;

export async function getOrders(token) {
  const r = await fetch(`${BASE}/orders`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return r.json();
}

export async function advanceStage(orderId, token) {
  const r = await fetch(`${BASE}/orders/${orderId}/advance`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}` }
  });
  return r.json();
}

export async function createOrder(data, token) {
  const r = await fetch(`${BASE}/orders`, {
    method: "POST",
    headers: { "Content-Type":"application/json", Authorization:`Bearer ${token}` },
    body: JSON.stringify(data)
  });
  return r.json();
}
```

---

## Step 4 — Domain (Namecheap)

1. Buy `cindymarycouture.com` at https://namecheap.com (~£12/yr)
2. In Vercel → your project → Settings → Domains → Add `cindymarycouture.com`
3. Vercel gives you DNS records → copy them into Namecheap DNS settings
4. Wait 10–30 minutes → site is live at your domain

---

## Step 5 — Resend (Email)

1. Go to https://resend.com → Sign up free
2. Add your domain: `cindymarycouture.com` → verify DNS records
3. Create an API key → paste into Railway environment variable `RESEND_API_KEY`

---

## API Endpoints Summary

| Method | Endpoint                    | Auth    | Description              |
|--------|-----------------------------|---------|--------------------------|
| GET    | /health                     | None    | Health check             |
| GET    | /stages                     | None    | All 11 production stages |
| GET    | /orders                     | Client+ | Get orders (filtered)    |
| GET    | /orders/:id                 | Client+ | Single order details     |
| POST   | /orders                     | Admin   | Create new order         |
| PATCH  | /orders/:id/advance         | Admin   | Advance to next stage    |
| PATCH  | /orders/:id/delay           | Admin   | Add delay to a stage     |
| PATCH  | /orders/:id/assign          | Admin   | Assign tailor            |
| GET    | /orders/:id/notifications   | Client+ | Order notifications      |
| GET    | /admin/stats                | Admin   | Dashboard statistics     |

---

## Estimated Monthly Cost at Scale

| Service   | Free Tier Limit           | Paid (if you exceed) |
|-----------|---------------------------|----------------------|
| Supabase  | 50,000 rows, 500MB        | $25/mo               |
| Railway   | $5 credit/mo              | ~$5-10/mo            |
| Vercel    | Unlimited hobby projects  | $20/mo (Pro)         |
| Resend    | 3,000 emails/mo           | $20/mo               |
| Domain    | —                         | ~£12/yr              |

**Total to start: £12/year. Paid tier if you grow: ~£50–60/month.**
