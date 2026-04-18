"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@/providers/AuthProvider";
import { UserAvatar } from "./UserAvatar";

export function AvatarMenu() {
  const { user, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  if (!user?.email) return null;

  const handleSignOut = async () => {
    setOpen(false);
    await signOut();
  };

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="rounded-full focus:outline-none focus:ring-2 focus:ring-shodo-accent focus:ring-offset-2 focus:ring-offset-shodo-paper"
        aria-label="User menu"
        aria-expanded={open}
        aria-haspopup="true"
      >
        <UserAvatar email={user.email} size="sm" />
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-52 bg-shodo-paper border border-shodo-ink/10 rounded-lg shadow-lg py-1 z-50">
          <div className="px-3 py-2 border-b border-shodo-ink/10">
            <p className="text-xs text-shodo-ink/50 truncate">{user.email}</p>
          </div>

          <Link
            href="/profile"
            className="block px-3 py-2 text-sm text-shodo-ink hover:bg-shodo-ink/5 transition-colors"
            onClick={() => setOpen(false)}
          >
            Profile &amp; Settings
          </Link>

          <div className="h-px bg-shodo-ink/10 my-1" />

          <Link
            href="/library"
            className="block px-3 py-2 text-sm text-shodo-ink hover:bg-shodo-ink/5 transition-colors"
            onClick={() => setOpen(false)}
          >
            Library
          </Link>
          <Link
            href="/manage"
            className="block px-3 py-2 text-sm text-shodo-ink hover:bg-shodo-ink/5 transition-colors"
            onClick={() => setOpen(false)}
          >
            Manage
          </Link>

          <div className="h-px bg-shodo-ink/10 my-1" />

          <button
            onClick={handleSignOut}
            className="block w-full text-left px-3 py-2 text-sm text-shodo-ink/50 hover:text-shodo-ink hover:bg-shodo-ink/5 transition-colors"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
