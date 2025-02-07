'use client'

import { ColumnDef } from "@tanstack/react-table"
import { FleetTrip } from "@/types"

import { AircraftTooltip } from "@/components/aircraft-tooltip"
import { Button } from "@/components/ui/button"
import { ArrowUpDown } from "lucide-react"
import { format, parse } from "date-fns"
import { formatDuration } from "@/lib/utils"

export const columns: ColumnDef<FleetTrip>[] = [
    {
        accessorKey: "date",
        enableSorting: true,
        size: 150,
        header: ({ column }) => (
            <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="font-semibold"
            >
                Date
                <ArrowUpDown className="ml-2 h-4 w-4" />
            </Button>
        ),
        cell: ({ row }) => (
            <div className="text-muted-foreground text-center">
                {format(parse(row.original.date, "yyyy-MM-dd", new Date()), "yyyy-MMM-d")}
            </div>
        ),
    },
    {
        accessorKey: "tail_no",
        enableGrouping: true,
        header: () => (
            <div className="mx-auto">
                Aircraft
            </div>
        ),
        cell: ({ row }) => (
            <div className="text-center">
                <AircraftTooltip aircraft={row.original.aircraft} />
            </div>
        )
    },
    {
        accessorKey: "route",
        header: "Trip Details",
        cell: ({ row }) => (
            <div className="py-2">
                <div className="text-lg font-medium leading-none">
                    {row.original.route}
                </div>
                {row.original.passengers && (
                    <div className="mt-1 text-sm">
                        {row.original.passengers}
                    </div>
                )}
            </div>
        )
    },
    {
        accessorKey: "department",
        header: "Dept. (Div.)",
        enableGrouping: true,
        cell: ({ row }) => (
            <div className="items-center gap-2 whitespace-nowrap">
                {row.original.department}
                {row.original.division && <small className="block text-muted-foreground">{row.original.division}</small>}
            </div>
        )
    },
    {
        accessorKey: "flight_hours",
        enableSorting: true,
        header: ({ column }) => (
            <Button
                variant="ghost"
                onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
                className="font-semibold"
            >
                Flight Time
                <ArrowUpDown className="ml-2 h-4 w-4" />
            </Button>
        ),
        cell: ({ row }) => (
            <div className="text-muted-foreground text-center">
                {formatDuration(row.original.flight_hours)}
            </div>
        )
    }
]