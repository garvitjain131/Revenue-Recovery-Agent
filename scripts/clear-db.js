const db = require('../src/lib/database');

function clearDatabase() {
  const database = db.getDatabase();
  console.log('Clearing synthetic data...');

  const tables = ['agent_runs', 'audit_logs', 'interventions', 'opportunities', 'payments', 'customers'];
  
  for (const table of tables) {
    database.prepare(`DELETE FROM ${table}`).run();
    console.log(`- Cleared ${table}`);
  }

  console.log('Database cleared! Now running purely on Razorpay dependency.');
}

clearDatabase();
