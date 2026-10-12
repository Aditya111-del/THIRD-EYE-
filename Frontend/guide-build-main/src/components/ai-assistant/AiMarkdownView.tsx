import React, { useMemo } from "react";
import { Copy, Check, Code2, Play, FileCode } from "lucide-react";
import { copyToClipboard } from "@/lib/clipboard";

export interface AiMarkdownViewProps {
  content: string;
  isStreaming?: boolean | undefined;
  onRun?: ((code: string) => void) | undefined;
  onApplyToEditor?: ((code: string) => void) | undefined;
  onOpenFile?: ((fileName: string) => void) | undefined;
}

interface ParsedBlock {
  type: "code" | "paragraph" | "heading" | "list" | "divider" | "quote";
  level?: number | undefined;
  lang?: string | undefined;
  content: string;
  items?: string[] | undefined;
}

export function AiMarkdownView({
  content,
  isStreaming = false,
  onRun,
  onApplyToEditor,
  onOpenFile,
}: AiMarkdownViewProps) {
  const blocks = useMemo(() => {
    if (!content) return [];

    const result: ParsedBlock[] = [];
    const lines = content.split("\n");
    let inCode = false;
    let codeLang = "";
    let codeBuffer: string[] = [];
    let textBuffer: string[] = [];
    let listBuffer: string[] = [];

    const flushText = () => {
      if (textBuffer.length > 0) {
        const joined = textBuffer.join("\n").trim();
        if (joined) {
          result.push({ type: "paragraph", content: joined });
        }
        textBuffer = [];
      }
    };

    const flushList = () => {
      if (listBuffer.length > 0) {
        result.push({ type: "list", content: "", items: [...listBuffer] });
        listBuffer = [];
      }
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line === undefined) continue;

      // Code block delimiters: ```lang or ```
      if (line.trim().startsWith("```")) {
        if (!inCode) {
          flushText();
          flushList();
          inCode = true;
          codeLang = line.trim().slice(3).trim();
          codeBuffer = [];
        } else {
          inCode = false;
          result.push({
            type: "code",
            lang: codeLang,
            content: codeBuffer.join("\n"),
          });
          codeBuffer = [];
          codeLang = "";
        }
        continue;
      }

      if (inCode) {
        codeBuffer.push(line);
        continue;
      }

      // Horizontal rules
      if (/^(\-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
        flushText();
        flushList();
        result.push({ type: "divider", content: "" });
        continue;
      }

      // Headings
      const headingMatch = line.match(/^(#{1,4})\s+(.+)$/);
      if (headingMatch && headingMatch[1] && headingMatch[2]) {
        flushText();
        flushList();
        result.push({
          type: "heading",
          level: headingMatch[1].length,
          content: headingMatch[2].trim(),
        });
        continue;
      }

      // Blockquotes
      if (line.trim().startsWith(">")) {
        flushText();
        flushList();
        result.push({
          type: "quote",
          content: line.trim().replace(/^>\s*/, ""),
        });
        continue;
      }

      // Bullet list items (- or * or •)
      const listMatch = line.match(/^(\s*[-*•]|\s*\d+\.)\s+(.+)$/);
      if (listMatch) {
        flushText();
        listBuffer.push(line.trim());
        continue;
      }

      // If we were collecting a list and encounter non-list text, flush list
      if (listBuffer.length > 0 && line.trim() === "") {
        flushList();
        continue;
      }

      // Empty line separates paragraphs
      if (line.trim() === "") {
        flushText();
        flushList();
        continue;
      }

      textBuffer.push(line);
    }

    if (inCode && codeBuffer.length > 0) {
      result.push({
        type: "code",
        lang: codeLang,
        content: codeBuffer.join("\n"),
      });
    }

    flushText();
    flushList();

    return result;
  }, [content]);

  return (
    <div className="space-y-3 font-sans text-[12.5px] leading-relaxed text-[#DCDCE5] select-text">
      {blocks.map((block, idx) => {
        if (block.type === "code") {
          return (
            <MarkdownCodeBlock
              key={idx}
              code={block.content}
              lang={block.lang}
              onRun={onRun}
              onApplyToEditor={onApplyToEditor}
            />
          );
        }

        if (block.type === "heading") {
          return (
            <div key={idx} className="mt-2.5 mb-1 select-text">
              {block.level === 1 && (
                <h1 className="text-[14.5px] font-bold text-white border-b border-[#252630] pb-1 tracking-tight flex items-center gap-1.5">
                  <span className="w-1.5 h-3.5 bg-[#38BDF8] rounded-full inline-block" />
                  <FormattedInlineText text={block.content} onOpenFile={onOpenFile} />
                </h1>
              )}
              {block.level === 2 && (
                <h2 className="text-[13.5px] font-semibold text-[#F1F1F7] tracking-tight flex items-center gap-1.5">
                  <span className="w-1 h-3 bg-[#818CF8] rounded-full inline-block" />
                  <FormattedInlineText text={block.content} onOpenFile={onOpenFile} />
                </h2>
              )}
              {(block.level === 3 || block.level === 4) && (
                <h3 className="text-[12.5px] font-semibold text-[#60A5FA] tracking-tight">
                  <FormattedInlineText text={block.content} onOpenFile={onOpenFile} />
                </h3>
              )}
            </div>
          );
        }

        if (block.type === "divider") {
          return (
            <hr
              key={idx}
              className="my-3 border-0 h-[1px] bg-gradient-to-r from-transparent via-[#2B2C36] to-transparent"
            />
          );
        }

        if (block.type === "quote") {
          return (
            <blockquote
              key={idx}
              className="my-1.5 pl-3 border-l-2 border-[#38BDF8]/60 bg-[#14151B] py-1 text-[12px] text-[#A5A5B5] italic rounded-r"
            >
              <FormattedInlineText text={block.content} onOpenFile={onOpenFile} />
            </blockquote>
          );
        }

        if (block.type === "list") {
          return (
            <ul key={idx} className="space-y-1 my-1 pl-1">
              {(block.items || []).map((item, itemIdx) => {
                const isNumbered = /^\d+\.\s+/.test(item);
                const cleanItem = item.replace(/^(\s*[-*•]|\s*\d+\.)\s+/, "");
                return (
                  <li key={itemIdx} className="flex items-start gap-2 text-[12.5px]">
                    {isNumbered ? (
                      <span className="text-[#38BDF8] font-mono text-[11px] font-semibold shrink-0 mt-[1px]">
                        {item.match(/^\d+/)?.[0]}.
                      </span>
                    ) : (
                      <span className="w-1.5 h-1.5 rounded-full bg-[#38BDF8] shrink-0 mt-1.5 opacity-80" />
                    )}
                    <span className="flex-1">
                      <FormattedInlineText text={cleanItem} onOpenFile={onOpenFile} />
                    </span>
                  </li>
                );
              })}
            </ul>
          );
        }

        return (
          <p key={idx} className="leading-relaxed">
            <FormattedInlineText text={block.content} onOpenFile={onOpenFile} />
          </p>
        );
      })}

      {isStreaming && (
        <span className="inline-block w-1.5 h-3.5 bg-[#38BDF8] ml-0.5 align-middle animate-pulse" />
      )}
    </div>
  );
}

interface FormattedInlineTextProps {
  text: string;
  onOpenFile?: ((fileName: string) => void) | undefined;
}

function FormattedInlineText({ text, onOpenFile }: FormattedInlineTextProps) {
  if (!text) return null;

  // Split tokens for `code`, **bold**, *italic*, and [file.ext]
  const regex = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\.(?:tsx|ts|js|jsx|json|py|css|html|md)\])/g;
  const parts = text.split(regex);

  return (
    <>
      {parts.map((part, i) => {
        if (!part) return null;

        // Inline code `foo`
        if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
          const codeVal = part.slice(1, -1);
          return (
            <code
              key={i}
              className="mx-0.5 px-1.5 py-0.5 rounded-[4px] bg-[#1A1B22] border border-[#2B2C38] text-[#38BDF8] font-mono text-[11.5px]"
            >
              {codeVal}
            </code>
          );
        }

        // Bold **foo**
        if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
          return (
            <strong key={i} className="font-semibold text-white">
              {part.slice(2, -2)}
            </strong>
          );
        }

        // Italic *foo*
        if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
          return (
            <em key={i} className="italic text-[#C5C5D2]">
              {part.slice(1, -1)}
            </em>
          );
        }

        // Clickable file link [file.ts]
        if (part.startsWith("[") && part.endsWith("]") && onOpenFile) {
          const fileName = part.slice(1, -1);
          return (
            <button
              key={i}
              type="button"
              onClick={() => onOpenFile(fileName)}
              className="inline-flex items-center gap-1 mx-0.5 px-1.5 py-0.2 rounded bg-[#162032] border border-[#1E3A8A] text-[#60A5FA] hover:text-white hover:bg-[#1D4ED8]/30 transition-colors font-mono text-[11.5px] cursor-pointer align-baseline"
              title={`Open ${fileName} in Monaco Editor`}
            >
              <FileCode className="h-3 w-3" />
              <span>{fileName}</span>
            </button>
          );
        }

        return <React.Fragment key={i}>{part}</React.Fragment>;
      })}
    </>
  );
}

interface MarkdownCodeBlockProps {
  code: string;
  lang?: string | undefined;
  onRun?: ((cmd: string) => void) | undefined;
  onApplyToEditor?: ((content: string) => void) | undefined;
}

function MarkdownCodeBlock({
  code,
  lang,
  onRun,
  onApplyToEditor,
}: MarkdownCodeBlockProps) {
  const [copied, setCopied] = React.useState(false);
  const [applied, setApplied] = React.useState(false);

  const handleCopy = async () => {
    await copyToClipboard(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleApply = () => {
    if (onApplyToEditor) {
      onApplyToEditor(code);
      setApplied(true);
      setTimeout(() => setApplied(false), 2000);
    }
  };

  const isExecutable =
    lang === "sh" ||
    lang === "bash" ||
    lang === "zsh" ||
    lang === "cmd" ||
    lang === "shell" ||
    lang === "powershell" ||
    lang === "python" ||
    lang === "py";

  const cleanLang = (lang || "code").toLowerCase();

  return (
    <div className="my-2.5 overflow-hidden rounded-[8px] border border-[#272832] bg-[#0E0F13] font-mono text-[12px] shadow-lg select-text group">
      {/* Top action header */}
      <div className="flex h-[30px] items-center justify-between border-b border-[#1E1F28] bg-[#14151B] px-3 text-[11px] text-[#858596] select-none">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-[#38BDF8]" />
          <span className="font-semibold uppercase tracking-wider text-[#A0A0B2] text-[10.5px]">
            {cleanLang}
          </span>
        </div>

        <div className="flex items-center gap-1">
          {onApplyToEditor && (
            <button
              type="button"
              onClick={handleApply}
              className="flex items-center gap-1 rounded-[4px] px-2 py-0.5 hover:bg-[#1E1F29] text-[#38BDF8] hover:text-white transition-colors cursor-pointer text-[11px]"
              title="Apply code into active Monaco Editor tab"
            >
              {applied ? (
                <>
                  <Check className="h-3 w-3 text-[#10B981]" />
                  <span className="text-[#10B981] font-medium">Applied</span>
                </>
              ) : (
                <>
                  <Code2 className="h-3 w-3" />
                  <span>Apply to Editor</span>
                </>
              )}
            </button>
          )}

          <button
            type="button"
            onClick={handleCopy}
            className="flex items-center gap-1 rounded-[4px] px-2 py-0.5 hover:bg-[#1E1F29] text-[#9E9EAD] hover:text-white transition-colors cursor-pointer text-[11px]"
            title="Copy code to clipboard"
          >
            {copied ? (
              <>
                <Check className="h-3 w-3 text-[#10B981]" />
                <span className="text-[#10B981]">Copied</span>
              </>
            ) : (
              <>
                <Copy className="h-3 w-3" />
                <span>Copy</span>
              </>
            )}
          </button>

          {isExecutable && onRun && (
            <button
              type="button"
              onClick={() => {
                const runCommand =
                  cleanLang === "python" || cleanLang === "py"
                    ? `python3 -c ${JSON.stringify(code)}`
                    : code;
                onRun(runCommand);
              }}
              className="flex items-center gap-1 rounded-[4px] bg-[#007ACC] px-2.5 py-0.5 text-white hover:bg-[#008BE0] transition-colors cursor-pointer font-medium text-[11px] shadow-sm ml-1"
              title="Run in integrated terminal"
            >
              <Play className="h-2.5 w-2.5 fill-current" />
              <span>Run</span>
            </button>
          )}
        </div>
      </div>

      {/* Code body */}
      <div className="overflow-x-auto p-3 text-[#E2E2EC] leading-[1.6] scrollbar-thin bg-[#0A0B0E]">
        <pre className="font-mono text-[11.5px] whitespace-pre">{code}</pre>
      </div>
    </div>
  );
}
