// base data types
export interface Aircraft {
    tail_no: string;
    name: string;
    status: 'active' | 'inactive';
    type: 'helicopter' | 'airplane';
    rate: number;
    seats: number;
    content: string;
    icao_no: string;
}

export interface Trip {
    id: number | undefined
    date: string
    tail_no: string
    route: string
    passengers?: string
    department: string
    division?: string
    flight_hours: number
    comments?: string
    justification_lwb?: string
    flight_path?: string
    invoiced_cost: number
}

export interface DataSource {
    id: number;
    name: string;
    source: string;
    date: string;
    path: string;
    trips?: Trip[];
}

// app data types
export interface FleetTrip extends Trip {
    aircraft: Aircraft;
    pax: string[];
    invoiced_cost: number;
    source?: DataSource;
    unknown?: boolean;
}

export interface TripSearchParams {
    search?: string;
    aircraft?: string;
    department?: string;
    division?: string;
    startDate?: string;
    endDate?: string;
}

export interface PassengerSearchParams {
    search?: string;
    aircraft?: string;
    department?: string;
}

export interface FleetMemberContent {
    image: string;
    resources: { [key: string]: string };
}

export interface FleetMember extends Aircraft {
    trip_count: number;
    content_json?: FleetMemberContent;
}

export interface UnknownTrip {
    id?: number;
    date: string;
    tail_no: string;
    route?: string;
    flight_hours: number;
    flight_path: string;
    unknown: true;
}