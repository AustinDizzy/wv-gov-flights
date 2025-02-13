'use client'

import type { FleetTrip } from '@/types'
import { useState, useCallback, useMemo, useEffect } from 'react'
import {
    ColumnDef,
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
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import Link from "next/link"
import { parseNameSlug } from '@/lib/utils'
import { ArrowUpIcon, ArrowDownIcon } from "lucide-react"
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
import { cn } from "@/lib/utils"
import { useRouter, usePathname, useSearchParams } from 'next/navigation'

interface PassengerData {
    name: string
    tripCount: number
    totalFlightHours: number
    totalPassengerCost: number
    trips: FleetTrip[]
}

interface PassengerTableProps {
    passengers: Map<string, FleetTrip[]>
}

export function PassengerDataTable({ passengers }: PassengerTableProps) {
    const router = useRouter()
    const pathname = usePathname()
    const searchParams = useSearchParams()

    const data = useMemo(() => {
        const entries = Array.from(passengers.entries())
            .filter(([name]) => name !== '') // Filter out empty names
            .map(([name, trips]): PassengerData => ({
                name,
                trips,
                tripCount: trips.length,
                totalFlightHours: trips.reduce((acc, trip) => acc + trip.flight_hours, 0),
                totalPassengerCost: trips.reduce(
                    (acc, trip) => acc + (trip.flight_hours * trip.aircraft.rate) / trip.pax.length,
                    0
                ),
            }))
        return entries
    }, [passengers])

    const columns: ColumnDef<PassengerData>[] = useMemo(() => [
        {
            accessorKey: "name",
            header: ({ column }) => (
                <Button
                    variant="ghost"
                    onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
                    className="font-semibold"
                >
                    Name
                </Button>
            ),
            cell: ({ row }) => (
                <Link href={`/passengers/${parseNameSlug(row.original.name)}`} className="text-primary hover:underline" prefetch={false}>
                    {row.original.name}
                </Link>
            ),
        },
        {
            accessorKey: "tripCount",
            header: ({ column }) => (
                <Button
                    variant="ghost"
                    onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
                    className="font-semibold"
                >
                    Trips
                </Button>
            ),
            cell: ({ row }) => row.original.tripCount,
        },
        {
            accessorKey: "totalFlightHours",
            header: ({ column }) => (
                <Button
                    variant="ghost"
                    onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
                    className="font-semibold"
                >
                    Flight Hours
                </Button>
            ),
            cell: ({ row }) => row.original.totalFlightHours.toLocaleString(),
        },
        {
            accessorKey: "totalPassengerCost",
            header: ({ column }) => (
                <Button
                    variant="ghost"
                    onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
                    className="font-semibold"
                >
                    Passenger Cost
                </Button>
            ),
            cell: ({ row }) => row.original.totalPassengerCost.toLocaleString('en-US', {
                style: 'currency',
                currency: 'USD'
            }).replace(/\.00$/, ''),
        },
    ], [])

    const currentPage = Number(searchParams.get("page")) || 1
    const currentPageSize = Number(searchParams.get("size")) || 20
    const currentSort = searchParams.get("sort") || "tripCount,name"

    const [sorting, setSorting] = useState<SortingState>(() => {
        return currentSort.split(",").map((sort) => {
            const p = sort.split(":")
            if (p.length !== 2) p.push("desc")
            return { id: p[0], desc: p[1] === "desc" }
        });
    })

    const getSortParam = (sorting: SortingState) => sorting.map(s => `${s.id}:${s.desc ? "desc" : "asc"}`).join(",")

    const table = useReactTable({
        data,
        columns,
        getCoreRowModel: getCoreRowModel(),
        getPaginationRowModel: getPaginationRowModel(),
        getSortedRowModel: getSortedRowModel(),
        onSortingChange: setSorting,
        state: {
            sorting,
            pagination: {
                pageIndex: currentPage - 1,
                pageSize: currentPageSize,
            },
        },
    })

    const updateUrl = useCallback((pageIndex: number, pageSize: number, sort?: string) => {
        const params = new URLSearchParams(searchParams.toString())

        if (pageIndex <= 0) params.delete("page")
        else params.set("page", (pageIndex + 1).toString())

        if (pageSize === 20) params.delete("size")
        else params.set("size", pageSize.toString())

        const defaultSort: SortingState = [{ id: "tripCount", desc: true }, { id: "name", desc: true }];
        if (sort && sort != getSortParam(defaultSort)) params.set("sort", sort)

        const queryString = params.toString()
        const url = `${pathname}${queryString ? `?${queryString}` : ''}`
        router.push(url)
    }, [pathname, router, searchParams])

    const handlePageChange = useCallback((newPage: number) => {
        updateUrl(newPage, table.getState().pagination.pageSize, getSortParam(sorting))
        table.setPageIndex(newPage)
    }, [sorting, table, updateUrl])

    const handlePageSizeChange = useCallback((newSize: number) => {
        updateUrl(0, newSize, getSortParam(sorting))
        table.setPageSize(newSize)
        table.setPageIndex(0)
    }, [sorting, table, updateUrl])

    useEffect(() => {
        const sortParam = getSortParam(sorting)
        updateUrl(table.getState().pagination.pageIndex, table.getState().pagination.pageSize, sortParam)
    }, [sorting, table, updateUrl])

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
                                                        "flex items-center space-x-2",
                                                        header.column.getCanSort() && "cursor-pointer select-none",
                                                        header.column.id !== "name" && "justify-center"
                                                    )}
                                                    onClick={header.column.getToggleSortingHandler()}
                                                >
                                                    <span>{flexRender(
                                                        header.column.columnDef.header,
                                                        header.getContext()
                                                    )}</span>
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
                                    <TableRow key={row.id}>
                                        {row.getVisibleCells().map((cell) => (
                                            <TableCell key={cell.id} className={cell.column.id === "name" ? "font-medium" : "text-center"}>
                                                {flexRender(
                                                    cell.column.columnDef.cell,
                                                    cell.getContext()
                                                )}
                                            </TableCell>
                                        ))}
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

                <div className="flex items-center justify-between px-2">
                    <div className="flex-1 text-sm text-muted-foreground">
                        <span className="font-semibold">{data.length.toLocaleString()}</span> passenger{data.length !== 1 ? 's' : ''}
                    </div>
                    <div className="flex items-center space-x-6 lg:space-x-8">
                        <div className="flex items-center space-x-2">
                            <p className="text-sm font-medium">Passengers per page</p>
                            <Select
                                value={`${table.getState().pagination.pageSize}`}
                                onValueChange={(value) => handlePageSizeChange(Number(value))}
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
                        <div className="flex items-center justify-center">
                            <Pagination>
                                <PaginationContent>
                                    <PaginationItem>
                                        <PaginationPrevious
                                            onClick={
                                                (e) => { e.preventDefault(); handlePageChange(table.getState().pagination.pageIndex - 1) }
                                            }
                                            isActive={table.getCanPreviousPage()}
                                            aria-disabled={!table.getCanPreviousPage()}
                                            className={table.getCanPreviousPage() ? "" : "cursor-not-allowed opacity-50"}
                                            href={"#"}
                                        />
                                    </PaginationItem>

                                    {/* First Page */}
                                    <PaginationItem>
                                        <PaginationLink
                                            onClick={(e) => { e.preventDefault(); handlePageChange(0) }}
                                            isActive={table.getState().pagination.pageIndex === 0}
                                            href={"#"}
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
                                                    onClick={(e) => { e.preventDefault(); handlePageChange(page) }}
                                                    isActive={table.getState().pagination.pageIndex === page}
                                                    href={"#"}
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
                                                onClick={(e) => { e.preventDefault(); handlePageChange(table.getPageCount() - 1) }}
                                                isActive={table.getState().pagination.pageIndex === table.getPageCount() - 1}
                                                href={"#"}
                                            >
                                                {table.getPageCount()}
                                            </PaginationLink>
                                        </PaginationItem>
                                    )}

                                    <PaginationItem>
                                        <PaginationNext
                                            onClick={(e) => { e.preventDefault(); handlePageChange(table.getState().pagination.pageIndex + 1) }}
                                            isActive={table.getCanNextPage()}
                                            aria-disabled={!table.getCanNextPage()}
                                            className={table.getCanNextPage() ? "" : "cursor-not-allowed opacity-50"}
                                            href={"#"}
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