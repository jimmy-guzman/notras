/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [{ hostname: "avatars.githubusercontent.com" }],
  },
  redirects() {
    return [
      {
        source: "/settings",
        destination: "/settings/theme",
        permanent: true,
      },
    ];
  },
  experimental: {
    typedRoutes: true,
  },
};

export default nextConfig;
