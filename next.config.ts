import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // 2026/11/10 サブディレクトリ化: このサイトは finance-tower.com/ipo-us 配下で公開する。
  // 実体は従来どおりこのプロジェクトのVercelデプロイで、finance-tower.com 側(finance-tower プロジェクト)の
  // rewrites から /ipo-us/* として転送される(Next.js multi-zones構成)。
  basePath: "/ipo-us",
  async redirects() {
    return [
      // 旧サブドメイン ipo-us.finance-tower.com の画面へのアクセスを、新URLへ恒久転送(301)する。
      // 親サイト経由の転送ではHostが異なるため、この条件には一致せずループしない。
      // 注意: StripeのWebhookは転送に追従しないため、Stripeの管理画面に登録したURLは
      //       https://finance-tower.com/ipo-us/api/webhook へ必ず更新すること。
      {
        source: "/:path*",
        has: [{ type: "host", value: "ipo-us.finance-tower.com" }],
        destination: "https://finance-tower.com/ipo-us/:path*",
        permanent: true,
        basePath: false,
      },
    ];
  },
};

export default nextConfig;
