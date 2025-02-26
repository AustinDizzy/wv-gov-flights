'use client';

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { FleetTrip } from "@/types";
import { ChartColumn, Clock, Plane, Route } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, TooltipProps } from 'recharts';
import { filterTrips, calcDistance } from "@/lib/utils";
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';

type MetricType = 'trips' | 'hours' | 'distance';

interface TripActivityChartProps {
    trips: FleetTrip[];
}

export function TripActivityChart({ trips }: TripActivityChartProps) {
    const [metric, setMetric] = useState<MetricType>('trips');
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
    const searchParams = useSearchParams();

    const formatDate = (date: string) => {
        const d = new Date(date);
        return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    };

    const filteredTrips = filterTrips(trips, {
        aircraft: searchParams.get('aircraft') || undefined,
        department: searchParams.get('department') || undefined,
        division: searchParams.get('division') || undefined,
        search: searchParams.get('search') || undefined,
        startDate: searchParams.get('startDate') || undefined,
        endDate: searchParams.get('endDate') || undefined,
    });

    // Group and sort trips by month with all metrics
    const chartData = filteredTrips.reduce((acc, trip) => {
        const date = new Date(trip.date);
        const monthKey = new Date(date.getFullYear(), date.getMonth(), 1).toISOString();
        const distance = calcDistance(trip.flight_path ? [trip.flight_path] : []);

        if (!acc.find(item => item.date === monthKey)) {
            acc.push({
                date: monthKey,
                trips: 1,
                hours: trip.flight_hours || 0,
                distance: distance,
                formattedDate: formatDate(monthKey)
            });
        } else {
            const itemIndex = acc.findIndex(item => item.date === monthKey);
            acc[itemIndex].trips += 1;
            acc[itemIndex].hours += trip.flight_hours || 0;
            acc[itemIndex].distance += distance;
        }
        
        return acc;
    }, [] as Array<{ 
        date: string;
        trips: number;
        hours: number;
        distance: number;
        formattedDate: string;
    }>).sort((a, b) => a.date.localeCompare(b.date));

    const getMetricValue = (value: number) => {
        switch (metric) {
            case 'hours':
                return value.toFixed(2).replace(/\.?0+$/,'') + ' hrs';
            case 'distance':
                return `${Math.round(value).toLocaleString()} nmi`;
            default:
                return `${value} trip${value !== 1 ? 's' : ''}`;
        }
    };

    const CustomTooltip = ({ active, payload, label }: TooltipProps<number, number>) => {
        if (active && payload && payload.length) {
            const value = payload[0].value || 0;
            const total = chartData.reduce((sum, item) => sum + (item[metric] || 0), 0);
            return (
                <div className="bg-card text-card-foreground p-3 rounded-lg shadow-lg border border-border">
                    <p className="font-medium">{label}</p>
                    <p className="text-muted-foreground">
                        {getMetricValue(value)}
                        {' '}({((value / total) * 100).toFixed(1)}% of total)
                    </p>
                </div>
            );
        }
        return null;
    };

    return (
        <Card>
            <CardHeader className="space-y-1">
                <CardTitle className="text-xl flex items-center justify-between">
                    <div className="flex items-center">
                        <ChartColumn size={20} className="inline-block mr-2" />
                        Trip Activity
                    </div>
                    <ToggleGroup type="single" value={metric} onValueChange={(value: MetricType) => value && setMetric(value)}>
                        <ToggleGroupItem value="trips" size="sm">
                            <Plane className="h-4 w-4" />
                        </ToggleGroupItem>
                        <ToggleGroupItem value="hours" size="sm">
                            <Clock className="h-4 w-4" />
                        </ToggleGroupItem>
                        <ToggleGroupItem value="distance" size="sm">
                            <Route className="h-4 w-4" />
                        </ToggleGroupItem>
                    </ToggleGroup>
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                    {metric === 'trips' && 'Monthly flight frequency'}
                    {metric === 'hours' && 'Monthly flight hours'}
                    {metric === 'distance' && 'Monthly flight distance'}
                </p>
            </CardHeader>
            <CardContent>
                <div className="h-96 md:h-80">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart 
                            key={`${metric}-${chartData.map(d => d.date + d[metric]).join('|')}`}
                            data={chartData} 
                            margin={isMobile ? 
                                { top: 20, right: 10, bottom: 60, left: 10 } : 
                                { top: 20, right: 30, bottom: 20, left: 20 }
                            }
                        >
                            <XAxis 
                                dataKey="formattedDate"
                                angle={-45} 
                                textAnchor="end" 
                                height={isMobile ? 80 : 60}
                                tick={{ 
                                    fill: 'hsl(var(--muted-foreground))', 
                                    fontSize: isMobile ? '0.7rem' : '0.8rem' 
                                }}
                                interval={isMobile ? 
                                    Math.floor(chartData.length / 4) : 
                                    Math.floor(chartData.length / 8)
                                }
                            />
                            <YAxis 
                                allowDecimals={false}
                                tick={{ 
                                    fill: 'hsl(var(--muted-foreground))', 
                                    fontSize: isMobile ? '0.7rem' : '0.8rem' 
                                }}
                                width={isMobile ? 30 : 40}
                            />
                            <Tooltip 
                                content={<CustomTooltip />}
                                labelFormatter={(label) => {
                                    const dataPoint = chartData.find(d => d.formattedDate === label);
                                    return dataPoint?.date || label;
                                }}
                            />
                            <Bar 
                                dataKey={metric}
                                radius={[4, 4, 0, 0]}
                                fill="hsl(var(--chart-1))"
                                className="transition-opacity duration-200 hover:opacity-80 bg-chart-4"
                            />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </CardContent>
        </Card>
    );
}