import { format, parse } from 'date-fns';
import { formatDuration } from '@/lib/utils';
import type { FleetTrip } from '@/types';
import { ColumnDef } from '@tanstack/react-table';
import { Button } from '@/components/ui/button';
import { ArrowUpDown, Timer } from 'lucide-react';
import { AircraftTooltip } from '@/components/aircraft-tooltip';

export const columns: ColumnDef<FleetTrip>[] = [
  {
    accessorKey: 'date',
    header: ({ column }) => (
      <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')} className="font-semibold px-1">
        Date <ArrowUpDown className="ml-2 h-4 w-4" />
      </Button>
    ),
    cell: ({ row }) => (
      <div className="text-muted-foreground text-center whitespace-nowrap">
        {format(parse(row.original.date, 'yyyy-MM-dd', new Date()), 'yyyy-MMM-d')}
      </div>
    ),
  },
  {
    accessorKey: 'tail_no',
    header: () => <div className="text-center font-semibold">Aircraft</div>,
    cell: ({ row }) => (
      <div className="text-center">
        <AircraftTooltip aircraft={row.original.aircraft} />
      </div>
    ),
    enableSorting: false,
  },
  {
    accessorKey: 'route',
    header: 'Trip Details',
    cell: ({ row }) => (
      <div className="py-2">
        <div className="font-medium leading-tight">{row.original.route}</div>
        {row.original.passengers && <div className="mt-1 text-sm text-muted-foreground">{row.original.passengers}</div>}
        <div className="flex md:hidden flex-row justify-between mt-2 items-center">
          <div className="text-sm text-muted-foreground">
            {row.original.department}
            {row.original.division && (
              <small className="block">{row.original.division}</small>
            )}
          </div>
          <div className="text-sm text-muted-foreground">
            <span className="flex items-center">
              <Timer className="h-4 w-4 mr-1" />
              {formatDuration(row.original.flight_hours)}
            </span>
          </div>
        </div>
      </div>
    ),
    enableSorting: false,
  },
  {
    accessorKey: 'department',
    header: 'Dept. (Div.)',
    cell: ({ row }) => (
      <div className="items-center gap-2 whitespace-nowrap">
        {row.original.department}
        {row.original.division && <small className="block text-muted-foreground">{row.original.division}</small>}
      </div>
    ),
  },
  {
    accessorKey: 'flight_hours',
    header: ({ column }) => (
      <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')} className="font-semibold px-1">
        Time <ArrowUpDown className="ml-2 h-4 w-4" />
      </Button>
    ),
    cell: ({ row }) => (
      <div className="text-muted-foreground text-center">{formatDuration(row.original.flight_hours)}</div>
    ),
  },
];