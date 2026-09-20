import { Loader2 } from "lucide-react";

export function Boot({ title, detail }: { title: string; detail?: string }) {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-3 bg-background text-foreground">
      {detail ? null : <Loader2 className="size-6 animate-spin text-muted-foreground" />}
      <p className="text-sm text-muted-foreground">{title}</p>
      {detail ? <p className="max-w-md text-center text-xs text-danger">{detail}</p> : null}
    </div>
  );
}
