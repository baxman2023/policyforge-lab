import type { Metadata } from "next";
import { ApiProxyBootstrap } from "@/components/api-proxy-bootstrap";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://phpstack-1305612-6519184.cloudwaysapps.com"),
  title: "Baxter Growth Lab",
  description: "AI insurance growth, local SEO, scripting, and sales enablement engine"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <ApiProxyBootstrap />
        {children}
      </body>
    </html>
  );
}
