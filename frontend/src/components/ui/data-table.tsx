import * as React from 'react';
import { ChevronDown, ChevronUp, MoreVertical, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Pagination, usePagination } from '@/components/ui/pagination';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export interface DataTableColumn<T> {
  key: string;
  label: string;
  render?: (item: T) => React.ReactNode;
  sortable?: boolean;
  className?: string;
  headerClassName?: string;
}

export interface DataTableAction<T> {
  label: string;
  onClick: (item: T) => void;
  variant?: 'default' | 'destructive';
  icon?: React.ReactNode;
  hidden?: (item: T) => boolean;
}

export interface DataTableProps<T> {
  data: T[];
  columns: DataTableColumn<T>[];
  actions?: DataTableAction<T>[];
  keyExtractor: (item: T) => string | number;
  searchable?: boolean;
  searchPlaceholder?: string;
  searchKeys?: (keyof T)[];
  onSearch?: (query: string) => void;
  emptyState?: React.ReactNode;
  loading?: boolean;
  className?: string;
  enablePagination?: boolean;
  initialPageSize?: number;
  pageSizeOptions?: number[];
}

export function DataTable<T extends Record<string, unknown>>({
  data,
  columns,
  actions,
  keyExtractor,
  searchable = false,
  searchPlaceholder = 'Search records...',
  searchKeys,
  onSearch,
  emptyState,
  loading = false,
  className,
  enablePagination = true,
  initialPageSize = 10,
  pageSizeOptions = [10, 25, 50],
}: DataTableProps<T>) {
  const [searchQuery, setSearchQuery] = React.useState('');
  const [sortConfig, setSortConfig] = React.useState<{
    key: string;
    direction: 'asc' | 'desc';
  } | null>(null);

  // Filter data based on search
  const filteredData = React.useMemo(() => {
    if (!searchQuery.trim() || !searchKeys) return data;

    const query = searchQuery.toLowerCase();
    return data.filter((item) =>
      searchKeys.some((key) => {
        const value = item[key];
        if (value === null || value === undefined) return false;
        return String(value).toLowerCase().includes(query);
      }),
    );
  }, [data, searchQuery, searchKeys]);

  // Sort data
  const sortedData = React.useMemo(() => {
    if (!sortConfig) return filteredData;

    return [...filteredData].sort((a, b) => {
      const aValue = (a as Record<string, unknown>)[sortConfig.key];
      const bValue = (b as Record<string, unknown>)[sortConfig.key];

      if (aValue === null || aValue === undefined) return 1;
      if (bValue === null || bValue === undefined) return -1;

      const aStr = typeof aValue === 'string' || typeof aValue === 'number' ? String(aValue) : JSON.stringify(aValue) ?? '';
      const bStr = typeof bValue === 'string' || typeof bValue === 'number' ? String(bValue) : JSON.stringify(bValue) ?? '';

      if (aStr < bStr) {
        return sortConfig.direction === 'asc' ? -1 : 1;
      }
      if (aValue > bValue) {
        return sortConfig.direction === 'asc' ? 1 : -1;
      }
      return 0;
    });
  }, [filteredData, sortConfig]);

  const pagination = usePagination({
    initialPageSize,
    totalRecords: sortedData.length,
  });

  // Get paginated data
  const paginatedData = enablePagination
    ? sortedData.slice(pagination.startIndex, pagination.endIndex)
    : sortedData;

  const handleSort = (key: string) => {
    setSortConfig((current) => {
      if (current?.key === key) {
        if (current.direction === 'asc') {
          return { key, direction: 'desc' };
        }
        return null; // Remove sort
      }
      return { key, direction: 'asc' };
    });
  };

  const handleSearchChange = (query: string) => {
    setSearchQuery(query);
    if (onSearch) {
      onSearch(query);
    }
    if (enablePagination) {
      pagination.goToPage(1); // Reset to first page on search
    }
  };

  if (loading) {
    return (
      <div className={cn('rounded-lg border border-slate-200 bg-white', className)}>
        <div className="flex h-64 items-center justify-center">
          <div className="text-sm text-slate-500">Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('space-y-3', className)}>
      {/* Search Bar */}
      {searchable && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            placeholder={searchPlaceholder}
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="h-10 w-full rounded-lg border border-slate-300 bg-white pl-10 pr-4 text-sm placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
          />
        </div>
      )}

      {/* Table Container */}
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                {columns.map((column) => (
                  <th
                    key={column.key}
                    className={cn(
                      'px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600',
                      column.headerClassName,
                      column.sortable && 'cursor-pointer select-none hover:bg-slate-100',
                    )}
                    onClick={() => column.sortable && handleSort(column.key)}
                  >
                    <div className="flex items-center gap-1.5">
                      <span>{column.label}</span>
                      {column.sortable && sortConfig?.key === column.key && (
                        <span className="text-emerald-600">
                          {sortConfig.direction === 'asc' ? (
                            <ChevronUp className="h-3.5 w-3.5" />
                          ) : (
                            <ChevronDown className="h-3.5 w-3.5" />
                          )}
                        </span>
                      )}
                    </div>
                  </th>
                ))}
                {actions && actions.length > 0 && (
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-600">
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedData.length === 0 ? (
                <tr>
                  <td colSpan={columns.length + (actions ? 1 : 0)} className="px-4 py-12">
                    {emptyState || (
                      <div className="text-center text-sm text-slate-500">
                        {searchQuery ? 'No matching records found' : 'No records found'}
                      </div>
                    )}
                  </td>
                </tr>
              ) : (
                paginatedData.map((item) => (
                  <tr
                    key={keyExtractor(item)}
                    className="transition-colors hover:bg-slate-50"
                  >
                    {columns.map((column) => (
                      <td
                        key={column.key}
                        className={cn('px-4 py-3 text-sm text-slate-700', column.className)}
                      >
                        {column.render ? column.render(item) : (item[column.key] as React.ReactNode)}
                      </td>
                    ))}
                    {actions && actions.length > 0 && (
                      <td className="px-4 py-3 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 text-slate-600"
                            >
                              <MoreVertical className="h-4 w-4" />
                              <span className="sr-only">Open actions menu</span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-40">
                            {actions
                              .filter((action) => !action.hidden?.(item))
                              .map((action, idx) => (
                                <DropdownMenuItem
                                  key={idx}
                                  onClick={() => action.onClick(item)}
                                  className={cn(
                                    'flex items-center gap-2',
                                    action.variant === 'destructive' &&
                                      'text-red-600 focus:text-red-600',
                                  )}
                                >
                                  {action.icon}
                                  <span>{action.label}</span>
                                </DropdownMenuItem>
                              ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {enablePagination && sortedData.length > 0 && (
          <div className="border-t border-slate-200 px-4 py-3">
            <Pagination
              currentPage={pagination.currentPage}
              totalPages={pagination.totalPages}
              totalRecords={sortedData.length}
              pageSize={pagination.pageSize}
              onPageChange={pagination.goToPage}
              onPageSizeChange={pagination.setPageSize}
              pageSizeOptions={pageSizeOptions}
            />
          </div>
        )}
      </div>
    </div>
  );
}
