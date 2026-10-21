/**
 * Public data-access surface for the app.
 *
 * The default implementation talks to the real API. To run the UI without a
 * backend, swap the export below for './mockApi' (the original in-memory
 * mock that is still in the repo).
 */
export * from './real';
