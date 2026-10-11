// Development entry used by `npm run dev` / `npm run dev:api`.
// Nothing in the API loads `.env`, so NODE_ENV would otherwise be unset and
// the FUTURE_BLOCK diagnostics (development only, Plan 003B Amendment 1 D2)
// would stay silent. An explicit NODE_ENV from the shell is kept as is.
if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = 'development';
}

void import('./index.js');
