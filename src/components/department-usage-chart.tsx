'use client';

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { filterTrips } from "@/lib/utils";
import type { FleetTrip } from "@/types";
import { ChartPie } from "lucide-react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { useSearchParams } from 'next/navigation';

interface DepartmentUsageChartProps {
    trips: FleetTrip[];
}

export function DepartmentUsageChart({ trips }: DepartmentUsageChartProps) {
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
    const searchParams = useSearchParams();
    const truncateName = (name: string) => {
        if (!isMobile) return name;
        return name.length > 20 ? name.slice(0, 18) + '...' : name;
    };

    const type = (searchParams.has('department') ? 'division' : 'department') as 'division' | 'department';
    const filteredTrips = filterTrips(trips, {
        aircraft: searchParams.get('aircraft') || undefined,
        department: searchParams.get('department') || undefined,
        division: searchParams.get('division') || undefined,
        search: searchParams.get('search') || undefined,
        startDate: searchParams.get('startDate') || undefined,
        endDate: searchParams.get('endDate') || undefined,
    });

    const data = filteredTrips.reduce((acc, trip) => {
        if (type === 'division') {
            if (!trip.division) return acc;
            acc[trip.division] = (acc[trip.division] || 0) + 1;
        } else if (type === 'department') {
            acc[trip.department] = (acc[trip.department] || 0) + 1;
        }
        return acc;
    }, {} as Record<string, number>);

    const chartData = Object.entries(data)
        .map(([name, value]) => ({ 
            name,
            displayName: truncateName(name),
            value 
        }))
        .sort((a, b) => b.value - a.value)
        .slice(0, isMobile ? 5 : 8);

    const COLORS = Array.from({ length: 8 }, (_, i) => `hsl(var(--chart-${(i % 5) + 1}))`);

    const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: { payload: { name: string; value: number } }[] }) => {
        if (active && payload && payload.length) {
            return (
                <div className="bg-card text-card-foreground p-3 rounded-lg shadow-lg border border-border">
                    <p className="font-medium">{payload[0].payload.name}</p>
                    <p className="text-muted-foreground">
                        {payload[0].payload.value} trips ({((payload[0].payload.value / trips.length) * 100).toFixed(1)}%)
                    </p>
                </div>
            );
        }
        return null;
    };

    return (
        chartData.length > 1 && <Card>
            <CardHeader className="space-y-1">
                <CardTitle className="text-xl capitalize flex items-center cursor-pointer">
                    <ChartPie size={20} className="inline mr-2" />
                    {type} Usage
                </CardTitle>
                <p className="text-sm text-muted-foreground">Distribution of trips across {type}s{type == 'division' && ' of the ' + searchParams.get("department")}</p>
            </CardHeader>
            <CardContent>
                <div className="h-96 md:h-80">
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie
                                data={chartData}
                                dataKey="value"
                                nameKey="displayName"
                                cx={isMobile ? "50%" : "40%"}
                                cy="50%"
                                outerRadius={isMobile ? 80 : 100}
                                innerRadius={isMobile ? 50 : 60}
                                paddingAngle={2}
                            >
                                {chartData.map((entry, index) => (
                                    <Cell 
                                        key={`cell-${index}`} 
                                        fill={COLORS[index]}
                                        className="transition-opacity duration-200 hover:opacity-80"
                                    />
                                ))}
                            </Pie>
                            <Tooltip content={<CustomTooltip />} />
                            <Legend
                                layout={isMobile ? "horizontal" : "vertical"}
                                align={isMobile ? "center" : "right"}
                                verticalAlign={isMobile ? "bottom" : "middle"}
                                className="text-xs md:text-sm"
                                wrapperStyle={{
                                    paddingTop: isMobile ? "20px" : "0",
                                    paddingLeft: isMobile ? "0" : "40px",
                                    width: isMobile ? "100%" : "auto",
                                    display: "flex",
                                    flexWrap: "wrap",
                                    justifyContent: isMobile ? "center" : "right",
                                    gap: "8px"
                                }}
                                formatter={(value) => (
                                    <span className="text-muted-foreground">{value}</span>
                                )}
                            />
                        </PieChart>
                    </ResponsiveContainer>
                </div>
            </CardContent>
        </Card>
    );
}