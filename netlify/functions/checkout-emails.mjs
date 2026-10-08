// Stores customer emails typed at checkout so they can be used for promotions.
// Routes:
//   POST   /api/checkout-email          (public, called by the shop at checkout)
//   GET    /api/admin/checkout-emails   (admin only)
//   DELETE /api/admin/checkout-emails   (admin only, body: {email})
import { getStore } from "@netlify/blobs";

const J = (o, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json" } });
const OK = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const clip = (v, n) => String(v || "").slice(0, n);

export default async (req) => {
  const store = getStore("checkout-emails");
  const path = new URL(req.url).pathname;

  if (path.endsWith("/api/checkout-email") && req.method === "POST") {
    const b = await req.json().catch(() => ({}));
    const email = clip(b.email, 200).trim().toLowerCase();
    if (!OK.test(email)) return J({ error: "Invalid email" }, 400);
    const old = await store.get(email, { type: "json" }).catch(() => null);
    await store.setJSON(email, {
      email,
      name: clip(b.name, 100),
      phone: clip(b.phone, 20),
      orderId: clip(b.orderId, 40),
      ts: old?.ts || Date.now(), // first time we saw this email
    });
    return J({ ok: true });
  }

  if (path.endsWith("/api/admin/checkout-emails")) {
    const pw = process.env.ADMIN_PASSWORD;
    if (!pw) return J({ configured: false }, 401);
    if (req.headers.get("x-admin-password") !== pw) return J({ configured: true }, 401);

    if (req.method === "GET") {
      const { blobs } = await store.list();
      const emails = (await Promise.all(blobs.map((x) => store.get(x.key, { type: "json" })))).filter(Boolean);
      return J({ emails });
    }
    if (req.method === "DELETE") {
      const b = await req.json().catch(() => ({}));
      await store.delete(clip(b.email, 200).trim().toLowerCase());
      return J({ ok: true });
    }
  }
  return J({ error: "Not found" }, 404);
};

export const config = { path: ["/api/checkout-email", "/api/admin/checkout-emails"] };
