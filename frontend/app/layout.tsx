import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Lore — Voice AI Mentor",
  description: "Industrial knowledge transfer. Capture expertise. Query on the shop floor.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className="font-sans min-h-screen bg-background text-foreground">
        {children}
      </body>
    </html>
  );
}
