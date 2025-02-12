'use client';

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FleetTrip } from "@/types";
import { ChartColumn } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, TooltipProps } from 'recharts';

interface TripActivityChartProps {
    trips: FleetTrip[];
}

export function TripActivityChart({ trips }: TripActivityChartProps) {
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

    const formatDate = (date: string) => isMobile ? date.replace(/(\w+) (\d{2})\d{2}/, '$1 $2') : date;

    const data = trips.reduce((acc, trip) => {
        const month = new Date(trip.date).toLocaleString('default', { month: 'short', year: 'numeric' });
        acc[month] = (acc[month] || 0) + 1;
        return acc;
    }, {} as Record<string, number>);

    const chartData = Object.entries(data)
        .map(([date, count]) => ({ date, count, formattedDate: formatDate(date) }))
        .sort((a, b) => a.date.localeCompare(b.date));

    const CustomTooltip = ({ active, payload, label }: TooltipProps<number, number>) => {
        if (active && payload && payload.length) {
            return (
                <div className="bg-card text-card-foreground p-3 rounded-lg shadow-lg border border-border">
                    <p className="font-medium">{label}</p>
                    <p className="text-muted-foreground">
                        {payload[0].value} trip{payload[0].value !== 1 ? 's' : ''}
                        {' '}({(((payload[0].value || 0) / trips.length) * 100).toFixed(1)}% of total)
                    </p>
                </div>
            );
        }
        return null;
    };

    return (
        <Card>
            <CardHeader className="space-y-1">
                <CardTitle className="text-xl flex items-center cursor-pointer">
                    <ChartColumn size={20} className="inline-block mr-2" />
                    Trip Activity
                </CardTitle>
                <p className="text-sm text-muted-foreground">Monthly distribution of flights</p>
            </CardHeader>
            <CardContent>
                <div className="h-96 md:h-80">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart 
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
                                interval={Math.floor(chartData.length / 6)}
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
                                dataKey="count"
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