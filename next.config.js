/** @type {import('next').NextConfig} */
const nextConfig = {
  // A stray ~/package-lock.json makes Next treat the whole home folder as the project
  // and watch every file in it during `next dev`. Pin the root to this folder.
  turbopack: { root: __dirname },
};

module.exports = nextConfig;
