// Deployment target. Run npm run verify:analytics after the server is deployed.
// A local enabled setting does not mean the production collector is running.
// Keep credentials and webhook secrets on the server, never in this public file.
export const analyticsConfig = Object.freeze({
  enabled: true,
  endpoint: 'https://asia-northeast3-trading-dashboard-480711.cloudfunctions.net/analyticsApi',
  siteUrl: 'https://www.wonnaecare.co.kr/',
  privacyVersion: '2026-11-10',
});
