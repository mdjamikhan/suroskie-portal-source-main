"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";

interface CreatorOption {
  id: string;
  name: string;
  code: string;
  instagramHandle: string | null;
  isActive: boolean;
}

/** Searchable creator dropdown. Results come from the server and are limited to the viewer's creator scope. */
export function CreatorSearch({ onSelect, placeholder = "Search creators…", navigate = true, preserveQuery = "" }: { onSelect?: (c: CreatorOption) => void; placeholder?: string; navigate?: boolean; preserveQuery?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [items, setItems] = useState<CreatorOption[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/v1/creators/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal });
        if (res.ok) setItems(await res.json());
      } catch {
        /* aborted */
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q, open]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="h-9 w-full justify-start gap-2 text-muted-foreground sm:w-72" role="combobox" aria-expanded={open}>
          <Search className="size-4" />
          {placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Name, creator ID or @handle" value={q} onValueChange={setQ} />
          <CommandList>
            <CommandEmpty>{loading ? "Searching…" : "No creators you can access match."}</CommandEmpty>
            <CommandGroup>
              {items.map((c) => (
                <CommandItem
                  key={c.id}
                  value={c.id}
                  onSelect={() => {
                    setOpen(false);
                    onSelect?.(c);
                    if (navigate) router.push(`/creators/${c.id}${preserveQuery ? `?${preserveQuery}` : ""}`);
                  }}
                >
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate font-medium">{c.name}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {c.code}
                      {c.instagramHandle ? ` · @${c.instagramHandle}` : ""}
                      {!c.isActive ? " · inactive" : ""}
                    </span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
