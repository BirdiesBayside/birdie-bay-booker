import { Helmet } from "react-helmet-async";

const SITE_URL = "https://birdie-bay-bookings.lovable.app";

interface SeoProps {
  title: string;
  description: string;
  path: string;
  noindex?: boolean;
}

/**
 * Per-route head tags: unique title, description and self-referencing canonical.
 */
const Seo = ({ title, description, path, noindex }: SeoProps) => {
  const url = `${SITE_URL}${path}`;

  return (
    <Helmet>
      <title>{title}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={url} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={url} />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="robots" content={noindex ? "noindex, nofollow" : "index, follow"} />
    </Helmet>
  );
};

export default Seo;
