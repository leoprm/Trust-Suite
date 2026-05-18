const path = require('path');
const i18next = require('i18next');
const Backend = require('i18next-fs-backend');

i18next.use(Backend).init({
  fallbackLng: 'es',
  supportedLngs: ['es', 'en'],
  preload: ['es', 'en'],
  ns: ['common', 'onboarding', 'tree', 'needs', 'voting', 'errors', 'dm', 'kanban', 'hilt', 'v1', 'v1_candidate', 'v1_vote'],
  defaultNS: 'common',
  backend: { loadPath: path.join(__dirname, '..', '..', 'locales', '{{lng}}', '{{ns}}.json') },
  interpolation: { escapeValue: false },
}).then(() => {
  // Debug: verify files are reachable
  const fs = require('fs');
  const v1esPath = path.join(__dirname, '..', '..', 'locales', 'es', 'v1.json');
  console.log('v1.json path:', v1esPath);
  console.log('v1.json exists:', fs.existsSync(v1esPath));
  console.log('');
  const tests = [];
  // v1
  tests.push(['v1.reminder es', i18next.t('reminder', { ns: 'v1', lng: 'es' }), 'Quedan']);
  tests.push(['v1.reminder en', i18next.t('reminder', { ns: 'v1', lng: 'en' }), 'minutes']);
  tests.push(['v1.poll_option_external es', i18next.t('poll_option_external', { ns: 'v1', lng: 'es' }), 'Contratar']);
  tests.push(['v1.poll_option_external_budget en', i18next.t('poll_option_external_budget', { ns: 'v1', lng: 'en', budget: 5000, currency: 'CLP' }), '$5000']);
  tests.push(['v1.poll_option_cancel es', i18next.t('poll_option_cancel', { ns: 'v1', lng: 'es' }), 'Cancelar']);
  // v1_candidate
  tests.push(['v1_candidate.applied_ok es', i18next.t('applied_ok', { ns: 'v1_candidate', lng: 'es' }), 'Postulación']);
  tests.push(['v1_candidate.applied_ok en', i18next.t('applied_ok', { ns: 'v1_candidate', lng: 'en' }), 'Application']);
  tests.push(['v1_candidate.group_notify es', i18next.t('group_notify', { ns: 'v1_candidate', lng: 'es', name: 'Leo', count: 3, plural: 's' }), 'Leo']);
  // v1_vote
  tests.push(['v1_vote.results_winner_internal es', i18next.t('results_winner_internal', { ns: 'v1_vote', lng: 'es', name: 'Leo', title: 'Test' }), 'Leo']);
  tests.push(['v1_vote.results_winner_external en', i18next.t('results_winner_external', { ns: 'v1_vote', lng: 'en', budget: 5000, currency: 'CLP' }), 'budget']);

  let failed = false;
  for (const [label, result, expected] of tests) {
    const ok = result.includes(expected);
    console.log(`${ok ? '✓' : '✗'} ${label}: "${result.slice(0, 60)}${result.length > 60 ? '...' : ''}"`);
    if (!ok) { console.log(`  Expected to contain: "${expected}"`); failed = true; }
  }

  console.log(`\n${failed ? 'SOME TESTS FAILED' : 'ALL 10/10 i18n TESTS PASSED'}`);
  process.exit(failed ? 1 : 0);
});
