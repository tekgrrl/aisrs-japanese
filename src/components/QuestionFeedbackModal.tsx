import React from "react";

interface QuestionFeedbackModalProps {
  isOpen: boolean;
  onKeep: () => void;
  onRequestNew: () => void;
  onReport: () => void;
}

export const QuestionFeedbackModal: React.FC<QuestionFeedbackModalProps> = ({
  isOpen,
  onKeep,
  onRequestNew,
  onReport,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-gray-800 border border-gray-700 rounded-lg shadow-2xl p-8 max-w-md w-full mx-4">
        <h2 className="text-2xl font-bold text-white mb-4 text-center">
          Rate this Question
        </h2>
        <p className="text-gray-300 mb-8 text-center">
          Since this is a new AI-generated question, we need your feedback. Is it
          good?
        </p>

        <div className="flex flex-col gap-4">
          <button
            onClick={onKeep}
            className="w-full py-3 px-4 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-md transition-colors shadow-md flex items-center justify-center gap-2"
          >
            <span>👍 Keep Question</span>
          </button>

          <button
            onClick={onRequestNew}
            className="w-full py-3 px-4 bg-yellow-600 hover:bg-yellow-700 text-white font-semibold rounded-md transition-colors shadow-md flex items-center justify-center gap-2"
          >
            <span>🔄 Request New (Garbage)</span>
          </button>

          <button
            onClick={onReport}
            className="w-full py-3 px-4 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-md transition-colors shadow-md flex items-center justify-center gap-2"
          >
            <span>🚩 Report Problem (Valid but Flawed)</span>
          </button>
        </div>
      </div>
    </div>
  );
};
