"use client";

import { useRef } from "react";

interface Props {
  messages: string[];
  onChange: (messages: string[]) => void;
}

export default function MessageEditor({ messages, onChange }: Props) {
  const textareaRefs = useRef<(HTMLTextAreaElement | null)[]>([]);

  const insertAtCursor = (index: number, text: string) => {
    const textarea = textareaRefs.current[index];
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const current = messages[index];
    const newValue =
      current.substring(0, start) + text + current.substring(end);

    const updated = [...messages];
    updated[index] = newValue;
    onChange(updated);

    requestAnimationFrame(() => {
      textarea.focus();
      const newCursorPos = start + text.length;
      textarea.setSelectionRange(newCursorPos, newCursorPos);
    });
  };

  const updateMessage = (index: number, value: string) => {
    const updated = [...messages];
    updated[index] = value;
    onChange(updated);
  };

  const addVariation = () => {
    onChange([...messages, ""]);
  };

  const removeVariation = (index: number) => {
    if (messages.length <= 1) return;
    onChange(messages.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-4">
      {messages.map((message, index) => (
        <div key={index} className="border border-gray-200 rounded-md p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">
              Variation {index + 1}
            </span>
            {messages.length > 1 && (
              <button
                onClick={() => removeVariation(index)}
                className="text-xs text-gray-400 hover:text-red-600 transition-colors"
              >
                Remove
              </button>
            )}
          </div>

          <textarea
            ref={(el) => {
              textareaRefs.current[index] = el;
            }}
            value={message}
            onChange={(e) => updateMessage(index, e.target.value)}
            placeholder="Write your message here..."
            rows={4}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent resize-none"
          />

          <div className="flex gap-2 mt-2">
            <button
              type="button"
              onClick={() => insertAtCursor(index, "{{first_name}}")}
              className="px-2.5 py-1 text-xs font-medium border border-gray-300 rounded text-gray-700 hover:bg-gray-50 transition-colors"
            >
              First Name
            </button>
            <button
              type="button"
              onClick={() => insertAtCursor(index, "{{hi|hey|hello}}")}
              className="px-2.5 py-1 text-xs font-medium border border-gray-300 rounded text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Spintax
            </button>
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={addVariation}
        className="w-full py-2 text-sm font-medium text-gray-600 border border-dashed border-gray-300 rounded-md hover:border-gray-400 hover:text-gray-900 transition-colors"
      >
        + Add Variation
      </button>
    </div>
  );
}
