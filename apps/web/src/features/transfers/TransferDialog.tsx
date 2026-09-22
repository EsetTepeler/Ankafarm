import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Send } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { errorMessage } from "@/lib/auth";
import { useTRPC } from "@/lib/trpc";

/**
 * Hayvanı başka bir çiftliğe devretme isteği. Hedef çiftlik koduyla bulunur: çiftlik adı
 * aranabilir değil, kodu karşı taraf paylaşır. Kabul edilene kadar hayvan sürüde kalır.
 */
export function TransferDialog({
  open,
  onOpenChange,
  animalId,
  tagNo,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  animalId: string;
  tagNo: string;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [code, setCode] = useState("");
  const [note, setNote] = useState("");

  const request = useMutation(
    trpc.transfers.request.mutationOptions({
      onSuccess: (t) => {
        void queryClient.invalidateQueries({ queryKey: trpc.transfers.outgoing.queryKey() });
        setCode("");
        setNote("");
        onOpenChange(false);
        toast.success(`${tagNo} için devir isteği gönderildi`, { description: `${t.toFarmName} kabul edince sürüden düşecek.` });
      },
      onError: (e) => toast.error(errorMessage(e)),
    }),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Başka çiftliğe devret · {tagNo}</DialogTitle>
          <DialogDescription>
            Karşı çiftlik kabul edince hayvan aşı ve tartım geçmişiyle birlikte oraya geçer, senin süründen düşer. Masrafların ve gözlem notların sende kalır.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="transfer-code">Çiftlik kodu</Label>
            <Input
              id="transfer-code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="CF-XXXXXX"
              className="font-mono"
              data-testid="transfer-code"
              autoFocus
            />
            <p className="text-xs text-muted-foreground">Kodu alacak çiftlik Ayarlar ekranında görür ve sana verir.</p>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="transfer-note">Not</Label>
            <Textarea id="transfer-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} data-testid="transfer-note" placeholder="Satış, ödünç koç..." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Vazgeç
          </Button>
          <Button
            disabled={request.isPending || code.trim().length < 4}
            data-testid="transfer-send"
            onClick={() => request.mutate({ animalId, toFarmCode: code.trim(), note: note.trim() || undefined })}
          >
            <Send /> İstek gönder
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
