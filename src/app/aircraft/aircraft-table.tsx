'use client'

import type { FleetMember } from '@/types'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { Card } from "@/components/ui/card"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Info } from 'lucide-react'


export function AircraftTable({ fleet }: {
    fleet: FleetMember[]
}) {
    return (
        <>
        <Card>
            <Table>
                <TableHeader>
                    <TableRow className='font-bold'>
                        <TableHead>Tail Number</TableHead>
                        <TableHead>Aircraft</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead className="text-right">Rate ($/hr)</TableHead>
                        <TableHead className="text-right">Trip Data</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {fleet.map((aircraft) => (
                        <TableRow key={aircraft.tail_no}>
                            <TableCell className="font-medium">
                                <Link href={`/aircraft/${aircraft.tail_no}`} className="text-primary hover:underline">
                                    {aircraft.tail_no}
                                </Link>
                            </TableCell>
                            <TableCell>{aircraft.name}</TableCell>
                            <TableCell>
                                <Badge
                                    variant={aircraft.type === 'airplane' ? 'secondary' : 'default'}
                                >
                                    {aircraft.type}
                                </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                                ${aircraft.rate.toLocaleString()}
                            </TableCell>
                            <TableCell className="text-right">
                                {aircraft.trip_count > 0 && <Link
                                    href={`/trips/${aircraft.tail_no}`}
                                    className="text-primary hover:underline"
                                >
                                    {aircraft.trip_count} trips
                                </Link>}
                                {aircraft.trip_count === 0 && (
                                    <span className="text-gray-500">--</span>
                                )}
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </Card>
        <div className="text-xs text-muted-foreground/50 flex items-center justify-end cursor-pointer mt-2">
            <Info size={12} className="inline mr-1" />
            N2WV was decommissioned in 2021.
        </div>
        </>
    )
}