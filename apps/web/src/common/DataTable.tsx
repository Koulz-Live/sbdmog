// apps/web/src/common/DataTable.tsx
// Generic Bootstrap 5 responsive table with typed column definitions.

import React from 'react';

export interface Column<T> {
  key:       string;
  header:    string;
  render?:   (row: T) => React.ReactNode;
  width?:    string;
}

interface DataTableProps<T> {
  columns:    Column<T>[];
  data:       T[];
  rowKey:     (row: T) => string;
  onRowClick?: (row: T) => void;
  className?: string;
  striped?:   boolean;
  hover?:     boolean;
}

export function DataTable<T>({
  columns,
  data,
  rowKey,
  onRowClick,
  className = '',
  striped   = false,
  hover     = true,
}: DataTableProps<T>) {
  const tableClass = [
    'table',
    'table-sm',
    striped ? 'table-striped' : '',
    hover   ? 'table-hover'   : '',
    className,
  ].filter(Boolean).join(' ');

  return (
    <div className="table-responsive">
      <table className={tableClass}>
        <thead className="table-light">
          <tr>
            {columns.map((col) => (
              <th key={col.key} style={col.width ? { width: col.width } : undefined}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr
              key={rowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              style={onRowClick ? { cursor: 'pointer' } : undefined}
            >
              {columns.map((col) => (
                <td key={col.key}>
                  {col.render
                    ? col.render(row)
                    : String((row as Record<string, unknown>)[col.key] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
