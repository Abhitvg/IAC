import React from 'react';
import Markdown from 'react-markdown';

interface SafeMarkdownProps {
  content: string;
  className?: string;
}

/**
 * Renders Markdown safely by strictly skipping raw HTML tags and scripts.
 * Prevents XSS via markdown payloads in candidate answers, model answers, or questions.
 */
export const SafeMarkdown: React.FC<SafeMarkdownProps> = ({ content, className = '' }) => {
  return (
    <div className={`prose prose-invert max-w-none text-xs leading-relaxed ${className}`}>
      <Markdown skipHtml={true}>{content}</Markdown>
    </div>
  );
};
