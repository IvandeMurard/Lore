import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
    title: "Lore — Voice AI Mentor",
    description:
        "Capture tacit expertise from senior technicians and deliver it to juniors on the shop floor. Hands dirty, no screen. Just ask.",
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="en">
            <body>{children}</body>
        </html>
    );
}
