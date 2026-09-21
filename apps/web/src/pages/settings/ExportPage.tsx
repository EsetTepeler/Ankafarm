import { Download, FileSpreadsheet } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { exportTables } from "@/features/export/csv";
import { downloadAllCsv, downloadTableCsv } from "@/features/export/download";
import { errorMessage } from "@/lib/auth";

/** Dışa aktarma (madde 3.6): tüm tablolar CSV, Excel'in beklediği biçimde. Cihazdaki veriden, çevrimdışı çalışır. */
export function ExportPage() {
  const tables = useMemo(() => exportTables(), []);
  const [busy, setBusy] = useState<string | null>(null);

  async function one(key: string, label: string) {
    setBusy(key);
    try {
      const n = await downloadTableCsv(key);
      toast.success(`${label}: ${n} satır indirildi`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function all() {
    setBusy("all");
    try {
      const { files, rows } = await downloadAllCsv();
      toast.success(`${files} dosya, ${rows} satır indirildi`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <PageHeader
        icon={FileSpreadsheet}
        title="Dışa aktarma"
        description="Kayıtları Excel'de açılabilir CSV olarak indir"
        actions={
          <Button onClick={() => void all()} disabled={busy !== null} data-testid="export-all">
            <Download /> Tümünü indir (ZIP)
          </Button>
        }
      />

      <Card>
        <CardHeader>
          <CardDescription>
            Dosyalar noktalı virgülle ayrılır ve UTF-8 olarak yazılır; Excel Türkçe kurulumda doğrudan açar. Veriler cihazdaki kopyadan üretilir, internet gerekmez. Sunucu yedeği ayrıca her gece alınır.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-1">
          {tables.map((t) => (
            <div key={t.key} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-sm transition-colors hover:bg-muted/40" data-testid={`export-row-${t.key}`}>
              <span className="flex items-center gap-2">
                <FileSpreadsheet className="size-4 text-muted-foreground" />
                {t.label}
              </span>
              <Button variant="ghost" size="sm" onClick={() => void one(t.key, t.label)} disabled={busy !== null} data-testid={`export-${t.key}`}>
                İndir
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>
    </>
  );
}
