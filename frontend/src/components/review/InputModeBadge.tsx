interface InputModeBadgeProps {
  mode: "kana" | "english";
}

export default function InputModeBadge({ mode }: InputModeBadgeProps) {
  const isKana = mode === "kana";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
        isKana ? "bg-indigo-500/20 text-indigo-300" : "bg-gray-600/50 text-gray-300"
      }`}
    >
      {isKana ? "あ Kana" : "A English"}
    </span>
  );
}
