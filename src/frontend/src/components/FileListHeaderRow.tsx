import { ArrowUp, ArrowDown } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import type { SortField, SortDirection } from '../lib/sortFileSystemItems';

interface FileListHeaderRowProps {
  sortField: SortField;
  sortDirection: SortDirection;
  onSort: (field: SortField) => void;
  hasSelection?: boolean;
  allSelected?: boolean;
  onSelectAll?: (checked: boolean) => void;
}

export function FileListHeaderRow({ 
  sortField, 
  sortDirection, 
  onSort,
  hasSelection = false,
  allSelected = false,
  onSelectAll
}: FileListHeaderRowProps) {
  const renderSortArrow = (field: SortField) => {
    if (sortField !== field) {
      return <ArrowUp className="h-3 w-3 text-muted-foreground/40" />;
    }
    return sortDirection === 'asc' ? (
      <ArrowUp className="h-3 w-3 text-foreground" />
    ) : (
      <ArrowDown className="h-3 w-3 text-foreground" />
    );
  };

  const handleHeaderClick = (field: SortField) => {
    onSort(field);
  };

  return (
    <div className="grid grid-cols-[40px_1fr_60px_180px_120px_160px] gap-2 px-4 py-2 border-b bg-muted/30 text-xs font-medium text-muted-foreground">
      {/* Selection column */}
      {hasSelection && onSelectAll && (
        <div className="flex items-center justify-center">
          <Checkbox
            checked={allSelected}
            onCheckedChange={onSelectAll}
            aria-label="Select all"
          />
        </div>
      )}
      {!hasSelection && <div />}

      {/* Name column - centered header */}
      <button
        onClick={() => handleHeaderClick('name')}
        className="flex items-center justify-center gap-1 hover:text-foreground transition-colors"
      >
        <span>Name</span>
        {renderSortArrow('name')}
      </button>

      {/* Type column - centered header */}
      <button
        onClick={() => handleHeaderClick('type')}
        className="flex items-center justify-center gap-1 hover:text-foreground transition-colors whitespace-nowrap"
      >
        <span>Type</span>
        {renderSortArrow('type')}
      </button>

      {/* Created column - centered header */}
      <button
        onClick={() => handleHeaderClick('created')}
        className="flex items-center justify-center gap-1 hover:text-foreground transition-colors whitespace-nowrap"
      >
        <span>Created</span>
        {renderSortArrow('created')}
      </button>

      {/* Size column - centered header */}
      <button
        onClick={() => handleHeaderClick('size')}
        className="flex items-center justify-center gap-1 hover:text-foreground transition-colors whitespace-nowrap"
      >
        <span>Size</span>
        {renderSortArrow('size')}
      </button>

      {/* Actions column (no sort) - centered header */}
      <div className="flex items-center justify-center">
        <span>Actions</span>
      </div>
    </div>
  );
}
