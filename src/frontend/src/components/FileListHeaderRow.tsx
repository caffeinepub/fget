import React from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { ArrowUp, ArrowDown } from 'lucide-react';
import type { SortField, SortDirection } from '../lib/sortFileSystemItems';

interface FileListHeaderRowProps {
  allSelected: boolean;
  someSelected: boolean;
  onSelectAll: (checked: boolean) => void;
  sortField: SortField;
  sortDirection: SortDirection;
  onSort: (field: SortField) => void;
  showLocationColumn?: boolean;
}

export function FileListHeaderRow({
  allSelected,
  someSelected,
  onSelectAll,
  sortField,
  sortDirection,
  onSort,
  showLocationColumn = false,
}: FileListHeaderRowProps) {
  const SortButton = ({ field, label }: { field: SortField; label: string }) => {
    const isActive = sortField === field;
    return (
      <button
        onClick={() => onSort(field)}
        className="flex items-center justify-center gap-1 hover:text-foreground transition-colors w-full"
      >
        <span>{label}</span>
        {isActive && (
          sortDirection === 'asc' ? (
            <ArrowUp className="h-3 w-3" />
          ) : (
            <ArrowDown className="h-3 w-3" />
          )
        )}
      </button>
    );
  };

  return (
    <thead className="bg-muted/50">
      <tr>
        <th className="p-4 w-12">
          <Checkbox
            checked={allSelected}
            onCheckedChange={onSelectAll}
            aria-label="Select all"
            className={someSelected ? 'data-[state=checked]:bg-primary/50' : ''}
          />
        </th>
        <th className="p-4 text-center font-medium text-muted-foreground">
          <SortButton field="name" label="Name" />
        </th>
        <th className="p-4 text-center font-medium text-muted-foreground">
          <SortButton field="type" label="Type" />
        </th>
        {showLocationColumn && (
          <th className="p-4 text-center font-medium text-muted-foreground">
            Location
          </th>
        )}
        <th className="p-4 text-center font-medium text-muted-foreground">
          <SortButton field="created" label="Created" />
        </th>
        <th className="p-4 text-center font-medium text-muted-foreground">
          <SortButton field="size" label="Size" />
        </th>
        <th className="p-4 text-center font-medium text-muted-foreground w-[160px]">
          Actions
        </th>
      </tr>
    </thead>
  );
}
