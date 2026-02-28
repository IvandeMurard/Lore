/** @type {import('next').NextConfig} */
const nextConfig = {
    experimental: {
        serverComponentsExternalPackages: [
            "ws",
            "@speechmatics/real-time-client",
            "@speechmatics/auth",
        ],
    },
};

export default nextConfig;
