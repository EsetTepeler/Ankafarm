import { labels, type AttachmentKind } from "@anka/shared";
import { Camera, CloudUpload, FileText, Trash2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { addAttachment, deleteAttachment, useAttachmentUrl, useAttachments, type AttachmentEntity } from "@/features/attachments/repo";
import { errorMessage } from "@/lib/auth";
import type { LocalAttachment } from "@/db/schema";
import { formatDate } from "@/utils/date";

/** Fotoğraf ve belge galerisi (madde 3.8): çevrimdışı çekilen fotoğraf hemen görünür, bağlantı gelince yüklenir. */
export function PhotoGallery({ entityTable, entityId, canEdit }: { entityTable: AttachmentEntity; entityId: string; canEdit: boolean }) {
  const items = useAttachments(entityTable, entityId);
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<LocalAttachment | null>(null);

  async function pick(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    try {
      for (const file of Array.from(files)) {
        await addAttachment({ entityTable, entityId, file });
      }
      toast.success(files.length > 1 ? `${files.length} dosya eklendi` : "Dosya eklendi");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
      if (cameraRef.current) cameraRef.current.value = "";
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const rows = items.data ?? [];

  return (
    <div className="grid gap-3">
      {canEdit ? (
        <div className="flex flex-wrap gap-2">
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => void pick(e.target.files)} data-testid="photo-camera-input" />
          <input ref={fileRef} type="file" accept="image/*,application/pdf" multiple className="hidden" onChange={(e) => void pick(e.target.files)} data-testid="photo-file-input" />
          <Button variant="outline" size="sm" onClick={() => cameraRef.current?.click()} disabled={busy} data-testid="photo-camera">
            <Camera /> Fotoğraf çek
          </Button>
          <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={busy} data-testid="photo-upload">
            <Upload /> Dosya seç
          </Button>
        </div>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState icon={Camera} title="Henüz dosya yok" description="Fotoğraf çek ya da fatura, rapor gibi belgeleri ekle." />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {rows.map((a) => (
            <Thumb key={a.id} attachment={a} canEdit={canEdit} onOpen={() => setPreview(a)} />
          ))}
        </div>
      )}

      <Dialog open={preview != null} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {preview ? labels.attachmentKind[preview.kind as AttachmentKind] : ""} {preview ? `· ${formatDate(preview.createdAt)}` : ""}
            </DialogTitle>
          </DialogHeader>
          {preview ? <Preview attachment={preview} /> : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Thumb({ attachment, canEdit, onOpen }: { attachment: LocalAttachment; canEdit: boolean; onOpen: () => void }) {
  const url = useAttachmentUrl(attachment);
  const isImage = attachment.mime.startsWith("image/");
  return (
    <div className="group relative overflow-hidden rounded-xl border bg-muted transition-shadow hover:shadow-sm" data-testid={`photo-item-${attachment.id}`}>
      <button type="button" onClick={onOpen} className="block aspect-square w-full">
        {isImage && url ? (
          <img src={url} alt="" className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
        ) : (
          <span className="flex size-full flex-col items-center justify-center gap-1 text-xs text-muted-foreground">
            <FileText className="size-6" />
            {attachment.mime.split("/")[1]?.toUpperCase()}
          </span>
        )}
      </button>
      {!attachment.storagePath ? (
        <Badge variant="secondary" className="absolute left-1 top-1 gap-1" data-testid="photo-pending">
          <CloudUpload className="size-3" /> yüklenecek
        </Badge>
      ) : null}
      {canEdit ? (
        <Button
          variant="secondary"
          size="icon"
          className="absolute right-1 top-1 opacity-0 transition-opacity group-hover:opacity-100"
          aria-label="Sil"
          onClick={() => void deleteAttachment(attachment.id)}
          data-testid={`photo-delete-${attachment.id}`}
        >
          <Trash2 />
        </Button>
      ) : null}
    </div>
  );
}

function Preview({ attachment }: { attachment: LocalAttachment }) {
  const url = useAttachmentUrl(attachment);
  if (!url) return <p className="py-8 text-center text-sm text-muted-foreground">Dosya hazırlanıyor</p>;
  if (attachment.mime.startsWith("image/")) return <img src={url} alt="" className="max-h-[70vh] w-full rounded-lg object-contain" data-testid="photo-preview" />;
  return (
    <a href={url} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-2 py-8 text-sm text-primary hover:underline">
      <FileText className="size-5" /> Dosyayı aç
    </a>
  );
}
