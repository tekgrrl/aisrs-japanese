"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, signInAnonymously, User } from "firebase/auth";
import { auth } from "@/lib/firebase-client";

interface AuthContextType {
  user: User | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) {
        // If no user is logged in, automatically sign in anonymously
        // to get a valid token for requests.
        try {
          console.log("[AuthProvider] No user detected, attempting anonymous sign-in...");
          await signInAnonymously(auth);
          console.log("[AuthProvider] Anonymous sign-in success!");
        } catch (error) {
          console.error("[AuthProvider] Failed to sign in anonymously:", error);
          alert(`Firebase Auth Error: Failed to sign in anonymously. Please ensure Anonymous Sign-In is enabled in your Firebase Console. Details: ${error}`);
          setLoading(false);
        }
      } else {
        setUser(currentUser);
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading }}>
      {!loading ? children : (
        <div className="flex h-screen w-full items-center justify-center bg-shodo-paper text-shodo-ink">
          <p className="animate-pulse">Loading secure session...</p>
        </div>
      )}
    </AuthContext.Provider>
  );
}
