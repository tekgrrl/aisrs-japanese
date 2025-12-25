"use client";

import React, { useState } from "react";

interface RevealableTextProps {
  text: string;
}

export default function RevealableText({ text }: RevealableTextProps) {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <span
      onClick={() => setIsVisible(true)}
      className={`
        transition-all duration-200 rounded px-1
        ${
          isVisible
            ? "cursor-text text-gray-600 dark:text-gray-400 bg-transparent"
            : "cursor-pointer select-none text-transparent bg-gray-300 dark:bg-gray-600 hover:bg-gray-400 dark:hover:bg-gray-500"
        }
      `}
      title={!isVisible ? "Click to reveal" : undefined}
    >
      {text}
    </span>
  );
}
