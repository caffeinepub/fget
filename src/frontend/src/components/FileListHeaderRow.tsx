import { ArrowUp, ArrowDown } from 'lucide-react';
import type { SortField, SortDirection } from '../lib/sortFileSystemItems';

interface FileListHeaderRowProps {
  sortField: SortField;
  sortDirection: SortDirection;
  onSort: (field: SortField) => void;
}

export function FileListHeaderRow({ sortField, sortDirection, onSort }: FileListHeaderRowProps) {
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
    <div className="grid grid-cols-[1fr_80px_180px_120px_200px] gap-2 px-4 py-2 border-b bg-muted/30 text-xs font-medium text-muted-foreground">
      {/* Name column */}
      <button
        onClick={() => handleHeaderClick('name')}
        className="flex items-center gap-1 hover:text-foreground transition-colors text-left"
      >
        <span>Name</span>
        {renderSortArrow('name')}
      </button>

      {/* Type column */}
      <button
        onClick={() => handleHeaderClick('type')}
        className="flex items-center justify-center gap-1 hover:text-foreground transition-colors whitespace-nowrap"
      >
        <span>Type</span>
        {renderSortArrow('type')}
      </button>

      {/* Created column */}
      <button
        onClick={() => handleHeaderClick('created')}
        className="flex items-center justify-center gap-1 hover:text-foreground transition-colors whitespace-nowrap"
      >
        <span>Created</span>
        {renderSortArrow('created')}
      </button>

      {/* Size column */}
      <button
        onClick={() => handleHeaderClick('size')}
        className="flex items-center justify-center gap-1 hover:text-foreground transition-colors whitespace-nowrap"
      >
        <span>Size</span>
        {renderSortArrow('size')}
      </button>

      {/* Actions column (no sort) - right-aligned */}
      <div className="text-right pr-2">
        <span>Actions</span>
      </div>
    </div>
  );
}
