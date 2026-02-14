import React from 'react';

export const JsonDisplay = ({ data }: { data: any }) => {
  let content = data;

  // Recursively parse strings to handle double-encoded JSON
  while (typeof content === 'string') {
    try {
      const parsed = JSON.parse(content);
      content = parsed;
    } catch (e) {
      break;
    }
  }

  const formatForReadability = (val: any) => {
    if (typeof val !== 'object' || val === null) return String(val);

    // Stringify with indentation
    const jsonString = JSON.stringify(val, null, 2);

    // HACK: Unescape newlines (\n) so they render as actual line breaks in the <pre> tag
    return jsonString
      .replace(/\\n/g, '\n')  // Turn literal "\n" into actual newline
      .replace(/\\"/g, '"');  // Turn literal \" into "
  };

  return (
    <div className="bg-slate-50 text-slate-900 p-4 rounded-md overflow-x-auto border border-slate-200 shadow-sm">
      <pre className="text-xs font-mono whitespace-pre-wrap">
        {formatForReadability(content)}
      </pre>
    </div>
  );
};