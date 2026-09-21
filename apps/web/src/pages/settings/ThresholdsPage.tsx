import { insightThresholdFields } from "@anka/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RotateCcw, Save, SlidersHorizontal } from "lucide-react";
import { useEffect, useState } from "react";
import { Navigate } from "react-router";
import { toast } from "sonner";

import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { errorMessage, useAuthStore } from "@/lib/auth";
import { useTRPC } from "@/lib/trpc";

/** İçgörü eşikleri (madde 5.11): kural motorunun sınırları çiftliğe göre ayarlanır. */
export function ThresholdsPage() {
  const role = useAuthStore((s) => s.user?.role);
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const farm = useQuery(trpc.farm.get.queryOptions());
  const update = useMutation({
    ...trpc.farm.update.mutationOptions(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: trpc.farm.get.queryKey() });
      toast.success("Eşikler kaydedildi; bir sonraki hesapta geçerli olur");
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const [values, setValues] = useState<Record<string, string>>({});

  useEffect(() => {
    const saved = ((farm.data?.settings as { insights?: Record<string, number> } | null)?.insights ?? {}) as Record<string, number>;
    setValues(Object.fromEntries(insightThresholdFields.map((f) => [f.key, String(saved[f.key] ?? f.default)])));
  }, [farm.data]);

  if (role && role !== "owner") return <Navigate to="/" replace />;

  function save() {
    const insights: Record<string, number> = {};
    for (const field of insightThresholdFields) {
      const raw = Number((values[field.key] ?? "").replace(",", "."));
      if (!Number.isFinite(raw)) {
        toast.error(`${field.label} sayı olmalı`);
        return;
      }
      if (raw < field.min || raw > field.max) {
        toast.error(`${field.label} ${field.min} ile ${field.max} arasında olmalı`);
        return;
      }
      // Varsayılanla aynıysa yazma: ayarlar dosyası sade kalsın, sonradan varsayılan değişirse takip etsin.
      if (raw !== field.default) insights[field.key] = raw;
    }
    update.mutate({ insights });
  }

  function reset() {
    setValues(Object.fromEntries(insightThresholdFields.map((f) => [f.key, String(f.default)])));
  }

  return (
    <>
      <PageHeader
        icon={SlidersHorizontal}
        title="İçgörü eşikleri"
        description="Uyarıların ne zaman çıkacağını çiftliğine göre ayarla"
        actions={
          <>
            <Button variant="outline" onClick={reset} data-testid="threshold-reset">
              <RotateCcw /> Varsayılanlar
            </Button>
            <Button onClick={save} disabled={update.isPending} data-testid="threshold-save">
              <Save /> Kaydet
            </Button>
          </>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Eşikler</CardTitle>
          <CardDescription>Bu değerler kural motorunda kullanılır; değiştirince bir sonraki hesapta geçerli olur. Gece hesabı 03:00'te çalışır.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {insightThresholdFields.map((field) => (
            <div key={field.key} className="grid gap-1.5" data-testid={`threshold-${field.key}`}>
              <Label htmlFor={`th-${field.key}`}>
                {field.label} <span className="text-muted-foreground">({field.unit})</span>
              </Label>
              <Input
                id={`th-${field.key}`}
                inputMode="decimal"
                value={values[field.key] ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}
                data-testid={`th-input-${field.key}`}
              />
              <p className="text-xs text-muted-foreground">
                {field.hint} · varsayılan {field.default} {field.unit}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>
    </>
  );
}
