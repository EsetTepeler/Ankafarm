import { Check, ChevronsUpDown } from "lucide-react";
import { useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface PickerItem {
  id: string;
  label: string;
  description?: string | null;
}

interface Props {
  label: string;
  items: PickerItem[];
  value: string | null;
  onChange: (id: string | null) => void;
  placeholder?: string;
  noneLabel?: string;
  testID?: string;
  error?: string | null;
  footer?: ReactNode;
}

/** Aranabilir seçici: ırk, anne, baba, grup, eş. */
export function EntityPicker({ label, items, value, onChange, placeholder = "Seçilmedi", noneLabel, testID, error, footer }: Props) {
  const [open, setOpen] = useState(false);
  const selected = items.find((i) => i.id === value);
  return (
    <div className="grid gap-1.5">
      <Label>{label}</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" role="combobox" aria-expanded={open} className="justify-between font-normal" data-testid={testID} aria-invalid={!!error}>
            <span className={cn("truncate", !selected && "text-muted-foreground")}>{selected ? selected.label + (selected.description ? ` · ${selected.description}` : "") : placeholder}</span>
            <ChevronsUpDown className="size-4 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <Command data-testid={testID ? `${testID}-list` : undefined}>
            <CommandInput placeholder="Ara" />
            <CommandList>
              <CommandEmpty>Sonuç yok</CommandEmpty>
              <CommandGroup>
                {noneLabel ? (
                  <CommandItem
                    value="__none__"
                    onSelect={() => {
                      onChange(null);
                      setOpen(false);
                    }}
                  >
                    <Check className={cn("size-4", value === null ? "opacity-100" : "opacity-0")} />
                    {noneLabel}
                  </CommandItem>
                ) : null}
                {items.map((item) => (
                  <CommandItem
                    key={item.id}
                    value={`${item.label} ${item.description ?? ""}`}
                    data-testid={`picker-item-${item.id}`}
                    onSelect={() => {
                      onChange(item.id);
                      setOpen(false);
                    }}
                  >
                    <Check className={cn("size-4", value === item.id ? "opacity-100" : "opacity-0")} />
                    <span>{item.label}</span>
                    {item.description ? <span className="ml-auto text-xs text-muted-foreground">{item.description}</span> : null}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
            {footer ? <div className="border-t p-1">{footer}</div> : null}
          </Command>
        </PopoverContent>
      </Popover>
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}
