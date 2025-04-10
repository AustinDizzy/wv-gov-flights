import { Card } from "@/components/ui/card";
import { Table, TableBody, TableHeader, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { getDataSources } from "@/lib/db"
import Link from "next/link";
import { format, parseISO } from "date-fns";

export default async function DataSourcesPage() {
    const dataSources = await getDataSources();

    return (
        <div className='container mx-auto space-y-6 p-6'>
            <div className="max-w-7xl mx-auto space-y-6">
                <p>
                    <span className="text-lg font-semibold">Data Sources</span> are the sources of data used to populate the details of trips on State aircraft, including trip routes, passengers, justifications, costs, and other textual data displayed on this website.{" "}
                    They are primarily from requests made to government agencies under the <Link href="https://code.wvlegislature.gov/29B-1/" target="nofollow noopener" className="border-b border-dotted border-[hsl(var(--muted-foreground))]" title="W.Va. Code § 29B-1-1 et. seq.">West Virginia Freedom of Information Act (WVFOIA)</Link>.{" "}
                </p>
                <Card>
                    <Table>
                        <TableHeader>
                            <TableRow className='font-bold'>
                                <TableHead>Name</TableHead>
                                <TableHead>Source</TableHead>
                                <TableHead>Date</TableHead>
                                <TableHead>File</TableHead>
                                <TableHead>Data</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {dataSources.map((source) => (
                                <TableRow key={source.path}>
                                    <TableCell>{source.name}</TableCell>
                                    <TableCell>{source.source}</TableCell>
                                    <TableCell>{format(parseISO(source.date), "MMMM d, yyyy")}</TableCell>
                                    <TableCell>
                                        <Link href={source.path} className="text-primary hover:underline">
                                            {source.path.replace(/^.*[\\/]/, '')}
                                        </Link>
                                    </TableCell>
                                    <TableCell>
                                        {source.trips && source.trips.length > 0 ? (
                                            <>{source.trips.length} trips</>
                                        ) : (
                                            <span className="text-gray-500">--</span>
                                        )}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </Card>
            </div>
        </div>
    )
}