// Receives customer orders and lets the admin panel read them.
//   POST /api/order                (public, from the shop checkout)
//   GET  /api/admin/orders         (admin only)
//   POST /api/admin/order-status   (admin only, body: {key,status})
// Also reachable at /.netlify/functions/order
import { getStore } from "@netlify/blobs";

const J = (o, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json" } });
const clip = (v, n) => String(v == null ? "" : v).slice(0, n);
const STATUSES = ["new", "confirmed", "paid", "shipped", "delivered", "cancelled"];

export default async (req) => {
  const store = getStore("orders");
  const path = new URL(req.url).pathname;

  // ---------- customer places an order ----------
  if (req.method === "POST" && /\/(api\/order|functions\/order)$/.test(path)) {
    const b = await req.json().catch(() => null);
    if (!b) return J({ error: "Bad request" }, 400);
    const id = clip(b.id, 40);
    const name = clip(b.name, 100).trim();
    const phone = clip(b.phone, 20).replace(/\D/g, "");
    const address = clip(b.address, 500).trim();
    const pay = b.pay === "online" ? "online" : "cod";
    if (!/^CW-[A-Z0-9]+$/.test(id) || !name || !phone || !address) return J({ error: "Missing details" }, 400);
    if (!Array.isArray(b.items) || !b.items.length || b.items.length > 50) return J({ error: "No items" }, 400);

    const items = b.items.map((i) => ({
      id: clip(i.id, 20),
      n: clip(i.n, 150),
      p: Math.max(0, Math.round(+i.p || 0)),
      qty: Math.min(99, Math.max(1, parseInt(i.qty) || 1)),
    }));
    const itemsTotal = items.reduce((t, i) => t + i.p * i.qty, 0);
    const delivery = Math.min(5000, Math.max(0, Math.round(+b.delivery || 0)));

    if (await store.get(id).catch(() => null)) return J({ ok: true, id }); // retry of same order
    await store.setJSON(id, {
      key: id, id, ts: Date.now(), status: "new",
      name, phone, email: clip(b.email, 200).toLowerCase(), address, pay,
      items, itemsTotal, delivery, total: itemsTotal + delivery,
    });
    return J({ ok: true, id });
  }

  // ---------- admin ----------
  if (/\/api\/admin\/(orders|order-status)$/.test(path)) {
    const pw = process.env.ADMIN_PASSWORD;
    if (!pw) return J({ configured: false }, 401);
    if (req.headers.get("x-admin-password") !== pw) return J({ configured: true }, 401);

    if (req.method === "GET" && path.endsWith("/orders")) {
      const { blobs } = await store.list();
      const orders = (await Promise.all(blobs.map((x) => store.get(x.key, { type: "json" })))).filter(Boolean);
      orders.sort((a, b) => b.ts - a.ts);
      return J({ orders });
    }
    if (req.method === "POST" && path.endsWith("/order-status")) {
      const b = await req.json().catch(() => ({}));
      const o = await store.get(clip(b.key, 40), { type: "json" }).catch(() => null);
      if (!o || !STATUSES.includes(b.status)) return J({ error: "Not found" }, 404);
      o.status = b.status;
      await store.setJSON(o.key, o);
      return J({ ok: true });
    }
  }
  return J({ error: "Not found" }, 404);
};

export const config = { path: ["/api/order", "/api/admin/orders", "/api/admin/order-status"] };
