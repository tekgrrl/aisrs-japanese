"use client";

interface Props {
  submitLabel: string;
  submitType?: "button" | "submit";
  onSubmit?: () => void;
  submitDisabled?: boolean;
  /** "xl" matches the standard answer-input review card; "lg" matches sentence-assembly. */
  size?: "lg" | "xl";
  onSkip: () => void;
  skipDisabled?: boolean;
  onShowLesson?: () => void;
  showLesson?: boolean;
  isFetchingLesson?: boolean;
}

/**
 * The "Submit (full width) / Skip + Review Lesson (side by side)" button group
 * shared by every review card type. Extracted so the layout can't drift between
 * facet-specific cards again.
 */
export default function ReviewActionButtons({
  submitLabel,
  submitType = "button",
  onSubmit,
  submitDisabled,
  size = "lg",
  onSkip,
  skipDisabled,
  onShowLesson,
  showLesson,
  isFetchingLesson,
}: Props) {
  const submitSizeClasses = size === "xl" ? "py-4 text-xl" : "py-3 text-lg";

  return (
    <div>
      <button
        type={submitType}
        onClick={submitType === "button" ? onSubmit : undefined}
        disabled={submitDisabled}
        className={`w-full px-6 ${submitSizeClasses} bg-blue-600 text-white font-semibold rounded-md shadow-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-800 disabled:bg-gray-500 disabled:cursor-wait`}
      >
        {submitLabel}
      </button>

      <div className="flex gap-4 mt-4">
        <button
          type="button"
          onClick={onSkip}
          disabled={skipDisabled}
          className="flex-1 px-6 py-3 bg-gray-500 text-white text-lg font-semibold rounded-md shadow-md hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2 focus:ring-offset-gray-800 disabled:bg-gray-800 disabled:text-gray-500"
        >
          Skip
        </button>
        {onShowLesson && (
          <button
            type="button"
            onClick={onShowLesson}
            disabled={isFetchingLesson}
            className="flex-1 px-6 py-3 bg-[#0A5C36] text-white text-lg font-semibold rounded-md shadow-md hover:bg-[#084a2b] focus:outline-none focus:ring-2 focus:ring-green-800 focus:ring-offset-2 focus:ring-offset-gray-800 disabled:bg-gray-800 disabled:text-gray-500"
          >
            {isFetchingLesson ? "Loading..." : showLesson ? "Hide Lesson" : "Review Lesson"}
          </button>
        )}
      </div>
    </div>
  );
}
