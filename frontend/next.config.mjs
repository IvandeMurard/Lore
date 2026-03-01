/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["backboard-sdk"],
  serverExternalPackages: ["pdf-parse"],
};

export default nextConfig;
