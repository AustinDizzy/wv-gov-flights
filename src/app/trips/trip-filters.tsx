'use client';

import { useCallback, useTransition } from "react"
import { useRouter, usePathname } from "next/navigation"
import { Input } from "@/components/ui/input"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import type { FleetMember } from "@/types"
import { Button } from "@/components/ui/button"
import { X, Search, Check, ChevronsUpDown, Calendar as CalendarIcon } from "lucide-react"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover"
import { format, parse } from "date-fns"
import { Command, CommandInput, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command"

import { useState, useEffect } from "react"
import { DateRange } from "react-day-picker"

interface TripFiltersProps {
    aircraft?: FleetMember[]
    departments: string[]
    divisions: string[]
    searchParams: {
        search?: string
        aircraft?: string
        department?: string
        division?: string
        startDate?: string
        endDate?: string
    }
}
const allowedFilters = ['search', 'aircraft', 'department', 'division', 'startDate', 'endDate']

export function TripFilters({ aircraft, departments, divisions, searchParams }: TripFiltersProps) {
    const router = useRouter()
    const pathname = usePathname()
    const [, startTransition] = useTransition()
    const [selectedRange, setSelectedRange] = useState<{ from?: Date, to?: Date }>(
        {
            from: searchParams.startDate ? parse(searchParams.startDate, 'yyyy-MM-dd', new Date()) : undefined,
            to: searchParams.endDate ? parse(searchParams.endDate, 'yyyy-MM-dd', new Date()) : undefined,
        }
    )
    const [searchTerm, setSearchTerm] = useState(searchParams.search || '')

    const createQueryString = useCallback(
        (params: Record<string, string | undefined>) => {
            const newSearchParams = new URLSearchParams()

            // Add all current params
            for (const [key, value] of Object.entries(searchParams)) {
                if (value && allowedFilters.includes(key) && !pathname.startsWith(`/${key}`)) newSearchParams.set(key, value)
            }

            // Update with new params
            for (const [key, value] of Object.entries(params).filter(([key]) => allowedFilters.includes(key))) {
                if (pathname.startsWith(`/${key}`)) continue
                if (value === undefined || value === '') {
                    newSearchParams.delete(key)
                } else {
                    newSearchParams.set(key, value)
                }
            }

            return newSearchParams.toString()
        },
        [searchParams, pathname]
    )

    const updateFilter = useCallback(
        (params: Record<string, string | undefined>) => {
            const queryString = createQueryString(params)
            if (queryString !== new URLSearchParams(window.location.search).toString()) {
                startTransition(() => {
                    router.push(`${pathname}?${queryString}`, { scroll: false })
                })
            }
        },
        [pathname, router, createQueryString]
    )

    const clearFilters = useCallback(() => {
        setSelectedRange({})
        startTransition(() => {
            router.push(pathname)
        })
    }, [pathname, router])

    const handleDateSelect = (range: DateRange | undefined) => {
        if (!range) {
            setSelectedRange({})
            updateFilter({ 'startDate': undefined, 'endDate': undefined })
            return
        }
        setSelectedRange(range)
        updateFilter({
            'startDate': range?.from?.toISOString().split('T')[0],
            'endDate': range?.to?.toISOString().split('T')[0]
        })
    };

    useEffect(() => {
        const handler = setTimeout(() => {
            updateFilter({ 'search': searchTerm })
        }, 500)

        return () => {
            clearTimeout(handler)
        }
    }, [searchTerm, updateFilter])

    return (
        <div className="p-4 grid gap-2 md:grid-cols-2 lg:grid-cols-5 z-10">
            <div className="col-span-full relative">
                <Search className="text-muted-foreground absolute left-3 top-1/2 transform -translate-y-1/2 opacity-30 focus-within:opacity-70" />
                <Input
                    placeholder="Search trips..."
                    className="pl-10 w-full"
                    defaultValue={searchParams.search}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>
            <p className="text-xs text-muted-foreground col-span-full">
                Full-text search supports on: <code>route, passengers, department, division, and comments.</code>
            </p>

            {!pathname.startsWith("/aircraft") && <div className="md:col-span-full lg:col-span-1">
                <Label className="text-sm mb-1 block">
                    Aircraft
                </Label>
                <Select
                    value={searchParams.aircraft || ''}
                    onValueChange={(value) => updateFilter({ 'aircraft': value })}
                >
                    <SelectTrigger>
                        <SelectValue placeholder="Select Aircraft" className="hover:bg-primary-foreground" />
                    </SelectTrigger>
                    <SelectContent>
                        {aircraft?.filter(a => a.trip_count > 0).map((a) => (
                            <SelectItem key={a.tail_no} value={a.tail_no}>
                                {a.tail_no} - {a.name}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>}

            <div>
                <Label className="text-sm mb-1 block">
                    Date Range
                </Label>
                <Popover>
                    <PopoverTrigger asChild>
                        <Button
                            variant="outline"
                            className="w-full justify-start text-left h-9 px-3 py-2 text-sm bg-transparent border border-input hover:text-primary-foreground"
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
                            defaultMonth={selectedRange.from ? selectedRange.from : new Date()}
                            selected={selectedRange.from || selectedRange.to ? {
                                from: selectedRange.from ? selectedRange.from : undefined,
                                to: selectedRange.to ? selectedRange.to : undefined,
                            } : undefined}
                            onSelect={handleDateSelect}
                            initialFocus
                        />
                    </PopoverContent>
                </Popover>
            </div>

            <div>
                <Label className="text-sm mb-1 block">
                    Department
                </Label>
                <Popover>
                    <PopoverTrigger asChild>
                        <Button
                            variant="outline"
                            role="combobox"
                            className="w-full justify-between h-9 px-3 py-2 text-sm bg-transparent border border-input hover:text-primary-foreground"
                        >
                            {searchParams.department
                                ? departments.find((dept) => dept === searchParams.department)
                                : "Select department..."}
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                        <Command>
                            <CommandInput placeholder="Search department..." />
                            <CommandEmpty>No department found.</CommandEmpty>
                            <CommandGroup>
                                {departments.map((dept) => (
                                    <CommandItem
                                        key={dept}
                                        onSelect={() => {
                                            updateFilter({ 'department': dept })
                                        }}
                                    >
                                        <Check
                                            className={`mr-2 h-4 w-4 ${searchParams.department === dept ? "opacity-100" : "opacity-0"}`}
                                        />
                                        {dept}
                                    </CommandItem>
                                ))}
                            </CommandGroup>
                        </Command>
                    </PopoverContent>
                </Popover>
            </div>

            {divisions.filter((div) => div.length > 0).length > 0 && (
                <div>
                    <Label className="text-sm mb-1 block">
                        Division
                    </Label>
                    <Select
                        value={searchParams.division || ''}
                        onValueChange={(value) => updateFilter({ 'division': value })}
                    >
                        <SelectTrigger>
                            <SelectValue placeholder="Select Division" />
                        </SelectTrigger>
                        <SelectContent>
                            {divisions.filter((div) => div.length > 0).map((div) => (
                                <SelectItem key={div} value={div}>
                                    {div}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            )}

            {Object.values(searchParams).some(Boolean) && (
                Object.entries(searchParams).filter(([k, v]) => v && allowedFilters.includes(k) && !(pathname.startsWith('/' + k))).length > 0
            ) && (
                    <div>
                        <Label className="text-sm mb-1 block">
                            &nbsp;
                        </Label>
                        <Button
                            onClick={clearFilters}
                            className="w-full"
                        >
                            <X className="h-4 w-4" />
                            Clear Filters
                        </Button>
                    </div>
                )}
        </div>
    )
}