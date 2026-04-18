"use client";

const COLORS = [
  '#c0392b', '#8e44ad', '#2471a3', '#1e8449',
  '#d68910', '#117a65', '#ba4a00', '#2e4057',
];

function getAvatarColor(email: string): string {
  let hash = 0;
  for (const c of email) hash = ((hash << 5) - hash) + c.charCodeAt(0);
  return COLORS[Math.abs(hash) % COLORS.length];
}

function getInitials(email: string): string {
  const name = email.split('@')[0];
  const parts = name.split(/[._-]/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

const SIZE_CLASSES: Record<string, string> = {
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-20 h-20 text-2xl',
};

interface UserAvatarProps {
  email: string;
  size?: 'sm' | 'md' | 'lg';
}

export function UserAvatar({ email, size = 'md' }: UserAvatarProps) {
  return (
    <div
      className={`${SIZE_CLASSES[size]} rounded-full flex items-center justify-center font-semibold text-white select-none shrink-0`}
      style={{ backgroundColor: getAvatarColor(email) }}
      aria-label={`Avatar for ${email}`}
    >
      {getInitials(email)}
    </div>
  );
}
