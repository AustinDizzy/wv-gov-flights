'use client'
import type { FleetTrip } from "@/types"
import { Card } from "@/components/ui/card"
import { columns } from "./columns"

import {
    flexRender,
    getCoreRowModel,
    getPaginationRowModel,
    getSortedRowModel,
    SortingState,
    useReactTable,
} from "@tanstack/react-table"

import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"

import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"

import {
    Pagination,
    PaginationContent,
    PaginationEllipsis,
    PaginationItem,
    PaginationLink,
    PaginationNext,
    PaginationPrevious,
} from "@/components/ui/pagination"
import { AircraftTooltip } from "@/components/aircraft-tooltip"
import { cn, formatDuration } from "@/lib/utils"
import { ArrowDownIcon, ArrowUpIcon, Timer } from "lucide-react"
import { usePathname, useSearchParams } from "next/navigation"
import { useCallback, useEffect, useState } from "react"
import Link from "next/link"

export function TripsDataTable({ trips }: {
  trips: FleetTrip[]
}) {
    const pathname = usePathname()
    const searchParams = useSearchParams()

    const currentPage = Number(searchParams.get("page")) || 1
    const currentPageSize = Number(searchParams.get("size")) || 20
    const currentSort = searchParams.get("sort")
    const [sorting, setSorting] = useState<SortingState>(() => {
        if (!currentSort) return []
        const [id, desc] = currentSort.split(":")
        return [{ id, desc: desc === "desc" }]
    });

    const table = useReactTable({
        data: trips,
        columns,
        getCoreRowModel: getCoreRowModel(),
        getPaginationRowModel: getPaginationRowModel(),
        getSortedRowModel: getSortedRowModel(),
        onSortingChange: setSorting,
        state: {
            sorting,
        },
        initialState: {
            pagination: {
                pageSize: currentPageSize,
                pageIndex: currentPage - 1,
            },
        },
    })

    const buildUrl = useCallback((pageIndex: number, pageSize: number) => {
        const params = new URLSearchParams(searchParams.toString())
        const pageNum = pageIndex + 1

        if (pageNum <= 1) {
            params.delete("page")
        } else {
            params.set("page", pageNum.toString())
        }

        if (pageSize === 20) {
            params.delete("size")
        } else {
            params.set("size", pageSize.toString())
        }

        if (sorting.length) {
            const [sort] = sorting
            params.set("sort", `${sort.id},${sort.desc ? "desc" : "asc"}`)
        }

        const queryString = params.toString()
        const url = queryString ? `${pathname}?${queryString}` : pathname
        return url
    }, [searchParams, sorting, pathname])

    const updateUrl = useCallback((pageIndex: number, pageSize: number) => {
        const url = buildUrl(pageIndex, pageSize)
        if (typeof window !== "undefined" && window) {
            window.history.replaceState({}, "", url)
        }
    }, [buildUrl])

    useEffect(() => {
        const pageIndex = table.getState().pagination.pageIndex
        const pageSize = table.getState().pagination.pageSize
        updateUrl(pageIndex, pageSize)
    }, [table, updateUrl])

    const [totalTrips, totalHours, totalCost] = trips.reduce((acc, row) => {
        acc[0]++
        if (!row.unknown) {
            acc[1] += row.flight_hours
            acc[2] += row.flight_hours * row.aircraft.rate
        }
        return acc
    }, [0, 0, 0])

    return (
      <Card className="p-4">
        <div className="space-y-4">
            <div className="rounded-md border">
                <Table>
                    <TableHeader>
                        {table.getHeaderGroups().map((headerGroup) => (
                            <TableRow key={headerGroup.id}>
                                {headerGroup.headers.map((header) => (
                                    <TableHead key={header.id}>
                                        {header.isPlaceholder ? null : (
                                            <div
                                                className={cn(
                                                    "flex items-center space-x-2 font-semibold",
                                                    header.column.getCanSort() && "cursor-pointer select-none justify-center",
                                                    {
                                                        "hidden md:table-header-group": ["department", "flight_hours", "tail_no"].includes(header.column.id),
                                                        "table-header-group": !["department", "flight_hours", "tail_no"].includes(header.column.id)
                                                    }
                                                )}
                                                onClick={header.column.getToggleSortingHandler()}
                                            >
                                                {flexRender(
                                                    header.column.columnDef.header,
                                                    header.getContext(),
                                                )}
                                                {{
                                                    asc: <ArrowUpIcon className="ml-2 h-4 w-4" />,
                                                    desc: <ArrowDownIcon className="ml-2 h-4 w-4" />
                                                }[header.column.getIsSorted() as string] ?? null}
                                            </div>
                                        )}
                                    </TableHead>
                                ))}
                            </TableRow>
                        ))}
                    </TableHeader>
                    <TableBody>
                        {table.getRowModel().rows?.length ? (
                            table.getRowModel().rows.map((row) => (
                                <TableRow
                                    key={row.id}
                                    data-state={row.getIsSelected() && "selected"}
                                >
                                    <Link
                                        href={`/trips/${row.original.tail_no}/${row.original.date}`}
                                        className="contents hover:bg-muted/50 transition-colors group"
                                        prefetch={false}
                                    >
                                        {row.getVisibleCells().map((cell) => (
                                            <TableCell key={cell.id} className={cn(
                                                "group-hover:bg-muted/50",
                                                {
                                                    "hidden md:table-cell": ["department", "flight_hours", "tail_no"].includes(cell.column.id),
                                                    "table-cell": !["department", "flight_hours", "tail_no"].includes(cell.column.id)
                                                }
                                            )}>
                                                {cell.column.id === "route" ? (
                                                    <div className="flex flex-col">
                                                        <div className="md:hidden">
                                                            <AircraftTooltip aircraft={row.original.aircraft} />
                                                        </div>
                                                        {flexRender(
                                                            cell.column.columnDef.cell,
                                                            cell.getContext()
                                                        )}
                                                        <div className="flex md:hidden flex-row justify-between mt-2">
                                                            <div className="text-sm text-muted-foreground">
                                                                {row.original.department}
                                                                {row.original.division && (
                                                                    <small className="block">{row.original.division}</small>
                                                                )}
                                                            </div>
                                                            <div className="text-sm text-muted-foreground mt-2 md:mt-0">
                                                                <span className="flex items-center">
                                                                    <Timer className="h-4 w-4 mr-1" />
                                                                    {formatDuration(row.original.flight_hours)}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    flexRender(
                                                        cell.column.columnDef.cell,
                                                        cell.getContext()
                                                    )
                                                )}
                                            </TableCell>
                                        ))}
                                    </Link>
                                </TableRow>
                            ))
                        ) : (
                            <TableRow>
                                <TableCell
                                    colSpan={columns.length}
                                    className="h-24 text-center"
                                >
                                    No results.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>

            <div className="flex md:flex-row flex-col items-center justify-between px-2 space-y-4 md:space-y-0">
                <div className="flex-1 text-sm text-muted-foreground items-center">
                    <span className="font-semibold">{totalTrips.toLocaleString()}</span> trip{totalTrips>1?'s':''}{" "}
                    <small>w/</small>{" "}
                    <span className="font-semibold">{totalHours.toLocaleString()}</span> flight hours{" "}
                    <small>&</small> <span className="font-semibold">${totalCost.toLocaleString()}</span> invoiced to agencies
                </div>
                <div className="flex md:flex-row flex-col-reverse items-center md:space-x-6 lg:space-x-8">
                    <div className="flex items-center space-x-2 md:mt-0 mt-4">
                        <p className="text-sm font-medium">Trips per page</p>
                        <Select
                            value={`${table.getState().pagination.pageSize}`}
                            onValueChange={(value) => {
                                table.setPageSize(Number(value))
                            }}
                        >
                            <SelectTrigger className="h-8 w-[70px]">
                                <SelectValue placeholder={table.getState().pagination.pageSize} />
                            </SelectTrigger>
                            <SelectContent side="top">
                                {[10, 20, 30, 40, 50].map((pageSize) => (
                                    <SelectItem key={pageSize} value={`${pageSize}`}>
                                        {pageSize}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="flex items-center justify-center xs:mx-auto">
                        <Pagination>
                            <PaginationContent>
                                <PaginationItem>
                                    <PaginationPrevious
                                        onClick={
                                            (e) => { e.preventDefault(); table.previousPage() }
                                        }
                                        isActive={table.getCanPreviousPage()}
                                        aria-disabled={!table.getCanPreviousPage()}
                                        className={table.getCanPreviousPage() ? "" : "cursor-not-allowed opacity-50"}
                                        href={buildUrl(table.getState().pagination.pageIndex - 1, table.getState().pagination.pageSize)}
                                    />
                                </PaginationItem>

                                {/* First Page */}
                                <PaginationItem>
                                    <PaginationLink
                                        onClick={(e) => { e.preventDefault(); table.setPageIndex(0) }}
                                        isActive={table.getState().pagination.pageIndex === 0}
                                        href={buildUrl(0, table.getState().pagination.pageSize)}
                                    >
                                        1
                                    </PaginationLink>
                                </PaginationItem>

                                {/* Show ellipsis if not at start */}
                                {table.getState().pagination.pageIndex > 2 && (
                                    <PaginationItem>
                                        <PaginationEllipsis />
                                    </PaginationItem>
                                )}

                                {/* Current page neighborhood */}
                                {Array.from({ length: 3 }, (_, i) => {
                                    const page = table.getState().pagination.pageIndex - 1 + i
                                    if (page <= 0 || page >= table.getPageCount() - 1) return null
                                    return (
                                        <PaginationItem key={page}>
                                            <PaginationLink
                                                onClick={(e) => { e.preventDefault(); table.setPageIndex(page) }}
                                                isActive={table.getState().pagination.pageIndex === page}
                                                href={buildUrl(page, table.getState().pagination.pageSize)}
                                            >
                                                {page + 1}
                                            </PaginationLink>
                                        </PaginationItem>
                                    )
                                })}

                                {/* Show ellipsis if not at end */}
                                {table.getState().pagination.pageIndex < table.getPageCount() - 3 && (
                                    <PaginationItem>
                                        <PaginationEllipsis />
                                    </PaginationItem>
                                )}

                                {/* Last Page */}
                                {table.getPageCount() > 1 && (
                                    <PaginationItem>
                                        <PaginationLink
                                            onClick={(e) => { e.preventDefault(); table.setPageIndex(table.getPageCount() - 1) }}
                                            isActive={table.getState().pagination.pageIndex === table.getPageCount() - 1}
                                            href={buildUrl(table.getPageCount() - 1, table.getState().pagination.pageSize)}
                                        >
                                            {table.getPageCount()}
                                        </PaginationLink>
                                    </PaginationItem>
                                )}

                                <PaginationItem>
                                    <PaginationNext
                                        onClick={(e) => { e.preventDefault(); table.nextPage() }}
                                        isActive={table.getCanNextPage()}
                                        aria-disabled={!table.getCanNextPage()}
                                        className={table.getCanNextPage() ? "" : "cursor-not-allowed opacity-50"}
                                        href={buildUrl(table.getState().pagination.pageIndex + 1, table.getState().pagination.pageSize)}
                                    />
                                </PaginationItem>
                            </PaginationContent>
                        </Pagination>
                    </div>
                </div>
            </div>
        </div>
      </Card>
    )
}