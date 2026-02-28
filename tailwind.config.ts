import type { Config } from "tailwindcss";

const config: Config = {
    content: [
        "./pages/**/*.{js,ts,jsx,tsx,mdx}",
        "./components/**/*.{js,ts,jsx,tsx,mdx}",
        "./app/**/*.{js,ts,jsx,tsx,mdx}",
    ],
    theme: {
        extend: {
            colors: {
                background: "#0a0a0a",
                foreground: "#f5f5f5",
                muted: "#9ca3af",
                accent: "#f97316",
                "accent-hover": "#fb923c",
                surface: "#141414",
                "surface-light": "#1a1a1a",
                border: "#262626",
            },
            fontFamily: {
                sans: ["Inter", "Geist", "system-ui", "sans-serif"],
            },
        },
    },
    plugins: [],
};
export default config;
