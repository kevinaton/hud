'use client';

/**
 * components/hud/CategoryCombobox.tsx
 *
 * A combobox that lets the user pick an existing category or type a new one.
 *
 * - Shows a filterable list of existing categories from the server.
 * - If the user types a name that doesn't exist, it surfaces a "Create <name>"
 *   option at the top of the list.
 * - The selected value is a plain string (the category name). The server
 *   handles upsert via findOrCreateCategory.
 *
 * Per hud-ui skill: Oxanium body font, cyan accent focus rings, 2px radius,
 * no hex values inline, no box shadows.
 */

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { Check, ChevronsUpDown } from 'lucide-react';
import * as React from 'react';

interface Category {
  id: number;
  name: string;
}

interface CategoryComboboxProps {
  /** Available categories to display in the dropdown. */
  categories: Category[];
  /** The currently selected category name (or empty string). */
  value: string;
  /** Called when the user selects a value or clears the field. */
  onChange: (value: string) => void;
  /** Whether the field is disabled. */
  disabled?: boolean;
  /** Accessibility id for connecting to FormControl. */
  id?: string;
}

export function CategoryCombobox({
  categories,
  value,
  onChange,
  disabled = false,
  id,
}: CategoryComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');

  // Trim the query for comparison
  const trimmedQuery = query.trim();

  // Check if the query matches an existing category name (case-insensitive)
  const queryMatchesExisting =
    trimmedQuery !== '' &&
    categories.some((c) => c.name.toLowerCase() === trimmedQuery.toLowerCase());

  // Filter categories by the search query
  const filtered =
    trimmedQuery === ''
      ? categories
      : categories.filter((c) => c.name.toLowerCase().includes(trimmedQuery.toLowerCase()));

  // The label shown on the trigger button
  const triggerLabel = value || 'Select category...';

  function handleSelect(selectedName: string) {
    // Toggle off if the same value is clicked again
    onChange(selectedName === value ? '' : selectedName);
    setOpen(false);
    setQuery('');
  }

  function handleCreateNew() {
    if (!trimmedQuery) return;
    onChange(trimmedQuery);
    setOpen(false);
    setQuery('');
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          aria-expanded={open}
          aria-haspopup="listbox"
          disabled={disabled}
          className={cn(
            'flex h-10 w-full items-center justify-between px-3 py-2',
            'rounded-[var(--radius)] border border-border bg-transparent',
            'font-body text-sm uppercase tracking-[0.06em]',
            !value && 'text-muted',
            value && 'text-foreground',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background',
            'disabled:cursor-not-allowed disabled:opacity-50',
          )}
        >
          <span className="truncate">{triggerLabel}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className={cn(
          'w-[var(--radix-popover-trigger-width)] p-0',
          'rounded-[var(--radius)] border-border bg-surface',
        )}
      >
        <Command className="bg-transparent" shouldFilter={false}>
          <CommandInput
            placeholder="Search or type new category..."
            value={query}
            onValueChange={setQuery}
            className="font-body text-sm border-b border-border text-foreground placeholder:text-muted"
          />
          <CommandList>
            {/* "Create new" option — shown when query doesn't match an existing name */}
            {trimmedQuery !== '' && !queryMatchesExisting && (
              <CommandGroup heading="New">
                <CommandItem
                  value={`__create__${trimmedQuery}`}
                  onSelect={handleCreateNew}
                  className="font-body text-sm text-accent cursor-pointer"
                >
                  <span>Create &quot;{trimmedQuery}&quot;</span>
                </CommandItem>
              </CommandGroup>
            )}

            {filtered.length === 0 &&
            trimmedQuery !== '' &&
            queryMatchesExisting === false ? null : (
              <CommandGroup heading={filtered.length > 0 ? 'Categories' : undefined}>
                {filtered.length === 0 && (
                  <CommandEmpty className="py-4 text-center font-body text-sm text-muted">
                    No categories found
                  </CommandEmpty>
                )}
                {filtered.map((cat) => (
                  <CommandItem
                    key={cat.id}
                    value={cat.name}
                    onSelect={() => handleSelect(cat.name)}
                    className="font-body text-sm cursor-pointer"
                  >
                    <Check
                      className={cn(
                        'mr-2 h-4 w-4',
                        value === cat.name ? 'opacity-100 text-accent' : 'opacity-0',
                      )}
                    />
                    {cat.name}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
