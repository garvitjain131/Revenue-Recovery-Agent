const orchestrator = require('../src/lib/agent-orchestrator');
const db = require('../src/lib/database');

async function processBacklog() {
  console.log('Starting batch processing of DETECTED opportunities...');
  const merchant_id = 'merchant_rzp_test';
  
  let processedCount = 0;
  
  while (true) {
    // Check if there are any detected opportunities left
    const openOpp = db.runQuery(
      `SELECT * FROM opportunities
       WHERE merchant_id = ? AND status = 'detected'
       ORDER BY revenue_at_risk DESC LIMIT 1`,
      [merchant_id]
    )[0];

    if (!openOpp) {
      console.log('No more DETECTED opportunities found. Backlog cleared!');
      break;
    }

    console.log(`\nProcessing Opportunity ID: ${openOpp.id} (Revenue at risk: ₹${openOpp.revenue_at_risk})`);
    
    try {
      const result = await orchestrator.executeAgentRun(merchant_id, 'batch_script');
      console.log(`Outcome: ${result.outcome}`);
      processedCount++;
    } catch (err) {
      console.error(`Failed to process ${openOpp.id}:`, err);
      break;
    }
  }

  console.log(`\nBatch processing complete. Processed ${processedCount} opportunities.`);
}

processBacklog();
