'use client';

import React, { useState, useMemo, useEffect, useCallback, useTransition } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationPrevious, PaginationNext, PaginationEllipsis } from '@/components/ui/pagination';
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { FleetTrip, FleetMember } from '@/types';
import { flexRender, getCoreRowModel, getSortedRowModel, getPaginationRowModel, useReactTable, SortingState } from '@tanstack/react-table';
import { TripsFilters } from './trip-filters';
import { columns } from './columns';
import { parse } from 'date-fns';

interface TripsTableProps {
    trips: FleetTrip[];
    aircraft?: FleetMember[];
    variant?: 'default' | 'mini';
    defaultPageSize?: number;
}

const allowedFilters = ['search', 'aircraft', 'department', 'division', 'startDate', 'endDate'];

export function TripsTable({ trips, aircraft = [], variant = 'default', defaultPageSize = 10 }: TripsTableProps) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const [, startTransition] = useTransition();

    const showFilters = variant === 'default' && trips.length > defaultPageSize;
    const showPagination = variant === 'default' && trips.length > defaultPageSize;

    const urlState = useMemo(() => {
        if (!showFilters) return {};
        const params = new URLSearchParams(searchParams.toString());
        return {
            page: Number(params.get('page')) || 1,
            size: Number(params.get('size')) || defaultPageSize,
            sort: params.get('sort') || '',
            search: params.get('search') || '',
            aircraft: params.get('aircraft') || '',
            department: params.get('department') || '',
            division: params.get('division') || '',
            startDate: params.get('startDate') || '',
            endDate: params.get('endDate') || '',
        };
    }, [searchParams, defaultPageSize, showFilters]);

    const initialSorting = useMemo<SortingState>(() => {
        if (showFilters && urlState.sort) {
            const [id, desc] = urlState.sort.split(':');
            return [{ id, desc: desc === 'desc' }];
        }
        return [{ id: 'date', desc: true }];
    }, [showFilters, urlState.sort]);
    const [sorting, setSorting] = useState<SortingState>(initialSorting);

    const buildUrl = useCallback(
        (newState: Partial<typeof urlState>) => {
            if (!showFilters) return pathname;

            const params = new URLSearchParams(searchParams.toString());
            const currentSorting = sorting;
            const currentState = { ...urlState, ...newState };


            if ((currentState.page || 0) <= 1) {
                params.delete('page');
            } else {
                params.set('page', String(currentState.page));
            }

            if (currentState.size === defaultPageSize) {
                params.delete('size');
            } else {
                params.set('size', String(currentState.size));
            }

            if (currentSorting.length) {
                const [sort] = currentSorting;
                if (!(sort.id === 'date' && sort.desc === true)) {
                    params.set('sort', `${sort.id}:${sort.desc ? 'desc' : 'asc'}`);
                } else {
                    params.delete('sort');
                }
            } else {
                params.delete('sort');
            }

            allowedFilters.forEach((key) => {
                const value = currentState[key as keyof typeof urlState];
                if (value) {
                    params.set(key, String(value));
                } else {
                    params.delete(key);
                }
            });

            const queryString = params.toString();
            return queryString ? `${pathname}?${queryString}` : pathname;
        },
        [showFilters, searchParams, urlState, sorting, defaultPageSize, pathname]
    );

    const updateUrl = useCallback(
        (newState: Partial<typeof urlState>) => {
            if (!showFilters) return;
            startTransition(() => {
                router.push(buildUrl(newState), { scroll: false });
            });
        },
        [showFilters, buildUrl, router]
    );

    useEffect(() => {
        if (!showFilters) return;
        const currentUrlSortString = urlState.sort || '';
        const [sortCol, sortOrder] = sorting.length ? [sorting[0].id, sorting[0].desc] : ['', false];

        if (sortCol === 'date' && sortOrder === true) {
            if (currentUrlSortString) {
                updateUrl({ sort: undefined });
            }
        } else if (sorting.length) {
            const stateSortString = `${sortCol}:${sortOrder ? 'desc' : 'asc'}`;
            if (stateSortString !== currentUrlSortString) {
                updateUrl({ sort: stateSortString });
            }
        } else if (currentUrlSortString) {
            updateUrl({ sort: undefined });
        }
    }, [sorting, showFilters, updateUrl, urlState.sort, defaultPageSize]);

    const filteredTrips = useMemo(() => {
        if (!showFilters) return trips;

        return trips.filter((trip) => {
            const tripDate = parse(trip.date, 'yyyy-MM-dd', new Date());
            const startDate = urlState.startDate ? parse(urlState.startDate, 'yyyy-MM-dd', new Date()) : null;
            const endDate = urlState.endDate ? parse(urlState.endDate, 'yyyy-MM-dd', new Date()) : null;

            if (urlState.aircraft && trip.tail_no !== urlState.aircraft) return false;
            if (urlState.department && trip.department !== urlState.department) return false;
            if (urlState.division && trip.division !== urlState.division) return false;
            if (startDate && tripDate < startDate) return false;
            if (endDate && tripDate > endDate) return false;
            if (urlState.search) {
                const searchTermLower = urlState.search.toLowerCase();
                const searchableFields = [
                    trip.route,
                    trip.passengers,
                    trip.department,
                    trip.division,
                    trip.comments,
                ]
                    .filter(Boolean)
                    .join(' ')
                    .toLowerCase();
                if (!searchableFields.includes(searchTermLower)) return false;
            }
            return true;
        });
    }, [trips, urlState, showFilters]);

    const [totalTrips, totalHours, totalCost] = useMemo(() => {
        const dataSet = showFilters ? filteredTrips : trips;
        return dataSet.reduce(
            (acc, row) => {
                acc[0]++;
                if (!row.unknown) {
                    acc[1] += row.flight_hours;
                    acc[2] += row.flight_hours * row.aircraft.rate;
                }
                return acc;
            },
            [0, 0, 0] as [number, number, number]
        );
    }, [filteredTrips, trips, showFilters]);

    const table = useReactTable({
        data: filteredTrips,
        columns,
        state: {
            sorting,
            pagination: {
                pageIndex: showPagination ? (urlState.page ? urlState.page - 1 : 0) : 0,
                pageSize: showPagination ? (urlState.size || defaultPageSize) : filteredTrips.length,
            },
        },
        onSortingChange: setSorting,
        onPaginationChange: (updater) => {
            if (!showPagination) return;
            if (typeof updater === 'function') {
                const newState = updater(table.getState().pagination);
                updateUrl({ page: newState.pageIndex + 1, size: newState.pageSize });
            } else {
                updateUrl({ page: updater.pageIndex + 1, size: updater.pageSize });
            }
        },
        getCoreRowModel: getCoreRowModel(),
        getSortedRowModel: getSortedRowModel(),
        getPaginationRowModel: getPaginationRowModel(),
        manualPagination: false,
        manualSorting: false,
        autoResetPageIndex: false,
    });

    useEffect(() => {
        if (!showPagination) {
            table.setPageSize(filteredTrips.length);
        } else {
            table.setPageSize(urlState.size || defaultPageSize);
        }
    }, [showPagination, filteredTrips.length, table, urlState.size, defaultPageSize]);

    const renderPaginationLinks = () => {
        if (!showPagination) return null;

        const { pageIndex } = table.getState().pagination;
        const pageCount = table.getPageCount();

        if (pageCount <= 1) return null;

        return (
            <>
                <PaginationItem>
                    <PaginationLink
                        onClick={(e) => {
                            e.preventDefault();
                            table.setPageIndex(0);
                        }}
                        isActive={pageIndex === 0}
                        href={buildUrl({ page: 1 })}
                    >
                        1
                    </PaginationLink>
                </PaginationItem>
                {pageIndex > 2 && (
                    <PaginationItem>
                        <PaginationEllipsis />
                    </PaginationItem>
                )}
                {Array.from({ length: 3 }, (_, i) => {
                    const page = pageIndex - 1 + i;
                    if (page <= 0 || page >= pageCount - 1) return null;
                    return (
                        <PaginationItem key={page}>
                            <PaginationLink
                                onClick={(e) => {
                                    e.preventDefault();
                                    table.setPageIndex(page);
                                }}
                                isActive={pageIndex === page}
                                href={buildUrl({ page: page + 1 })}
                            >
                                {page + 1}
                            </PaginationLink>
                        </PaginationItem>
                    );
                })}
                {pageIndex < pageCount - 3 && (
                    <PaginationItem>
                        <PaginationEllipsis />
                    </PaginationItem>
                )}
                {pageCount > 1 && (
                    <PaginationItem>
                        <PaginationLink
                            onClick={(e) => {
                                e.preventDefault();
                                table.setPageIndex(pageCount - 1);
                            }}
                            isActive={pageIndex === pageCount - 1}
                            href={buildUrl({ page: pageCount })}
                        >
                            {pageCount}
                        </PaginationLink>
                    </PaginationItem>
                )}
            </>
        );
    };

    const isHiddenOnMobile = (columnId: string) =>
        ['department', 'flight_hours', 'tail_no'].includes(columnId);

    const filtersActive = showFilters && allowedFilters.some((key) => urlState[key as keyof typeof urlState]);

    return (
        <Card className={showFilters ? 'p-4 space-y-4' : ''}>
            {showFilters && (
                <TripsFilters
                    trips={trips}
                    aircraft={aircraft}
                    urlState={urlState}
                    updateUrl={updateUrl}
                    filtersActive={filtersActive}
                />
            )}
            <div className="rounded-md border">
                <Table>
                    <TableHeader>
                        {table.getHeaderGroups().map((headerGroup) => (
                            <TableRow key={headerGroup.id}>
                                {headerGroup.headers.map((header) => (
                                    <TableHead
                                        key={header.id}
                                        className={cn(
                                            isHiddenOnMobile(header.column.id) ? 'hidden md:table-cell' : '',
                                            header.column.getCanSort() ? 'cursor-pointer select-none' : ''
                                        )}
                                    >
                                        <div
                                            className={cn(
                                                'flex items-center',
                                                header.column.id === 'date' || header.column.id === 'flight_hours' || header.column.id === 'tail_no'
                                                    ? 'justify-center'
                                                    : ''
                                            )}
                                            onClick={header.column.getToggleSortingHandler()}
                                        >
                                            {flexRender(header.column.columnDef.header, header.getContext())}
                                        </div>
                                    </TableHead>
                                ))}
                            </TableRow>
                        ))}
                    </TableHeader>
                    <TableBody>
                        {table.getRowModel().rows.length ? (
                            table.getRowModel().rows.map((row) => (
                                <TableRow key={row.id} data-state={row.getIsSelected() && 'selected'} className="group hover:bg-muted/50 transition-colors">
                                    {row.getVisibleCells().map((cell) => (
                                        <TableCell
                                            key={cell.id}
                                            className={cn(
                                                isHiddenOnMobile(cell.column.id) ? 'hidden md:table-cell' : '',
                                                cell.column.id === 'route' ? 'py-1' : ''
                                            )}
                                        >
                                            <Link
                                                href={`/trips/${row.original.tail_no}/${row.original.date}`}
                                                className="block w-full h-full"
                                                prefetch={false}
                                            >
                                                {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                            </Link>
                                        </TableCell>
                                    ))}
                                </TableRow>
                            ))
                        ) : (
                            <TableRow>
                                <TableCell colSpan={columns.length} className="text-center h-24">
                                    No results found.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>
            {showPagination && (
                <div className="flex md:flex-row flex-col items-center justify-between px-4 py-3 border-t space-y-4 md:space-y-0">
                    <div className="flex-1 text-sm text-muted-foreground">
                        <span className="font-semibold">{totalTrips.toLocaleString()}</span> trip{totalTrips !== 1 ? 's' : ''}{' '}
                        <small>w/</small>{' '}
                        <span className="font-semibold">{totalHours.toLocaleString(undefined, { maximumFractionDigits: 1 })}</span> flight hours{' '}
                        <small>&</small>{' '}
                        <span className="font-semibold">
                            ${totalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/\.00$/, '')}
                        </span>{' '}
                        invoiced
                    </div>
                    <div className="flex md:flex-row flex-col-reverse items-center md:space-x-6 lg:space-x-8 gap-4 md:gap-0">
                        <div className="flex items-center space-x-2">
                            <p className="text-sm font-medium">Rows per page</p>
                            <Select
                                value={table.getState().pagination.pageSize.toString()}
                                onValueChange={(value) => table.setPageSize(Number(value))}
                            >
                                <SelectTrigger className="h-8 w-[70px]">
                                    <SelectValue placeholder={table.getState().pagination.pageSize} />
                                </SelectTrigger>
                                <SelectContent side="top" align="center" className="min-w-[70px]">
                                    {[10, 20, 30, 50, 100].map((pageSize) => (
                                        <SelectItem key={pageSize} value={pageSize.toString()} className="text-center">
                                            {pageSize}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="flex items-center gap-4">
                            <Pagination className="bg-background border rounded-md px-1 py-0.5 shadow-sm">
                                <PaginationContent className="flex items-center">
                                    <PaginationItem>
                                        <PaginationPrevious
                                            onClick={(e) => {
                                                e.preventDefault();
                                                if (table.getCanPreviousPage()) {
                                                    table.previousPage();
                                                }
                                            }}
                                            aria-disabled={!table.getCanPreviousPage()}
                                            className={cn(!table.getCanPreviousPage() && 'pointer-events-none opacity-50')}
                                            href={buildUrl({ page: Math.max(1, table.getState().pagination.pageIndex) })}
                                        />
                                    </PaginationItem>
                                    {renderPaginationLinks()}
                                    <PaginationItem>
                                        <PaginationNext
                                            onClick={(e) => {
                                                e.preventDefault();
                                                if (table.getCanNextPage()) {
                                                    table.nextPage();
                                                }
                                            }}
                                            aria-disabled={!table.getCanNextPage()}
                                            className={cn(!table.getCanNextPage() && 'pointer-events-none opacity-50')}
                                            href={buildUrl({ page: table.getState().pagination.pageIndex + 2 })}
                                        />
                                    </PaginationItem>
                                </PaginationContent>
                            </Pagination>
                        </div>
                    </div>
                </div>
            )}
        </Card>
    );
}