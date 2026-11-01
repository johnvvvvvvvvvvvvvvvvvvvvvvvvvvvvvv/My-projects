// src/room.js
// كائن الغرفة (Durable Object): يحتفظ باتصالات WebSocket ويبثّ الإشارات والأحداث الخفيفة.
// لا يتخذ أي قرار صلاحيات: التحقق يتم في Worker قبل تمرير الاتصال، والبيانات الدائمة في D1.
import { DurableObject } from "cloudflare:workers";

export class Room extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    // رد تلقائي على ping دون إيقاظ الكائن من السبات
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
    this.rl = new WeakMap(); // حد معدل لكل اتصال (في الذاكرة فقط)
  }

  // اتصال WebSocket قادم من Worker بعد التحقق من الجلسة والغرفة؛ الهوية تأتي في ترويسات داخلية
  async fetch(request) {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected WebSocket", { status: 426 });
    }
    const id = parseInt(request.headers.get("x-uid") || "0", 10) || 0;
    let n = "";
    try { n = decodeURIComponent(request.headers.get("x-uname") || ""); } catch (e) {}
    const sh = request.headers.get("x-sh") === "1" ? 1 : 0; // مُخفى (shadow): لا نبثّ كتابته
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    // acceptWebSocket (وليس accept) لتفعيل السبات وتجنب رسوم المدة
    this.ctx.acceptWebSocket(server, id ? ["u" + id] : []); // وسم المستخدم لإشارات موجّهة (رسالة خاصة)
    server.serializeAttachment({ id, n: n.slice(0, 16), sh }); // يبقى بعد السبات
    return new Response(null, { status: 101, webSocket: client });
  }

  // استدعاء RPC من Worker بعد نجاح عملية في D1
  // uid اختياري: يُنبَّه اتصال هذا المستخدم فقط (مثلاً مستلم رسالة خاصة)
  async poke(msg, uid) {
    for (const ws of this.ctx.getWebSockets(uid ? "u" + uid : undefined)) {
      try { ws.send(String(msg)); } catch (e) {}
    }
  }

  // الرسالة الوحيدة المقبولة من العميل: "t" = أنا أكتب الآن (ping يُرَدّ عليه تلقائياً)
  webSocketMessage(ws, message) {
    if (message !== "t") return;
    const now = Date.now();
    let s = this.rl.get(ws);
    if (!s || now - s.w > 10000) { s = { w: now, c: 0, l: 0 }; this.rl.set(ws, s); }
    if (++s.c > 30) { try { ws.close(1008, "rate"); } catch (e) {} return; } // إغراق
    if (now - s.l < 2000) return;
    s.l = now;
    const a = ws.deserializeAttachment();
    if (!a || !a.id || a.sh) return;
    const out = JSON.stringify({ t: "y", id: a.id, n: a.n });
    for (const o of this.ctx.getWebSockets()) {
      if (o !== ws) { try { o.send(out); } catch (e) {} }
    }
  }

  webSocketClose(ws, code, reason) {
    try { ws.close(1000, "closed"); } catch (e) {}
  }

  webSocketError(ws, error) {
    try { ws.close(1011, "error"); } catch (e) {}
  }
}
