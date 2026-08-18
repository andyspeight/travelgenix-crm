/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // Baseline security headers on every response (travelgenix-security).
  //
  // CSP is shipped in REPORT-ONLY first: the app styles inline throughout, so
  // enforcing straight away risks breaking a surface we haven't allow-listed.
  // Report-only lets us watch for violations, then flip to enforcing — and
  // later to nonces (dropping 'unsafe-inline') — with confidence. HSTS is
  // enforced now: it is pure upside on an HTTPS-only deployment.
  async headers() {
    const csp = [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "form-action 'self'",
      // Next.js hydration + inline styling need 'unsafe-inline' until nonces
      // are plumbed through; tighten in a later pass.
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' data: https://fonts.gstatic.com",
      "img-src 'self' data: blob: https://api.maptiler.com https://*.maptiler.com",
      // Browser-side fetches: Supabase, the address/maps/weather/postcode
      // providers. postcodes.io geocodes the customer-360 Location panel; the
      // others are address autocomplete, maps, and weather.
      "connect-src 'self' https://*.supabase.co https://api.ideal-postcodes.co.uk https://api.postcodes.io https://api.maptiler.com https://api.open-meteo.com https://geocoding-api.open-meteo.com",
      // Send violations to our collector so Report-Only actually yields data
      // before the flip to enforcing (report-uri = legacy, report-to = modern).
      "report-uri /api/csp-report",
      "report-to csp-endpoint",
    ].join("; ");

    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains; preload" },
          // Names the report-to group used by the CSP above.
          { key: "Reporting-Endpoints", value: 'csp-endpoint="/api/csp-report"' },
          { key: "Content-Security-Policy-Report-Only", value: csp },
        ],
      },
    ];
  },
};

export default nextConfig;
