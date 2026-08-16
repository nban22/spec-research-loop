import type { NextConfig } from 'next';

const BACKEND_ORIGIN = process.env.BACKEND_ORIGIN ?? 'http://localhost:3001';

const nextConfig: NextConfig = {
  // Gói đúng những file cần lúc chạy → image nhỏ hơn nhiều (vài trăm MB → ~180 MB).
  output: 'standalone',
  /**
   * FE và BE **cùng origin** với trình duyệt nhờ rewrite này. Đó là điều kiện để cookie auth
   * chạy `SameSite=Lax` bình thường và để `EventSource` mang được cookie — `EventSource`
   * không set được header `Authorization` (STACK §5, §11.2).
   */
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${BACKEND_ORIGIN}/:path*` }];
  },
};

export default nextConfig;
