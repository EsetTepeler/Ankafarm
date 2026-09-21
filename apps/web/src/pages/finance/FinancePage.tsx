import { formatMoney, labels, type ExpenseCategory, type IncomeCategory } from "@anka/shared";
import { ChevronLeft, ChevronRight, Minus, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Navigate } from "react-router";
import { toast } from "sonner";
import { ZodError } from "zod";

import { DateField } from "@/components/DateField";
import { EmptyState, PageHeader, StatTile } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { addExpense, addIncome, currentMonth, deleteExpense, deleteIncome, useExpenses, useIncomes, useMonthlySummary } from "@/features/finance/repo";
import { errorMessage, useAuthStore } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { isoToDisplay, todayIso } from "@/utils/date";

const expenseCategories = Object.entries(labels.expenseCategory) as [ExpenseCategory, string][];
const incomeCategories = Object.entries(labels.incomeCategory) as [IncomeCategory, string][];

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y!, m! - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, 1)).toLocaleDateString("tr-TR", { month: "long", year: "numeric", timeZone: "UTC" });
}

/** Finans yalnızca sahibe açık (bölüm 2, rol tablosu); bakıcı ve veteriner bu satırları cihazına bile almaz. */
export function FinancePage() {
  const role = useAuthStore((s) => s.user?.role);
  const [month, setMonth] = useState(currentMonth());
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [incomeOpen, setIncomeOpen] = useState(false);
  const summary = useMonthlySummary(month);
  const expenses = useExpenses(month);
  const incomes = useIncomes(month);

  if (role && role !== "owner") return <Navigate to="/" replace />;

  const s = summary.data;
  const net = (s?.income ?? 0) - (s?.expense ?? 0);
  const max = Math.max(1, ...(s?.byCategory ?? []).map((c) => c.amount));

  return (
    <>
      <PageHeader
        title="Finans"
        description="Aylık gider ve gelir; stok alımları da buraya işlenir"
        actions={
          <>
            <Button variant="outline" onClick={() => setIncomeOpen(true)} data-testid="income-add">
              <Plus /> Gelir
            </Button>
            <Button onClick={() => setExpenseOpen(true)} data-testid="expense-add">
              <Minus /> Gider
            </Button>
          </>
        }
      />

      <div className="mb-4 flex items-center gap-2">
        <Button variant="outline" size="icon" aria-label="Önceki ay" onClick={() => setMonth(shiftMonth(month, -1))} data-testid="month-prev">
          <ChevronLeft />
        </Button>
        <span className="min-w-40 text-center font-medium" data-testid="month-label">
          {monthLabel(month)}
        </span>
        <Button variant="outline" size="icon" aria-label="Sonraki ay" onClick={() => setMonth(shiftMonth(month, 1))} disabled={month >= currentMonth()} data-testid="month-next">
          <ChevronRight />
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile label="Gider" value={formatMoney(s?.expense ?? 0)} hint="Alımlar ve stok dışı giderler" testID="kpi-expense" />
        <StatTile label="Gelir" value={formatMoney(s?.income ?? 0)} testID="kpi-income" />
        <StatTile label="Fark" value={formatMoney(net)} hint={net >= 0 ? "Bu ay artıda" : "Bu ay ekside"} testID="kpi-net" />
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-base">Gider dağılımı</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2">
          {s && s.byCategory.length === 0 ? <EmptyState title="Bu ay gider girilmemiş" /> : null}
          {s?.byCategory.map((c) => (
            <div key={`${c.category}:${c.label}`} className="grid gap-1" data-testid={`cost-row-${c.label || c.category}`}>
              <div className="flex justify-between text-sm">
                <span>
                  {labels.expenseCategory[c.category as ExpenseCategory] ?? labels.stockCategory[c.category as keyof typeof labels.stockCategory] ?? c.category}
                  {c.label ? <span className="text-muted-foreground"> · {c.label}</span> : null}
                </span>
                <span className="font-medium tabular-nums">{formatMoney(c.amount)}</span>
              </div>
              <div className="h-1.5 rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary" style={{ width: `${Math.round((c.amount / max) * 100)}%` }} />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Tabs defaultValue="expenses" className="mt-6">
        <TabsList>
          <TabsTrigger value="expenses" data-testid="tab-expenses">
            Giderler
          </TabsTrigger>
          <TabsTrigger value="incomes" data-testid="tab-incomes">
            Gelirler
          </TabsTrigger>
        </TabsList>

        <TabsContent value="expenses">
          {expenses.data?.length === 0 ? (
            <EmptyState title="Bu ay stok dışı gider yok" description="Yem alımları Stok ekranından girilir." />
          ) : (
            <Ledger
              rows={(expenses.data ?? []).map((e) => ({ id: e.id, date: e.spentAt, category: labels.expenseCategory[e.category as ExpenseCategory] ?? e.category, description: e.description, amount: e.amount }))}
              onDelete={(id) => void deleteExpense(id)}
              testIdPrefix="expense"
            />
          )}
        </TabsContent>

        <TabsContent value="incomes">
          {incomes.data?.length === 0 ? (
            <EmptyState title="Bu ay gelir yok" />
          ) : (
            <Ledger
              rows={(incomes.data ?? []).map((i) => ({ id: i.id, date: i.receivedAt, category: labels.incomeCategory[i.category as IncomeCategory] ?? i.category, description: i.description, amount: i.amount }))}
              onDelete={(id) => void deleteIncome(id)}
              testIdPrefix="income"
            />
          )}
        </TabsContent>
      </Tabs>

      <EntryDialog
        open={expenseOpen}
        onOpenChange={setExpenseOpen}
        title="Gider ekle"
        categories={expenseCategories}
        testIdPrefix="expense"
        onSave={(category, date, amount, description) => addExpense({ category: category as ExpenseCategory, spentAt: date, amount, description })}
      />
      <EntryDialog
        open={incomeOpen}
        onOpenChange={setIncomeOpen}
        title="Gelir ekle"
        categories={incomeCategories}
        testIdPrefix="income"
        onSave={(category, date, amount, description) => addIncome({ category: category as IncomeCategory, receivedAt: date, amount, description })}
      />
    </>
  );
}

function Ledger({ rows, onDelete, testIdPrefix }: { rows: { id: string; date: string; category: string; description: string | null; amount: number }[]; onDelete: (id: string) => void; testIdPrefix: string }) {
  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Tarih</TableHead>
            <TableHead>Kategori</TableHead>
            <TableHead>Açıklama</TableHead>
            <TableHead className="text-right">Tutar</TableHead>
            <TableHead className="w-12" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id} data-testid={`${testIdPrefix}-row-${r.category}`}>
              <TableCell>{isoToDisplay(r.date)}</TableCell>
              <TableCell className="font-medium">{r.category}</TableCell>
              <TableCell className="text-muted-foreground">{r.description ?? "–"}</TableCell>
              <TableCell className="text-right font-medium tabular-nums">{formatMoney(r.amount)}</TableCell>
              <TableCell className="text-right">
                <Button variant="ghost" size="icon" aria-label="Sil" onClick={() => onDelete(r.id)}>
                  <Trash2 />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function EntryDialog({
  open,
  onOpenChange,
  title,
  categories,
  testIdPrefix,
  onSave,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  categories: [string, string][];
  testIdPrefix: string;
  onSave: (category: string, date: string, amount: number, description: string | null) => Promise<unknown>;
}) {
  const [category, setCategory] = useState(categories[0]![0]);
  const [date, setDate] = useState<string | null>(todayIso());
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      if (!date) throw new Error("Tarih gerekli");
      const value = amount.trim() ? Number(amount.trim().replace(",", ".")) : 0;
      if (!value) throw new Error("Tutar gerekli");
      await onSave(category, date, value, description.trim() || null);
      toast.success("Kaydedildi");
      setAmount("");
      setDescription("");
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof ZodError ? (err.issues[0]?.message ?? "Geçersiz değer") : errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <ToggleGroup type="single" variant="outline" value={category} onValueChange={(v) => v && setCategory(v)} className={cn("flex-wrap justify-start")}>
            {categories.map(([value, label]) => (
              <ToggleGroupItem key={value} value={value} data-testid={`${testIdPrefix}-cat-${value}`}>
                {label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <DateField id={`${testIdPrefix}-date`} label="Tarih" value={date} onChange={setDate} testID={`${testIdPrefix}-date`} required />
          <div className="grid gap-1.5">
            <Label htmlFor={`${testIdPrefix}-amount`}>Tutar, TL</Label>
            <Input id={`${testIdPrefix}-amount`} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} data-testid={`${testIdPrefix}-amount`} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`${testIdPrefix}-desc`}>Açıklama</Label>
            <Input id={`${testIdPrefix}-desc`} value={description} onChange={(e) => setDescription(e.target.value)} data-testid={`${testIdPrefix}-desc`} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Vazgeç
          </Button>
          <Button onClick={() => void save()} disabled={busy} data-testid={`${testIdPrefix}-save`}>
            Kaydet
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
