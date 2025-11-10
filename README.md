AISRS-Japanese is an SRS based Japanese Language app with AI enhancements. It uses Google Gemini to generate lessons for Vocab and Kanji that the user inputs. Lessons are rich and detailed, and offer the user the option to generate review facets for meaning, reading and component kanji. The review queue is SRS based and answers are evaluated by Gemini. The app can also generate more complex questions tuned to the users (self specified currently) level, but that's WiP. The app currently uses Next 15, Tailwind and Firestore. Plans are in place to move to PostgreSQL for production. 

You'll need to supply your own Gemini API key (as GEMINI_API_KEY) and store them in an .env.local file. The app really requires Gemini Pro for good results. 


This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
