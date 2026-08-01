-- Commission — what the agency earns, as opposed to what the customer spends.
--
-- Every report in this CRM has said "revenue" and meant the holiday price.
-- That is turnover. An agency selling £2m of holidays might earn £200k, and
-- the £2m is no use for paying staff or judging a supplier.
--
-- WHY THIS SITS ON THE TRIP rather than on trip_components: most agencies
-- book a holiday through one operator and are paid one commission on it. A
-- per-component split is real for the larger agencies and can be added later
-- without moving this — trip_components already carries supplier_id and cost.
-- Half-building it now would mean two places to look and neither complete.
--
-- The rate is deliberately NULLABLE with no default. A missing rate means
-- "not recorded", and lib/commission/calc.ts refuses to guess one: a
-- forecast built on an assumed 10% is a number someone will hire against.

alter table suppliers add column if not exists default_commission_rate numeric(5, 2);
-- Days after the customer returns that this supplier usually pays. Null =
-- unknown, which means nothing gets chased against a date we made up.
alter table suppliers add column if not exists payment_terms_days integer;

alter table trips add column if not exists supplier_id uuid references suppliers(id) on delete set null;
-- Percent. 10 = 10%.
alter table trips add column if not exists commission_rate numeric(5, 2);
-- An explicit figure, which always beats a rate — operators round, discount
-- and pay overrides, and the agent knows what actually landed.
alter table trips add column if not exists commission_amount numeric(12, 2);
alter table trips add column if not exists commission_status text not null default 'expected'
  check (commission_status in ('expected', 'invoiced', 'received', 'written_off'));
alter table trips add column if not exists commission_due_at date;
alter table trips add column if not exists commission_received_at date;
alter table trips add column if not exists commission_note text;

-- The chase list reads this: unpaid commission, oldest first.
create index if not exists trips_commission_status_idx
  on trips (agency_id, commission_status)
  where commission_status in ('expected', 'invoiced');
create index if not exists trips_supplier_idx on trips (supplier_id);
