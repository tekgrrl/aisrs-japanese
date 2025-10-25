import Link from 'next/link';

/**
 * A simple navigation header.
 */
export default function Header() {
  return (
    <header className="bg-gray-800 shadow-md sticky top-0 z-10">
      <nav className="container mx-auto max-w-4xl px-8 py-4 flex items-center justify-between">
        <Link href="/" className="text-2xl font-bold text-white hover:text-gray-300">
          AISRS
        </Link>
        <div className="space-x-2 sm:space-x-4">
          <Link href="/" className="px-3 py-2 text-sm sm:text-base text-gray-300 hover:bg-gray-700 rounded-md">
            Manage
          </Link>
          <Link href="/review" className="px-3 py-2 text-sm sm:text-base text-gray-300 hover:bg-gray-700 rounded-md">
            Review
          </Link>
        </div>
      </nav>
    </header>
  );
}
