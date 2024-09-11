/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
};

const { withNextOnPages } = require('@cloudflare/next-on-pages/plugin');

module.exports = withNextOnPages(nextConfig);