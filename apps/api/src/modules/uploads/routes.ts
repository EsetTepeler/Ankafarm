import { createReadStream } from "node:fs";
import { mkdir, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import { allowedAttachmentMimes, MAX_ATTACHMENT_BYTES } from "@anka/shared";
import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";

import type { TokenService } from "../../auth/tokens";
import type { Db } from "../../db/client";
import { attachments } from "../../db/schema";

const extensions: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" };

/**
 * Dosya uçları tRPC dışında: ikili veri superjson'dan geçmemeli.
 * Künye `attachments` tablosunda senkron olur; buradaki uçlar yalnızca baytları taşır.
 */
export function registerUploadRoutes(app: FastifyInstance, db: Db, tokens: TokenService, uploadsDir: string) {
  // Ham gövdeyi olduğu gibi al; JSON ayrıştırıcısı devreye girmesin.
  app.addContentTypeParser(allowedAttachmentMimes as unknown as string[], { parseAs: "buffer", bodyLimit: MAX_ATTACHMENT_BYTES }, (_req, body, done) => done(null, body));

  const authenticate = async (header: string | undefined) => {
    if (!header?.startsWith("Bearer ")) return null;
    return tokens.verifyAccessToken(header.slice("Bearer ".length));
  };

  app.put<{ Params: { id: string } }>("/uploads/:id", async (req, reply) => {
    const user = await authenticate(req.headers.authorization);
    if (!user) return reply.code(401).send({ error: "Oturum gerekli" });

    const mime = (req.headers["content-type"] ?? "").split(";")[0]!.trim();
    if (!(allowedAttachmentMimes as readonly string[]).includes(mime)) return reply.code(415).send({ error: "Desteklenmeyen dosya türü" });

    const body = req.body as Buffer;
    if (!Buffer.isBuffer(body) || body.length === 0) return reply.code(400).send({ error: "Dosya boş" });
    if (body.length > MAX_ATTACHMENT_BYTES) return reply.code(413).send({ error: "Dosya çok büyük" });

    const [row] = await db
      .select()
      .from(attachments)
      .where(and(eq(attachments.id, req.params.id), eq(attachments.farmId, user.farmId)))
      .limit(1);
    // Künye senkronla gelmemiş olabilir; istemci push'u tamamlayınca tekrar dener.
    if (!row) return reply.code(404).send({ error: "Ek kaydı bulunamadı" });
    if (row.deletedAt) return reply.code(410).send({ error: "Ek silinmiş" });

    const dir = path.join(uploadsDir, user.farmId);
    await mkdir(dir, { recursive: true });
    const filename = `${row.id}.${extensions[mime] ?? "bin"}`;
    await writeFile(path.join(dir, filename), body);

    const storagePath = `${user.farmId}/${filename}`;
    await db.update(attachments).set({ storagePath, mime, size: body.length }).where(eq(attachments.id, row.id));
    return { storagePath, size: body.length };
  });

  app.get<{ Params: { id: string }; Querystring: { token?: string } }>("/uploads/:id", async (req, reply) => {
    // Görseller <img> ile de çekilebilsin diye token sorgu dizesinden de kabul edilir.
    const user = (await authenticate(req.headers.authorization)) ?? (req.query.token ? await tokens.verifyAccessToken(req.query.token) : null);
    if (!user) return reply.code(401).send({ error: "Oturum gerekli" });

    const [row] = await db
      .select()
      .from(attachments)
      .where(and(eq(attachments.id, req.params.id), eq(attachments.farmId, user.farmId)))
      .limit(1);
    if (!row?.storagePath || row.deletedAt) return reply.code(404).send({ error: "Dosya yok" });

    const file = path.join(uploadsDir, row.storagePath);
    const info = await stat(file).catch(() => null);
    if (!info) return reply.code(404).send({ error: "Dosya yok" });

    // Web sayfası COEP require-corp ile geliyor; başka origin'den gelen görsel bu başlık olmadan çizilmez.
    reply.header("Cross-Origin-Resource-Policy", "cross-origin");
    reply.header("Cache-Control", "private, max-age=31536000, immutable");
    reply.type(row.mime);
    return reply.send(createReadStream(file));
  });

  /** Ek silinince dosyayı da bırak; künye soft delete ile senkronda kalır. */
  app.delete<{ Params: { id: string } }>("/uploads/:id", async (req, reply) => {
    const user = await authenticate(req.headers.authorization);
    if (!user) return reply.code(401).send({ error: "Oturum gerekli" });
    const [row] = await db
      .select()
      .from(attachments)
      .where(and(eq(attachments.id, req.params.id), eq(attachments.farmId, user.farmId)))
      .limit(1);
    if (!row?.storagePath) return { ok: true };
    await unlink(path.join(uploadsDir, row.storagePath)).catch(() => undefined);
    await db.update(attachments).set({ storagePath: null }).where(eq(attachments.id, row.id));
    return { ok: true };
  });
}
