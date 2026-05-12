try {
  require('../src/controllers/aiCouncilController');
  require('../src/routes/aiCouncilRoutes');
  require('../src/cron/aiCouncilAuditCron');
  console.log('All modules load successfully');
} catch(e) {
  console.log('Module load error:', e.message);
}
