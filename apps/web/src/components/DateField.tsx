import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Props {
  id: string;
  label: string;
  value: string | null;
  onChange: (iso: string | null) => void;
  testID?: string;
  error?: string | null;
  required?: boolean;
}

/** Tarih alanı: tarayıcının kendi seçicisi, değer ISO (YYYY-AA-GG). */
export function DateField({ id, label, value, onChange, testID, error, required }: Props) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>
        {label}
        {required ? <span className="text-danger">*</span> : null}
      </Label>
      <Input id={id} type="date" value={value ?? ""} onChange={(e) => onChange(e.target.value || null)} data-testid={testID} required={required} aria-invalid={!!error} />
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}
