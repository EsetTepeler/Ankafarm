import { attachmentInputSchema, MAX_ATTACHMENT_BYTES, type AttachmentKind } from "@anka/shared";
import { useQuery } from "@tanstack/react-query";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { useEffect, useState } from "react";

import { getDb, withLocalTransaction } from "@/db";
import { attachments, uploadQueue, type LocalAttachment } from "@/db/schema";
import { base64ToBlob, prepareFile } from "@/features/attachments/image";
import { useAuthStore } from "@/lib/auth";
import { getApiUrl } from "@/lib/config";
import { newId, nowIso } from "@/lib/ids";
import { localKey, notifyLocalChange } from "@/sync/events";
import { insertLocal, softDeleteLocal } from "@/sync/local";
import { scheduleSync } from "@/sync/worker";

export type AttachmentEntity = "animals" | "health_records" | "expenses" | "purchases" | "observations";

export function useAttachments(entityTable: AttachmentEntity, entityId: string | undefined) {
  return useQuery({
    queryKey: localKey("attachments", entityTable, entityId ?? ""),
    enabled: !!entityId,
    queryFn: () =>
      getDb()
        .select()
        .from(attachments)
        .where(and(isNull(attachments.deletedAt), eq(attachments.entityTable, entityTable), eq(attachments.entityId, entityId!)))
        .orderBy(desc(attachments.createdAt)),
  });
}

/** Yüklenmeyi bekleyen dosyalar; Senkron ekranında gösterilir. */
export function usePendingUploads() {
  return useQuery({
    queryKey: localKey("attachments", "queue"),
    queryFn: () => getDb().select({ attachmentId: uploadQueue.attachmentId, status: uploadQueue.status, attempts: uploadQueue.attempts, lastError: uploadQueue.lastError }).from(uploadQueue).orderBy(asc(uploadQueue.createdAt)),
  });
}

/**
 * Dosya ekle: görsel küçültülür, künye senkron kuyruğuna, baytlar yerel yükleme kuyruğuna girer.
 * İkisi tek işlemde yazılır; bağlantı gelince önce künye push edilir, sonra dosya yüklenir.
 */
export async function addAttachment(input: { entityTable: AttachmentEntity; entityId: string; kind?: AttachmentKind; file: File; caption?: string | null }): Promise<string> {
  const prepared = await prepareFile(input.file);
  if (prepared.size > MAX_ATTACHMENT_BYTES) throw new Error("Dosya çok büyük, 8 MB sınırını aşıyor");
  const parsed = attachmentInputSchema.parse({
    id: newId(),
    entityTable: input.entityTable,
    entityId: input.entityId,
    kind: input.kind ?? (prepared.mime.startsWith("image/") ? "photo" : "document"),
    mime: prepared.mime,
    size: prepared.size,
    caption: input.caption ?? null,
    storagePath: null,
  });

  const id = await insertLocal("attachments", {
    entityTable: parsed.entityTable,
    entityId: parsed.entityId,
    kind: parsed.kind,
    mime: parsed.mime,
    size: parsed.size,
    caption: parsed.caption ?? null,
    storagePath: null,
  });
  await getDb().insert(uploadQueue).values({ attachmentId: id, mime: prepared.mime, data: prepared.data, createdAt: nowIso(), status: "pending", attempts: 0 });
  notifyLocalChange(["attachments"]);
  scheduleSync("upload", 0);
  return id;
}

export async function deleteAttachment(id: string) {
  await withLocalTransaction(async (tx) => {
    await tx.delete(uploadQueue).where(eq(uploadQueue.attachmentId, id));
  });
  await softDeleteLocal("attachments", id, "ek silindi");
  // Sunucudaki dosyayı da bırak; künye soft delete olarak senkronda kalır.
  const token = useAuthStore.getState().accessToken;
  if (token) {
    await fetch(`${getApiUrl()}/uploads/${id}`, { method: "DELETE", headers: { authorization: `Bearer ${token}` } }).catch(() => undefined);
  }
}

const urlCache = new Map<string, string>();

/**
 * Ekin görüntülenebilir adresi: yüklendiyse sunucudan (yetkili istekle indirilip blob adresine çevrilir),
 * yüklenmediyse cihazdaki kopyadan. Böylece çevrimdışı çekilen fotoğraf hemen görünür.
 */
export function useAttachmentUrl(attachment: LocalAttachment | null): string | null {
  const [url, setUrl] = useState<string | null>(() => (attachment ? (urlCache.get(attachment.id) ?? null) : null));

  useEffect(() => {
    if (!attachment) {
      setUrl(null);
      return;
    }
    const cached = urlCache.get(attachment.id);
    if (cached) {
      setUrl(cached);
      return;
    }
    let cancelled = false;
    void (async () => {
      const db = getDb();
      const [local] = await db.select({ data: uploadQueue.data, mime: uploadQueue.mime }).from(uploadQueue).where(eq(uploadQueue.attachmentId, attachment.id)).limit(1);
      let blob: Blob | null = local ? base64ToBlob(local.data, local.mime) : null;
      if (!blob && attachment.storagePath) {
        const token = useAuthStore.getState().accessToken;
        const res = await fetch(`${getApiUrl()}/uploads/${attachment.id}`, { headers: token ? { authorization: `Bearer ${token}` } : {} }).catch(() => null);
        if (res?.ok) blob = await res.blob();
      }
      if (cancelled || !blob) return;
      const objectUrl = URL.createObjectURL(blob);
      urlCache.set(attachment.id, objectUrl);
      setUrl(objectUrl);
    })();
    return () => {
      cancelled = true;
    };
  }, [attachment]);

  return url;
}
