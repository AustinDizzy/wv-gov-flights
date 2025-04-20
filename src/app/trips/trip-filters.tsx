'use client';

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Button } from '@/components/ui/button';
import { format, parse } from 'date-fns';
import { cn } from '@/lib/utils';
import type { FleetTrip, FleetMember } from '@/types';
import { Search as SearchIcon, Calendar as CalendarIcon, X, ChevronsUpDown } from 'lucide-react';
import { DateRange } from 'react-day-picker';
import { Command, CommandInput, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command";
import { Check } from "lucide-react";

interface TripsFiltersProps {
    trips: FleetTrip[];
    aircraft: FleetMember[];
    urlState: {
        search?: string;
        aircraft?: string;
        department?: string;
        division?: string;
        startDate?: string;
        endDate?: string;
        page?: number;
        size?: number;
        sort?: string;
    };
    updateUrl: (newState: Partial<TripsFiltersProps['urlState']>) => void;
    filtersActive: boolean;
}

export function TripsFilters({ trips, aircraft, urlState, updateUrl, filtersActive }: TripsFiltersProps) {
    const [searchTerm, setSearchTerm] = useState(urlState.search || '');
    const [selectedRange, setSelectedRange] = useState<{ from?: Date, to?: Date }>({
        from: urlState.startDate ? parse(urlState.startDate, 'yyyy-MM-dd', new Date()) : undefined,
        to: urlState.endDate ? parse(urlState.endDate, 'yyyy-MM-dd', new Date()) : undefined,
    });

    const departments = useMemo(() => [...new Set(trips.map(t => t.department).filter(Boolean))].sort(), [trips]);
    const divisions = useMemo(() => [...new Set(trips.map(t => t.division).filter(Boolean))].sort(), [trips]);

    useEffect(() => {
        const handler = setTimeout(() => {
            if (searchTerm !== urlState.search) {
                updateUrl({ search: searchTerm, page: 1 });
            }
        }, 500);
        return () => clearTimeout(handler);
    }, [searchTerm, urlState.search, updateUrl]);

    const handleFilterChange = (key: keyof typeof urlState, value: string | undefined) => {
        updateUrl({ [key]: value, page: 1 });
    };

    const handleDateSelect = (range: DateRange | undefined) => {
        const newStartDate = range?.from?.toISOString().split('T')[0];
        const newEndDate = range?.to?.toISOString().split('T')[0];
        setSelectedRange(range || {});
        updateUrl({
            startDate: newStartDate,
            endDate: newEndDate,
            page: 1,
        });
    };

    const clearFilters = useCallback(() => {
        setSearchTerm('');
        setSelectedRange({});
        const clearState: Partial<typeof urlState> = {};
        ['search', 'aircraft', 'department', 'division', 'startDate', 'endDate'].forEach(key => clearState[key as keyof typeof urlState] = undefined);
        clearState.page = 1;
        updateUrl(clearState);
    }, [updateUrl]);

    return (
        <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-5 items-end">
            <div className="col-span-full relative">
                <Label htmlFor="trip-search" className="sr-only">Search Trips</Label>
                <SearchIcon className="text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 opacity-50" />
                <Input
                    id="trip-search"
                    placeholder="Search route, passengers, dept, division, comments..."
                    className="pl-10 w-full h-9"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>
            {aircraft.length > 0 && (
                <div>
                    <Label className="text-sm mb-1 block">Aircraft</Label>
                    <Select value={urlState.aircraft || ''} onValueChange={(value) => handleFilterChange('aircraft', value || undefined)}>
                        <SelectTrigger className="h-9">
                            <SelectValue placeholder="All aircraft" />
                        </SelectTrigger>
                        <SelectContent>
                            {aircraft.filter(a => a.trip_count > 0).map((a) => (
                                <SelectItem key={a.tail_no} value={a.tail_no}>{a.tail_no} - {a.name}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            )}
            <div>
                <Label className="text-sm mb-1 block">Date Range</Label>
                <Popover>
                    <PopoverTrigger asChild>
                        <Button
                            variant="outline"
                            className="w-full justify-start text-left h-9 px-3 py-2 text-sm bg-transparent border border-input hover:text-accent-foreground font-normal"
                        >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {selectedRange.from || selectedRange.to ? (
                                <>
                                    {selectedRange.from && format(selectedRange.from, 'PP')}
                                    {selectedRange.to && ' - '}
                                    {selectedRange.to && format(selectedRange.to, 'PP')}
                                </>
                            ) : (
                                <span>Pick a date range</span>
                            )}
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                            mode="range"
                            defaultMonth={selectedRange.from || new Date()}
                            selected={selectedRange.from || selectedRange.to ? { from: selectedRange.from, to: selectedRange.to } : undefined}
                            onSelect={handleDateSelect}
                            initialFocus
                        />
                    </PopoverContent>
                </Popover>
            </div>
            <div>
                <Label className="text-sm mb-1 block">Department</Label>
                <Popover>
                    <PopoverTrigger asChild>
                        <Button
                            variant="outline"
                            role="combobox"
                            className="w-full justify-between h-9 px-3 py-2 text-sm bg-transparent border border-input hover:text-accent-foreground font-normal"
                        >
                            {urlState.department
                                ? departments.find((dept) => dept === urlState.department) || "Select department..."
                                : "Select department..."}
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                        <Command>
                            <CommandInput placeholder="Search department..." />
                            <CommandEmpty>No department found.</CommandEmpty>
                            <CommandGroup>
                                <CommandItem
                                    key="all-dept"
                                    onSelect={() => handleFilterChange('department', undefined)}
                                    className="cursor-pointer"
                                >
                                    <Check
                                        className={cn("mr-2 h-4 w-4", !urlState.department ? "opacity-100" : "opacity-0")}
                                    />
                                    All Departments
                                </CommandItem>
                                {departments.map((dept) => (
                                    <CommandItem
                                        key={dept}
                                        onSelect={() => handleFilterChange('department', dept)}
                                        className="cursor-pointer"
                                    >
                                        <Check
                                            className={cn("mr-2 h-4 w-4", urlState.department === dept ? "opacity-100" : "opacity-0")}
                                        />
                                        {dept}
                                    </CommandItem>
                                ))}
                            </CommandGroup>
                        </Command>
                    </PopoverContent>
                </Popover>
            </div>
            {divisions.length > 0 && (
                <div>
                    <Label className="text-sm mb-1 block">Division</Label>
                    <Select value={urlState.division || ''} onValueChange={(value) => handleFilterChange('division', value || undefined)} disabled={!urlState.department}>
                        <SelectTrigger className="h-9" disabled={!urlState.department}>
                            <SelectValue placeholder="All divisions" />
                        </SelectTrigger>
                        <SelectContent>
                            {divisions
                                .filter(div => div != undefined)
                                .filter(div => div.length > 0)
                                .filter(div => !urlState.department || trips.some(t => t.department === urlState.department && t.division === div))
                                .map((div) => (
                                    <SelectItem key={div} value={div}>{div}</SelectItem>
                                ))}
                        </SelectContent>
                    </Select>
                </div>
            )}
            {filtersActive && (
                <div className={cn(divisions.length === 0 && "lg:col-start-5")}>
                    <Button
                        onClick={clearFilters}
                        variant="default"
                        className="w-full h-9"
                    >
                        <X className="h-4 w-4 mr-2" />
                        Clear Filters
                    </Button>
                </div>
            )}
        </div>
    );
}