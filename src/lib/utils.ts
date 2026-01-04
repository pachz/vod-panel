import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Converts markdown to plain text by stripping all markdown syntax
 * @param markdown - The markdown string to convert
 * @returns Plain text without markdown formatting
 */
export function markdownToPlainText(markdown: string): string {
  if (!markdown) return ''
  
  let text = markdown
  
  // Remove headers (##, ###, etc.)
  text = text.replace(/^#{1,6}\s+/gm, '')
  
  // Remove bold (**text** or __text__)
  text = text.replace(/\*\*(.+?)\*\*/g, '$1')
  text = text.replace(/__(.+?)__/g, '$1')
  
  // Remove italic (*text* or _text_)
  text = text.replace(/\*(.+?)\*/g, '$1')
  text = text.replace(/_(.+?)_/g, '$1')
  
  // Remove links [text](url) -> text
  text = text.replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1')
  
  // Remove images ![alt](url) -> alt
  text = text.replace(/!\[([^\]]*)\]\([^\)]+\)/g, '$1')
  
  // Remove inline code `code`
  text = text.replace(/`([^`]+)`/g, '$1')
  
  // Remove code blocks
  text = text.replace(/```[\s\S]*?```/g, '')
  text = text.replace(/`[\s\S]*?`/g, '')
  
  // Remove list markers (-, *, +, 1., etc.)
  text = text.replace(/^[\s]*[-*+]\s+/gm, '')
  text = text.replace(/^[\s]*\d+\.\s+/gm, '')
  
  // Remove blockquotes
  text = text.replace(/^>\s+/gm, '')
  
  // Remove horizontal rules
  text = text.replace(/^[-*_]{3,}$/gm, '')
  
  // Remove strikethrough
  text = text.replace(/~~(.+?)~~/g, '$1')
  
  // Clean up multiple spaces and newlines
  text = text.replace(/\n{3,}/g, '\n\n')
  text = text.replace(/[ \t]+/g, ' ')
  
  // Trim whitespace
  text = text.trim()
  
  return text
}
