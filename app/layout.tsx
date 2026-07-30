import type { Metadata } from "next";
import { Chakra_Petch, IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";

// Type system: Chakra Petch carries the headlines — angular and technical, it
// reads "gaming hardware" without falling into the Rajdhani esports cliché.
// IBM Plex Sans/Mono do the quiet work: body copy, labels, and the numeric
// readouts (Plex Mono keeps digits steady where values tick live). Geist was
// the template default and reads generic-startup; these are chosen for the
// subject. Latin subset now; Plex's wide language coverage is deliberate for
// the locale roadmap in docs/architecture/07-internationalisation.md.
const display = Chakra_Petch({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const body = IBM_Plex_Sans({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const mono = IBM_Plex_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "https";
  const image = host ? `${protocol}://${host}/og.png` : undefined;
  const title = "Ping Optimizer — Better routes, proven";
  const description =
    "One-click game detection, route comparison, and honest network optimization backed by real measurements.";

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      images: image ? [{ url: image, width: 1732, height: 908 }] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: image ? [image] : undefined,
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${display.variable} ${body.variable} ${mono.variable}`}>
        {children}
      </body>
    </html>
  );
}
