/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {NEXT_PUBLIC_MEDIA_VARIANTS:process.env.MEDIA_PRIVATE || "0",NEXT_PUBLIC_BUILD_VERSION:process.env.BUILD_VERSION || "0",NEXT_PUBLIC_SOURCE_COMMIT:process.env.SOURCE_COMMIT || ""},
  // 并行验收/开发可用 NEXT_DIST_DIR 隔离构建缓存，避免多个 Next 进程争用 .next。
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // standalone 输出:Docker 镜像用(.next/standalone 自带精简 node_modules)。
  // 服务器上 `next start` 不受影响,两种运行方式共存。
  output: "standalone",
  // 原生模块(含 .node 二进制)不能被 webpack 打包,标记为服务端外部依赖,
  // 运行时直接 require。sharp 是原生模块(图像缩放,generate-image 用)。
  experimental: {
    serverComponentsExternalPackages: ["sharp", "pg"],
  },
};

export default nextConfig;
