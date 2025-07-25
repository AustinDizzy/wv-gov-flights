# wv-gov-flights 🏛️🛩️

a website (built w/ [Next.js (v15)](https://nextjs.org/)) to display trip, passenger, and invoice data from a [SQLite(3)](https://www.sqlite.org/) database in an enriched way -- with support for basic text searches and recorded flight path visualizations using [Leaflet](https://leafletjs.com/) -- of aircraft owned & operated by the [State of West Virginia's Aviation Division](https://aviation.wv.gov)

https://wv-gov-flights.pages.dev

### License
![Creative Commons Zero v1.0](https://licensebuttons.net/p/zero/1.0/88x15.png)

This project is released into the public domain via Creative Commons Zero. See the [LICENSE](./LICENSE) file.

### Questions & Comments

See the [Frequently Asked Questions](https://github.com/AustinDizzy/wv-gov-flights/wiki/Frequently-Asked-Questions) in the repo wiki. Public questions & comments also available via email mailing list at [`~abs/wv-gov-flights@lists.sr.ht`](https://lists.sr.ht/~abs/wv-gov-flights).

## Data

Information has been sourced from public records and legal requests made under [W.Va. Code § 29B-1-1 (WVFOIA))](https://code.wvlegislature.gov/29b-1/). The intent is to keep the database updated on a semiannual basis as information is released.

Current data includes **2,106 trips** spanning from **Jan 7, 2017** to **Jul 7, 2025** totaling **6,036.2 flight hours**. See [data/schema.sql](./data/schema.sql) for the database schema.

<table>
<tr>
  <th>trips by aircraft</th>
</tr>
<tr>
  <td>

| tail_no | total_trips |  min_date  |  max_date  |
|---------|-------------|------------|------------|
| N1WV    | 407         | 2017-01-13 | 2025-06-27 |
| N2WV    | 44          | 2017-01-31 | 2021-05-05 |
| N3WV    | 540         | 2017-02-03 | 2025-07-02 |
| N5WV    | 363         | 2017-01-11 | 2025-07-02 |
| N6WV    | 311         | 2017-02-10 | 2025-07-07 |
| N890SP  | 281         | 2017-01-07 | 2025-03-21 |
| N895SP  | 160         | 2018-06-18 | 2025-05-16 |

  <details>
    <summary>View SQL Query</summary>

    ```sql
    SELECT
      tail_no,
      COUNT(*) AS total_trips,
      MIN(date) AS min_date,
      MAX(date) AS max_date
    FROM
      trips
    GROUP BY
      tail_no
    ORDER BY
      tail_no ASC,
      total_trips DESC
    ```
    </details>
  </td>
</tr>
</table>