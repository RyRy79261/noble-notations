import type { MetadataRoute } from 'next';
import { site } from '@/lib/site';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // The OAuth endpoints and the admin gate are not content, and
        // superseded revisions are near-duplicates of the live recipe.
        disallow: ['/api/', '/auth', '/recipes/*/revisions/'],
      },
    ],
    sitemap: `${site.url}/sitemap.xml`,
    host: site.url,
  };
}
