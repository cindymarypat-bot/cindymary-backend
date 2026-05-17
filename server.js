// ============================================================
//  CINDYMARY COUTURE — Node.js / Express Backend API
//  npm install express @supabase/supabase-js resend cors dotenv
// ============================================================

require("dotenv").config();
const express   = require("express");
const cors      = require("cors");
const { createClient } = require("@supabase/supabase-js");
const { Resend } = require("resend");

const app  = express();
const PORT = process.env.PORT || 4000;

// ─── CLIENTS ────────────────────────────────────────────────
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY   // service key — never expose to frontend
);
const resend = new Resend(process.env.RESEND_API_KEY);

app.use(cors());
app.use(express.json());

// ─── STAGES (local — won't change) ──────────────────────────
const STAGES = [
  { id:1,  label:"Consultation Booking",        days:1  },
  { id:2,  label:"Consultation Scheduled",      days:2  },
  { id:3,  label:"Consultation Completed",      days:1  },
  { id:4,  label:"Measurements Taken",          days:1  },
  { id:5,  label:"Fabric Sourcing",             days:7  },
  { id:6,  label:"Pattern Drafting",            days:5  },
  { id:7,  label:"Sewing / Production",         days:14 },
  { id:8,  label:"Embellishment & Beading",     days:7  },
  { id:9,  label:"Finishing & Quality Control", days:3  },
  { id:10, label:"Professional Video Review",   days:2  },
  { id:11, label:"Shipping",                    days:5  },
];

// ─── AUTH MIDDLEWARE ─────────────────────────────────────────
async function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "No token" });

  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return res.status(401).json({ error: "Invalid token" });

  req.user = user;
  next();
}

async function requireAdmin(req, res, next) {
  await requireAuth(req, res, async () => {
    const { data } = await supabase
      .from("users")
      .select("role")
      .eq("id", req.user.id)
      .single();

    if (data?.role !== "admin") return res.status(403).json({ error: "Admins only" });
    next();
  });
}

// ─── HELPERS ─────────────────────────────────────────────────
function generateOrderId(count) {
  const year = new Date().getFullYear();
  return `CM-${year}-${String(count + 1).padStart(3, "0")}`;
}

async function sendEmail(to, name, subject, message) {
  try {
    await resend.emails.send({
      from:    "Cindymary Couture <noreply@cindymarycouture.com>",
      to,
      subject,
      html: `
        <div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;color:#1a1a1a">
          <div style="background:#0a0a0a;padding:24px;text-align:center">
            <h1 style="color:#c9a96e;font-weight:300;letter-spacing:4px;font-size:22px;margin:0">
              CINDYMARY COUTURE
            </h1>
          </div>
          <div style="padding:32px;background:#f9f6f0">
            <p style="font-size:16px">Dear ${name},</p>
            <p style="font-size:15px;line-height:1.7;margin:16px 0">${message}</p>
            <div style="margin:28px 0;text-align:center">
              <a href="${process.env.FRONTEND_URL}/dashboard"
                style="background:#c9a96e;color:#0a0a0a;padding:12px 28px;text-decoration:none;
                       font-family:sans-serif;font-size:13px;letter-spacing:1.5px;text-transform:uppercase">
                View Your Dashboard
              </a>
            </div>
            <p style="font-size:12px;color:#888;margin-top:32px">
              Questions? WhatsApp us: +234 706 760 3022<br/>
              Cindymary Couture — Crafted with Love
            </p>
          </div>
        </div>
      `,
    });
  } catch (err) {
    console.error("Email error:", err.message);
  }
}

// ════════════════════════════════════════════════════════════
//  ROUTES
// ════════════════════════════════════════════════════════════

// ── GET /health ──────────────────────────────────────────────
app.get("/health", (_, res) => res.json({ status: "ok", service: "Cindymary Couture API" }));

// ── GET /stages ──────────────────────────────────────────────
app.get("/stages", (_, res) => res.json(STAGES));

// ── GET /orders  (admin: all | client: own) ──────────────────
app.get("/orders", requireAuth, async (req, res) => {
  const { data: userRow } = await supabase
    .from("users").select("role").eq("id", req.user.id).single();

  let query = supabase.from("orders").select(`
    *,
    stage_history ( stage_id, completed_at ),
    delays        ( stage_id, days, reason ),
    notifications ( message, created_at, sent_email )
  `).order("created_at", { ascending: false });

  if (userRow?.role !== "admin") {
    query = query.eq("client_email", req.user.email);
  }

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ── GET /orders/:id ──────────────────────────────────────────
app.get("/orders/:id", requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from("orders")
    .select(`
      *,
      stage_history ( stage_id, completed_at ),
      delays        ( stage_id, days, reason ),
      notifications ( message, created_at, sent_email )
    `)
    .eq("id", req.params.id)
    .single();

  if (error) return res.status(404).json({ error: "Order not found" });
  res.json(data);
});

// ── POST /orders  (admin only) ───────────────────────────────
app.post("/orders", requireAdmin, async (req, res) => {
  const { client_name, client_email, client_phone, garment, location, notes, assigned_to } = req.body;

  if (!client_name || !client_email || !garment || !location) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  // Generate order ID
  const { count } = await supabase.from("orders").select("*", { count:"exact", head:true });
  const id = generateOrderId(count || 0);

  const { data, error } = await supabase.from("orders").insert({
    id, client_name, client_email, client_phone,
    garment, location, notes,
    assigned_to: assigned_to || "Unassigned",
    current_stage: 1,
  }).select().single();

  if (error) return res.status(500).json({ error: error.message });

  // First notification
  await supabase.from("notifications").insert({
    order_id: id,
    message:  "Welcome to Cindymary Couture! Your order has been created.",
  });

  // Welcome email
  await sendEmail(
    client_email, client_name,
    "Welcome to Cindymary Couture ✦",
    `Your order <strong>${id}</strong> for a <em>${garment}</em> has been created.
     We will keep you updated every step of the way.`
  );

  res.status(201).json(data);
});

// ── PATCH /orders/:id/advance  (admin only) ──────────────────
app.patch("/orders/:id/advance", requireAdmin, async (req, res) => {
  const { data: order, error: fetchErr } = await supabase
    .from("orders").select("*").eq("id", req.params.id).single();

  if (fetchErr) return res.status(404).json({ error: "Order not found" });
  if (order.current_stage >= 11) return res.status(400).json({ error: "Already at final stage" });

  const newStage = order.current_stage + 1;
  const stageName = STAGES.find(s => s.id === newStage)?.label;

  // Record completed stage in history
  await supabase.from("stage_history").insert({
    order_id:     order.id,
    stage_id:     order.current_stage,
    completed_at: new Date().toISOString(),
  });

  // Advance order
  await supabase.from("orders")
    .update({ current_stage: newStage, stage_started: new Date().toISOString() })
    .eq("id", order.id);

  // Notification record
  const message = `Your order has moved to: ${stageName}`;
  await supabase.from("notifications").insert({ order_id: order.id, message });

  // Email client
  await sendEmail(
    order.client_email, order.client_name,
    `Update: Your Cindymary Couture Order — ${stageName}`,
    `Great news! Your <em>${order.garment}</em> has progressed to the next stage:
     <br/><br/><strong>${stageName}</strong><br/><br/>
     Log in to your dashboard to see the full timeline.`
  );

  res.json({ success: true, new_stage: newStage, stage_name: stageName });
});

// ── PATCH /orders/:id/delay  (admin only) ────────────────────
app.patch("/orders/:id/delay", requireAdmin, async (req, res) => {
  const { stage_id, days, reason } = req.body;
  if (!stage_id || !days) return res.status(400).json({ error: "stage_id and days required" });

  const { data: order } = await supabase.from("orders").select("*").eq("id", req.params.id).single();
  if (!order) return res.status(404).json({ error: "Order not found" });

  await supabase.from("delays").insert({
    order_id: order.id, stage_id, days, reason, added_by: req.user.id,
  });

  res.json({ success: true, message: `Delay of ${days} day(s) added to stage ${stage_id}` });
});

// ── PATCH /orders/:id/assign  (admin only) ───────────────────
app.patch("/orders/:id/assign", requireAdmin, async (req, res) => {
  const { assigned_to } = req.body;
  if (!assigned_to) return res.status(400).json({ error: "assigned_to required" });

  const { error } = await supabase.from("orders")
    .update({ assigned_to }).eq("id", req.params.id);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true, assigned_to });
});

// ── GET /orders/:id/notifications ────────────────────────────
app.get("/orders/:id/notifications", requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .eq("order_id", req.params.id)
    .order("created_at", { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ── GET /admin/stats  (admin only) ───────────────────────────
app.get("/admin/stats", requireAdmin, async (req, res) => {
  const [total, uk, nigeria, delayed] = await Promise.all([
    supabase.from("orders").select("*", { count:"exact", head:true }),
    supabase.from("orders").select("*", { count:"exact", head:true }).eq("location","UK"),
    supabase.from("orders").select("*", { count:"exact", head:true }).eq("location","Nigeria"),
    supabase.from("delays").select("order_id").then(r => new Set(r.data?.map(d=>d.order_id)).size),
  ]);

  res.json({
    total:    total.count   || 0,
    uk:       uk.count      || 0,
    nigeria:  nigeria.count || 0,
    delayed,
  });
});

// ─── START ───────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`✦ Cindymary Couture API running on port ${PORT}`);
});
