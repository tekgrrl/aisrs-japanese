import type { Config } from "tailwindcss";

const config: Config = {
    content: [
        // Standard Next.js (App Router & Pages Router) paths inside /src
        "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
        "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
        "./src/app/**/*.{js,ts,jsx,tsx,mdx}",

        // Standard paths if you are not using /src
        "./pages/**/*.{js,ts,jsx,tsx,mdx}",
        "./components/**/*.{js,ts,jsx,tsx,mdx}",
        "./app/**/*.{js,ts,jsx,tsx,mdx}",

        // Any other likely locations for components
        "./lib/**/*.{js,ts,jsx,tsx,mdx}",
        "./utils/**/*.{js,ts,jsx,tsx,mdx}",
    ],
    theme: {
        extend: {
            colors: {
                shodo: {
                    // BACKGROUNDS: Delicate, organic tones
                    paper: '#F9F7F2',        // [Shironeri] Unbleached Silk (Your current bg)
                    'paper-dark': '#EBE6DC', // Slightly darker, aged paper (Great for cards/sections)
                    'paper-warm': '#F5ECDF', // Warm Parchment (Good for 'Review Mode')
                    mist: '#E8ECEF',         // [Geppaku] Moon White (Cool/Neutral alternative background)

                    // TEXT: High contrast but softer than pure black
                    ink: '#2B2523',          // [Sumi] Black Ink (Main Text)
                    'ink-light': '#595048',  // [Cha-nezumi] Tea Mouse (Subtitles/Metadata)
                    'ink-faint': '#A69E96',  // Faded ink (Placeholders/Disabled text)

                    // ACTIONS & HIGHLIGHTS: Bold but earthy
                    'stamp-red': '#D64A38',  // [Shu-iro] Vermilion (Primary Buttons/The "Hanko")
                    indigo: '#2E4B75',       // [Ai-iro] Indigo (Links/Secondary Buttons)
                    matcha: '#7B8D42',       // [Uguisu] Warbler Green (Success/Correct Answer)
                    persimmon: '#E08A46',    // [Kaki-iro] Persimmon (Warning/Caution)
                    gold: '#C7A04D',         // [Kin-cha] Gold Tea (Mastery/Mushin Status)
                },
            },

        },
    },
    plugins: [],
};

export default config;