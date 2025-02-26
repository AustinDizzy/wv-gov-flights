'use client';

import { useCallback, useTransition } from "react"
import { useRouter, usePathname, useSearchParams } from "next/navigation"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import type { FleetMember } from "@/types"
import { Button } from "@/components/ui/button"
import { X, Search } from "lucide-react"
import { useState, useEffect } from "react"

interface PassengersFilterProps {
    aircraft: FleetMember[]
    departments: string[]
}

export function PassengersFilter({ aircraft, departments }: PassengersFilterProps) {
    const router = useRouter()
    const pathname = usePathname()
    const searchParams = useSearchParams()
    const [, startTransition] = useTransition()
    const [searchTerm, setSearchTerm] = useState(searchParams.get('search') || '')

    const createQueryString = useCallback(
        (params: Record<string, string | undefined>) => {
            const newSearchParams = new URLSearchParams(searchParams.toString())
            Object.entries(params).forEach(([key, value]) => {
                if (value) {
                    newSearchParams.set(key, value)
                } else {
                    newSearchParams.delete(key)
                }
            })
            return newSearchParams;
        },
        [searchParams]
    )

    const updateFilter = useCallback(
        (params: Record<string, string | undefined>) => {
            startTransition(() => {
                const qs = createQueryString(params)
                const queryString = qs.toString()
                if (queryString !== window.location.search.substring(1)) {
                    /* eslint-disable @typescript-eslint/no-explicit-any */
                    if (typeof window !== 'undefined' && (window as any).umami) {
                        (window as any).umami.track('passenger_filters', Object.fromEntries(qs));
                    }
                    router.push(`${pathname}?${queryString}`, { scroll: false })
                }
            })
        },
        [pathname, router, createQueryString]
    )

    const clearFilters = useCallback(() => {
        setSearchTerm('')
        startTransition(() => {
            router.push(pathname)
        })
    }, [pathname, router])

    useEffect(() => {
        const handler = setTimeout(() => {
            updateFilter({ search: searchTerm || undefined })
        }, 300)
        return () => clearTimeout(handler)
    }, [searchTerm, updateFilter])

    return (
        <div className="p-4 grid gap-4 md:grid-cols-3 lg:grid-cols-4">
            <div>
                <Label>Passenger Name</Label>
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" />
                    <Input
                        placeholder="Search..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-10"
                    />
                </div>
            </div>

            <div>
                <Label>Aircraft</Label>
                <Select
                    value={searchParams.get('aircraft') || ''}
                    onValueChange={(value) => updateFilter({ aircraft: value })}
                >
                    <SelectTrigger>
                        <SelectValue placeholder="Select Aircraft" />
                    </SelectTrigger>
                    <SelectContent>
                        {aircraft.filter(a => a.trip_count > 0).map((a) => (
                            <SelectItem key={a.tail_no} value={a.tail_no}>
                                {a.tail_no} - {a.name}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            <div>
                <Label>Department</Label>
                <Select
                    value={searchParams.get('department') || ''}
                    onValueChange={(value) => updateFilter({ department: value })}
                >
                    <SelectTrigger>
                        <SelectValue placeholder="Select Department" />
                    </SelectTrigger>
                    <SelectContent>
                        {departments.map((dept) => (
                            <SelectItem key={dept} value={dept}>
                                {dept}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            {(searchParams.has('search') ||
                searchParams.has('aircraft') ||
                searchParams.has('department')) && (
                    <div className="flex items-end">
                        <Button
                            onClick={clearFilters}
                            variant="outline"
                            className="w-full"
                        >
                            <X className="mr-2 h-4 w-4" />
                            Clear Filters
                        </Button>
                    </div>
                )}
        </div>
    )
}
