/** @type {import('next').NextConfig} */
const nextConfig = {
  typedRoutes: false,
  outputFileTracingRoot: import.meta.dirname,
  output: "standalone",
  outputFileTracingIncludes: {
    "/*": ["./node_modules/pdfkit/js/data/**/*"]
  }
};

export default nextConfig;
