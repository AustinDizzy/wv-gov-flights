import Database from 'better-sqlite3';
import { promises as fs } from 'fs'
import { Trip, TripSearchParams, FleetMember, FleetTrip, DataSource } from '@/types';
import { getPax } from '@/lib/utils';
import path from 'path';

export async function getDB() {
    if (process.env.DB?.endsWith('.sqlite') || process.env.DB?.endsWith('.db')) {
        return new Database(process.env.DB);
    }

    const db = new Database(':memory:');
    const defaultSqlPath = path.join(process.cwd(), 'data', 'data.sql');
    db.exec(await fs.readFile(process.env.SQL_FILE || defaultSqlPath, 'utf8'));

    return db;
}

export async function getAircraft(tail_no?: string): Promise<FleetMember[] | undefined> {
    return getDB().then(db => db.prepare(`
        SELECT
            a.*,
            COUNT(t.id) as trip_count
        FROM aircraft a
        LEFT JOIN trips t ON a.tail_no = t.tail_no
        WHERE ${tail_no ? 'UPPER(a.tail_no) = ?' : '1=1'}
        GROUP BY a.tail_no
    `)).then(stmt => tail_no ? [stmt.get(tail_no.toUpperCase())] : stmt.all())
    .then(aircraft => {
        const p = (a: FleetMember) => {
            if (a.content && a.content.length > 0) {
                try {
                    a.content_json = JSON.parse(a.content);
                } catch (e) {
                    console.error(`Invalid JSON in content for aircraft ${a.tail_no}:`, e);
                    a.content_json = undefined;
                }
            }
            return a;
        }
        return aircraft.filter((a): a is FleetMember => a !== undefined).map(p);
    });
}

export async function getTrips(searchParams: TripSearchParams): Promise<FleetTrip[]> {
    const aircraft = await getAircraft(searchParams.aircraft) as FleetMember[];
    const where: string[] = [];

    if (searchParams?.aircraft) where.push('tail_no = @aircraft');
    if (searchParams?.department) where.push('department = @department');
    if (searchParams?.division) where.push('division = @division');
    if (searchParams?.startDate) where.push('date >= @startDate');
    if (searchParams?.endDate) where.push('date <= @endDate');
    if (searchParams?.search) where.push('rowid IN (SELECT rowid FROM trips_fts WHERE trips_fts MATCH @search)');

    const whereStmt = where.length > 0 ? where.join(' AND ') : '1=1';
    const db = await getDB();

    const trips = db
        .prepare(`SELECT * FROM trips WHERE ${whereStmt} ORDER BY date DESC`)
        .all(where.length > 0 ? searchParams : []) as Trip[];

    return trips.map(t => ({
        ...t,
        aircraft: aircraft.find(a => a.tail_no === t.tail_no) as FleetMember,
        pax: getPax(t.passengers),
        invoiced_cost: t.flight_hours * (aircraft.find(a => a.tail_no === t.tail_no)?.rate || 0),
    }));
}

export async function getPassengers(trips: FleetTrip[]): Promise<Map<string, FleetTrip[]>> {
    const passengers = new Map<string, FleetTrip[]>();
    for (const trip of trips) {
        for (const p of trip.pax) {
            if (!passengers.has(p)) passengers.set(p, []);
            passengers.get(p)?.push(trip);
        }
    }
    return passengers;
}

export async function getDataSources(trips?: FleetTrip[]): Promise<DataSource[]> {
    return getDB().then(db => {
        const datasources = db.prepare(`SELECT * FROM datasources`).all() as DataSource[];
        const where = trips ? `trip_id IN (?)` : '1=1';
        const stmt = db.prepare(`SELECT * FROM datasource_trips WHERE ${where}`);
        const ds_trips = (trips ? stmt.all(trips?.map(t => t.id)) : stmt.all()) as {datasource_id: number, trip_id: number}[];

        return datasources.map(ds => {
            ds.trips = ds_trips.filter(t => t.datasource_id === ds.id).map(t => trips?.find(trip => trip.id === t.trip_id) as Trip);
            return ds;
        });
    });
}