'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';

/**
 * A simple navigation header that displays stats.
 */
export default function Header() {
  const [stats, setStats] = useState({ learnCount: 0, reviewCount: 0 });

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await fetch('/api/stats');
        if (response.ok) {
          const data = await response.json();
          setStats(data);
        }
      } catch (error) {
        console.error('Failed to fetch stats:', error);
      }
    };

    fetchStats();
  }, []);

  return (
    <header className="bg-gray-800 shadow-md sticky top-0 z-10">
      <nav className="container mx-auto max-w-4xl px-8 py-4 flex items-center justify-between">
        <Link href="/" className="text-2xl font-bold text-white hover:text-gray-300">
          AISRS
        </Link>
        <div className="space-x-2 sm:space-x-4">
          <Link href="/learn" className="bg-gray-700 px-4 py-2 rounded-md hover:bg-gray-600 text-white">
            Learn ({stats.learnCount})
          </Link>
          <Link href="/review" className="bg-gray-700 px-4 py-2 rounded-md hover:bg-gray-600 text-white">
            Review ({stats.reviewCount})
          </Link>
          <Link href="/" className="bg-gray-700 px-4 py-2 rounded-md hover:bg-gray-600 text-white">
            Manage
          </Link>
        </div>
      </nav>
    </header>
  );
}
