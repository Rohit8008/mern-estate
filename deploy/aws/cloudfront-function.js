// EXAMPLE / UNVERIFIED. Not deployed, not run in CloudFront.
//
// CloudFront Function, event type: viewer-request, runtime cloudfront-js-2.0,
// attached to the DEFAULT behavior whose origin is the S3 bucket holding
// frontend/dist (the later, ECS stage). The /api/*, /socket.io/* and
// /uploads/* behaviors point at the ALB and must NOT have this function.
//
// Why it exists: S3 knows nothing about SPA routing. A deep link such as
// /clients/123 would be a 403/404 from S3, and /privacy would return the SPA
// shell instead of the prerendered dist/privacy/index.html that crawlers need.

// Pages the build prerenders to dist/<name>/index.html.
// Keep in sync with the frontend SEO build.
var PRERENDERED = {
  '/privacy': true,
  '/terms': true,
  '/cookies': true,
  '/refunds': true,
  '/download': true,
};

// Paths this function must leave alone if they ever reach it (defence in depth;
// normally the behaviors above keep them away).
var PASSTHROUGH_PREFIXES = ['/api/', '/socket.io/', '/uploads/', '/app/'];

function handler(event) {
  var request = event.request;
  var uri = request.uri;

  // Normalise a trailing slash for the prerendered check: /privacy/ -> /privacy
  var bare = uri.length > 1 && uri.charAt(uri.length - 1) === '/' ? uri.slice(0, -1) : uri;

  if (PRERENDERED[bare]) {
    request.uri = bare + '/index.html';
    return request;
  }

  for (var i = 0; i < PASSTHROUGH_PREFIXES.length; i++) {
    if (uri.indexOf(PASSTHROUGH_PREFIXES[i]) === 0) return request;
  }

  // Has a file extension in the last segment (.js, .css, .png, .webmanifest,
  // sitemap.xml ...): a real object, leave it. A missing one 404s as it should.
  var lastSegment = uri.substring(uri.lastIndexOf('/') + 1);
  if (lastSegment.indexOf('.') !== -1) return request;

  // Everything else is a client-side route: serve the shell.
  request.uri = '/index.html';
  return request;
}
