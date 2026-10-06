import { getStore } from "@netlify/blobs";
import crypto from "node:crypto";

export const config = { path: "/api/*" };

const J = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json", "cache-control": "no-store" } });
const sha = (x) => crypto.createHash("sha256").update(String(x)).digest();
const isAdmin = (req) => { const p = (process.env.ADMIN_PASSWORD || "").trim(); return !!p && crypto.timingSafeEqual(sha((req.headers.get("x-admin-password") || "").trim()), sha(p)); };
const clip = (v, n) => String(v == null ? "" : v).slice(0, n);

export default async (req) => {
  const db = getStore({ name: "chinawalaa", consistency: "strong" });
  const path = new URL(req.url).pathname.replace(/^\/api\/?/, "");
  const m = req.method;
  try {
    // ---------- public ----------
    if (m === "GET" && path === "catalog") return J((await db.get("catalog", { type: "json" })) || {});

    if (m === "GET" && path.startsWith("img/")) {
      const r = await db.getWithMetadata(path, { type: "arrayBuffer" });
      if (!r) return new Response("Not found", { status: 404 });
      return new Response(r.data, { headers: { "content-type": r.metadata?.type || "image/jpeg", "cache-control": "public, max-age=31536000, immutable" } });
    }

    if (m === "POST" && path === "subscribe") {
      const b = await req.json();
      const email = clip(b.email, 120).trim().toLowerCase();
      if (!/^\S+@\S+\.\S+$/.test(email)) return J({ error: "Invalid email" }, 400);
      await db.setJSON("subs/" + sha(email).toString("hex").slice(0, 16), { email, ts: Date.now() });
      return J({ ok: true });
    }

    if (m === "POST" && path === "order") {
      const b = await req.json();
      const name = clip(b.name, 100), phone = clip(b.phone, 30), address = clip(b.address, 400);
      if (!name || !phone || !address || !Array.isArray(b.items) || !b.items.length) return J({ error: "Missing details" }, 400);
      const cat = (await db.get("catalog", { type: "json" })) || {};
      const prods = cat.products || [], site = cat.site || {};
      const pay = b.pay === "online" ? "online" : "cod";
      const delivery = pay === "cod" ? Number(site.delCod ?? 350) : Number(site.delOnline ?? 100);
      let changed = false;
      const items = b.items.slice(0, 50).map((i) => {
        const p = prods.find((x) => String(x.id) === String(i.id));
        const qty = Math.max(1, Math.min(99, parseInt(i.qty) || 1));
        if (p && p.q != null) { p.q = Math.max(0, p.q - qty); changed = true; }
        return { id: i.id, n: p ? p.n : "Unknown item", p: p ? Number(p.p) : 0, qty };
      });
      const itemsTotal = items.reduce((t, i) => t + i.p * i.qty, 0);
      const oid = clip(b.id, 24).replace(/[^A-Za-z0-9-]/g, "") || "CW-" + Date.now().toString(36).toUpperCase();
      const ts = Date.now();
      await db.setJSON(`orders/${String(ts).padStart(14, "0")}-${oid}`, { id: oid, ts, name, phone, address, pay, items, itemsTotal, delivery, total: itemsTotal + delivery, status: "new" });
      if (changed) await db.setJSON("catalog", cat);
      return J({ ok: true, id: oid });
    }

    // ---------- admin ----------
    if (path.startsWith("admin/")) {
      if (!isAdmin(req)) return J({ error: "Wrong password", configured: !!(process.env.ADMIN_PASSWORD || "").trim() }, 401);
      const a = path.slice(6);

      if (a === "ping") return J({ ok: true });

      if (m === "PUT" && a === "catalog") {
        const b = await req.json();
        const old = (await db.get("catalog", { type: "json" })) || {};
        const products = (b.products || []).map((p) => {
          const o = (old.products || []).find((x) => x.id === p.id);
          // stock: apply the admin's change as a +/- delta so orders that arrived meanwhile are not lost
          if (p.q != null && p.q0 != null && o && o.q != null) p.q = Math.max(0, o.q + (p.q - p.q0));
          delete p.q0;
          return p;
        });
        await db.setJSON("catalog", { products, site: b.site || {} });
        return J({ ok: true });
      }

      if (m === "POST" && a === "upload") {
        const b = await req.json();
        const mt = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(b.data || "");
        if (!mt) return J({ error: "Bad image" }, 400);
        const buf = Buffer.from(mt[2], "base64");
        if (buf.length > 2_000_000) return J({ error: "Image too large" }, 400);
        const key = "img/" + crypto.randomBytes(8).toString("hex");
        await db.set(key, buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), { metadata: { type: mt[1] } });
        return J({ url: "/api/" + key });
      }

      if (m === "GET" && a === "orders") {
        const { blobs } = await db.list({ prefix: "orders/" });
        const keys = blobs.map((x) => x.key).sort().reverse().slice(0, 300);
        const orders = await Promise.all(keys.map(async (k) => ({ key: k, ...(await db.get(k, { type: "json" })) })));
        return J({ orders });
      }

      if (m === "POST" && a === "order-status") {
        const b = await req.json();
        if (!String(b.key).startsWith("orders/") || !["new", "confirmed", "paid", "shipped", "delivered", "cancelled"].includes(b.status)) return J({ error: "Bad request" }, 400);
        const o = await db.get(b.key, { type: "json" });
        if (!o) return J({ error: "Not found" }, 404);
        o.status = b.status;
        await db.setJSON(b.key, o);
        return J({ ok: true });
      }

      if (m === "GET" && a === "subscribers") {
        const { blobs } = await db.list({ prefix: "subs/" });
        const subs = await Promise.all(blobs.map((x) => db.get(x.key, { type: "json" })));
        return J({ subs: subs.filter(Boolean).sort((x, y) => y.ts - x.ts) });
      }
    }
    return J({ error: "Not found" }, 404);
  } catch (e) {
    console.error(e);
    return J({ error: "Server error" }, 500);
  }
};
