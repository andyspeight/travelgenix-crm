# Address lookup (Ideal Postcodes)

The postcode/address search on the **Add customer** and **Edit details** forms
is powered by [Ideal Postcodes' AddressFinder](https://docs.ideal-postcodes.co.uk/docs/address-finder),
running **in the browser**.

## Why the browser, not the server

Ideal Postcodes keys are secured by an **Allowed URLs** whitelist. That check
relies on the request carrying the page's origin — which only a real browser
request has. A server-to-server call has no origin, so a whitelisted key
rejects it with `4011 "Requesting URL not on whitelist"`. Running the lookup
client-side means the request comes from the agency's own (whitelisted) domain
and is accepted.

## Configuration

Set one environment variable in Vercel:

```
NEXT_PUBLIC_IDEAL_POSTCODES_KEY=ak_xxxxxxxxxxxxxxxx
```

- Use the **public / browser** key (begins `ak_`) whose **Allowed URLs**
  include the site's domains (e.g. `crm.travelify.io`, and any preview domains
  you want it to work on).
- It is exposed to the browser on purpose — that is safe here precisely because
  the key only works from those whitelisted domains.
- `NEXT_PUBLIC_` values are compiled in at **build time**, so after adding or
  changing the key you must **redeploy** for it to take effect.

Without the variable the search box is hidden and the address is entered by
hand; every field stays editable either way.

## How it's wired

- `components/address-fields.tsx` lazy-loads `@ideal-postcodes/address-finder`
  in a client effect (never during SSR), attaches it to the search input, and
  maps the chosen address into the form's React fields via `onAddressRetrieved`.
- Restricted to UK addresses (`restrictCountries: ["GBR"]`).
- There is **no server-side address route** — the earlier `/api/address/lookup`
  was removed when the lookup moved into the browser.
