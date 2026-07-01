/**
 * A minimal fake Supabase client for unit-testing Ask query tools.
 *
 * Tools receive `ctx.db` and chain builder methods (.select().eq().ilike()
 * .gte().lte().in().order().limit()...) then await the result. This fake
 * returns a chainable, thenable builder whose resolved `data` comes from a
 * per-table fixture. Filters are NOT re-implemented — each test supplies
 * exactly the rows that table's query should return, which keeps tests about
 * the tool's logic, not about emulating Postgres.
 *
 * When a table is queried more than once with different expected results,
 * supply an array of arrays and calls consume them in order.
 */

type Rows = Record<string, unknown>[];
type Fixture = Record<string, Rows | Rows[]>;

function isQueue(v: Rows | Rows[]): v is Rows[] {
  return Array.isArray(v) && v.length > 0 && Array.isArray(v[0]);
}

export function fakeDb(fixture: Fixture) {
  const consumed: Record<string, number> = {};

  return {
    from(table: string) {
      const supplied = fixture[table] ?? [];
      let data: Rows;
      if (isQueue(supplied)) {
        const i = consumed[table] ?? 0;
        data = supplied[Math.min(i, supplied.length - 1)];
        consumed[table] = i + 1;
      } else {
        data = supplied;
      }

      const builder: Record<string, unknown> = {};
      const chain = () => builder;
      for (const m of ["select", "eq", "neq", "ilike", "gte", "lte", "in", "contains", "order", "limit", "not"]) {
        builder[m] = chain;
      }
      builder.then = (resolve: (v: { data: Rows; error: null }) => unknown) =>
        Promise.resolve({ data, error: null }).then(resolve);
      builder.maybeSingle = () => Promise.resolve({ data: data[0] ?? null, error: null });
      builder.single = () => Promise.resolve({ data: data[0] ?? null, error: null });
      return builder;
    },
  };
}
