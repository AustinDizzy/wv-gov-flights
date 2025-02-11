const {execSync} = require('child_process');
const fs = require('fs');

const [,, dbPath='data/data.db'] = process.argv;

try {
  const [count, first, last, hours] = execSync(`sqlite3 ${dbPath} "SELECT COUNT(*),MIN(date),MAX(date),ROUND(SUM(flight_hours),1) FROM trips;"`).toString().trim().split('|');
  
  const fmt = d => d ? new Date(d).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : 'N/A';
  const [firstDate, lastDate] = [first, last].map(fmt);
  const totalTrips = parseInt(count).toLocaleString();
  const totalHours = parseFloat(hours).toLocaleString();

  let md = fs.readFileSync('README.md', 'utf8');
  
  const sql = md.match(/<summary>View SQL Query<\/summary>\s*```sql\s*([\s\S]*?)\s*```/)[1].trim();
  const table = execSync(`sqlite3 -markdown ${dbPath} "${sql}"`).toString().trim();
  
  md = md.replace(
    /Current data includes \*\*[0-9,]+ trips\*\* spanning from \*\*[^*]+\*\* to \*\*[^*]+\*\* totaling \*\*[^*]+ flight hours\*\*\./,
    `Current data includes **${totalTrips} trips** spanning from **${firstDate}** to **${lastDate}** totaling **${totalHours} flight hours**.`
  ).replace(
    /(<td>\s*\n)\s*[\s\S]*?(\n\s*<details>)/,
    `$1${table}$2`
  );

  fs.writeFileSync('README.md', md);
  console.log('README.md updated successfully.');
} catch(e) {
  console.error('Error updating README:', e);
  process.exit(1);
}