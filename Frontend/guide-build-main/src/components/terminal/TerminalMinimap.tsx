import React, { useRef, useEffect, useState, useCallback } from "react";

interface TerminalMinimapProps {
  term: any;
  viewportY: number;
  totalLines: number;
  rows: number;
  cursorBaseY: number;
  onScrollToLine: (line: number) => void;
  width?: number;
}

export function TerminalMinimap({
  term,
  viewportY,
  totalLines,
  rows,
  cursorBaseY,
  onScrollToLine,
  width = 88,
}: TerminalMinimapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [hoverInfo, setHoverInfo] = useState<{ y: number; line: number; text: string } | null>(null);

  // Redraw canvas whenever buffer or scroll changes
  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || !term) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = container.getBoundingClientRect();
    const h = rect.height;
    const w = rect.width;
    if (h === 0 || w === 0) return;

    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
    }

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    // Subtle dark background matching terminal theme
    ctx.fillStyle = "#181818";
    ctx.fillRect(0, 0, w, h);

    const safeTotalLines = Math.max(totalLines, rows, 1);
    // Dynamic line height: compact 4.2px for readable text, scaling smoothly if scrollback is large
    const miniLineH = Math.max(2.0, Math.min(4.5, h / safeTotalLines));

    // Crisp high-DPI mini font for legible miniature text
    ctx.font = "6.5px 'JetBrains Mono', Consolas, monospace";
    ctx.textBaseline = "top";

    for (let i = 0; i < safeTotalLines; i++) {
      let text = "";
      try {
        const lineObj = term?.buffer?.active?.getLine(i);
        text = lineObj ? lineObj.translateToString(true) : "";
      } catch {}

      if (!text || !text.trim()) continue;

      const y = i * miniLineH;
      if (y > h) break;

      const isActiveLine = i === cursorBaseY;

      if (isActiveLine) {
        // Active line subtle orange highlight
        ctx.fillStyle = "rgba(255, 107, 0, 0.22)";
        ctx.fillRect(2, y, w - 4, Math.max(miniLineH, 4));
      }

      const leadingSpaces = text.search(/\S/);
      const indentCount = Math.min(leadingSpaces >= 0 ? leadingSpaces : 0, 14);
      let curX = 6 + indentCount * 2;

      const trimmed = text.trim();
      const isComment =
        trimmed.startsWith("//") ||
        trimmed.startsWith("#") ||
        trimmed.startsWith("/*") ||
        trimmed.startsWith("*") ||
        trimmed.toLowerCase().includes("copyright") ||
        trimmed.toLowerCase().includes("all rights");

      if (isComment) {
        ctx.fillStyle = "#4ADE80"; // Vibrant Green comments
        ctx.fillText(trimmed, curX, y);
        continue;
      }

      // Syntax tokenization for legible colored mini-code
      const tokens = trimmed.split(/(\s+|[(){}[\]=;,><:])/g).filter(Boolean);

      for (const tok of tokens) {
        if (!tok.trim()) {
          curX += tok.length * 3.6;
          continue;
        }

        if (curX >= w - 6) break;

        let tokenColor = "#D4D4D4"; // Default readable text/commands

        if (isActiveLine && (tok.includes(">") || tok.includes("C:\\"))) {
          tokenColor = "#FF6B00"; // Active command prompt orange
        } else if (tok.startsWith("C:\\") || tok.startsWith("PS") || tok.includes(">") || tok.startsWith("$")) {
          tokenColor = "#38BDF8"; // Sky Blue paths & prompts
        } else if (/^(import|export|from|const|let|var|function|return|if|else|class|type|interface|switch|case|break|try|catch|new|for|while|set|doskey|rem)$/i.test(tok)) {
          tokenColor = "#38BDF8"; // Sky Blue keywords
        } else if (/^(true|false|null|undefined|NaN|async|await|default)$/i.test(tok)) {
          tokenColor = "#C084FC"; // Pastel Purple
        } else if (tok.startsWith('"') || tok.startsWith("'") || tok.startsWith('`')) {
          tokenColor = "#FACC15"; // Strings - Yellow
        } else if (/(error|fail|fatal|err|exception)/i.test(tok)) {
          tokenColor = "#F87171"; // Errors - Red
        } else if (/(warn|warning)/i.test(tok)) {
          tokenColor = "#FB923C"; // Warnings - Warm Orange
        } else if (/^[0-9]+(\.[0-9]+)?$/.test(tok)) {
          tokenColor = "#4ADE80"; // Numbers - Green
        } else if (/^--?[a-zA-Z0-9_-]+$/.test(tok)) {
          tokenColor = "#93C5FD"; // CLI Flags
        } else if (/^[A-Z][a-zA-Z0-9_]*$/.test(tok)) {
          tokenColor = "#60A5FA"; // Types / Components
        }

        ctx.fillStyle = tokenColor;
        ctx.fillText(tok, curX, y);
        curX += ctx.measureText(tok).width;
      }
    }

    ctx.restore();
  }, [term, totalLines, rows, cursorBaseY]);

  useEffect(() => {
    renderCanvas();
  }, [renderCanvas, viewportY, totalLines]);

  // Viewport slider calculations
  const safeTotalLines = Math.max(totalLines, rows, 1);
  const containerHeight = containerRef.current?.clientHeight || 400;
  const miniLineH = Math.max(2.0, Math.min(4.5, containerHeight / safeTotalLines));
  const totalMinimapHeight = safeTotalLines * miniLineH;

  let sliderY = 0;
  let sliderHeight = 24;

  if (totalMinimapHeight <= containerHeight) {
    sliderY = viewportY * miniLineH;
    sliderHeight = Math.min(containerHeight, Math.max(24, rows * miniLineH));
  } else {
    sliderY = (viewportY / safeTotalLines) * containerHeight;
    sliderHeight = Math.max(24, (rows / safeTotalLines) * containerHeight);
  }

  // Scroll to mouse position on click or drag
  const handleScrollToMouse = (clientY: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const clickY = clientY - rect.top;

    if (totalMinimapHeight <= containerHeight) {
      const targetLine = Math.floor(clickY / miniLineH);
      onScrollToLine(Math.max(0, targetLine - Math.floor(rows / 2)));
    } else {
      const ratio = Math.max(0, Math.min(1, clickY / rect.height));
      const targetLine = Math.floor(ratio * safeTotalLines);
      onScrollToLine(Math.max(0, targetLine - Math.floor(rows / 2)));
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    handleScrollToMouse(e.clientY);

    const handleMouseMove = (moveEvent: MouseEvent) => {
      handleScrollToMouse(moveEvent.clientY);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!containerRef.current || !term) return;
    const rect = containerRef.current.getBoundingClientRect();
    const mouseY = e.clientY - rect.top;

    let line = 0;
    if (totalMinimapHeight <= containerHeight) {
      line = Math.floor(mouseY / miniLineH);
    } else {
      const ratio = Math.max(0, Math.min(1, mouseY / rect.height));
      line = Math.floor(ratio * safeTotalLines);
    }
    line = Math.max(0, Math.min(safeTotalLines - 1, line));

    let text = "";
    try {
      const lineObj = term?.buffer?.active?.getLine(line);
      text = lineObj ? lineObj.translateToString(true).trim() : "";
    } catch {}

    setHoverInfo({
      y: mouseY,
      line: line + 1,
      text: text || `Line ${line + 1}`,
    });
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    if (term) {
      term.scrollLines(e.deltaY > 0 ? 3 : -3);
    }
  };

  return (
    <div
      ref={containerRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => {
        setIsHovered(false);
        setHoverInfo(null);
      }}
      onWheel={handleWheel}
      className="relative shrink-0 h-full bg-[#181818] select-none cursor-pointer overflow-hidden z-10 border-l border-[#242424] shadow-[-2px_0_6px_rgba(0,0,0,0.2)]"
      style={{ width: `${width}px` }}
      title="Minimap: Drag or click to fast-scroll terminal"
    >
      {/* 1. 2D Canvas rendering miniature readable code */}
      <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none" />

      {/* 2. Viewport Slider - Subtle fabric card feel with soft shadow */}
      <div
        className={`absolute left-0.5 right-0.5 rounded transition-colors pointer-events-none select-none ${
          isDragging || isHovered
            ? "bg-[#383838]/85 shadow-[0_2px_8px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.12)]"
            : "bg-[#2E2E2E]/65 shadow-[0_1px_4px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.06)]"
        }`}
        style={{
          top: `${sliderY}px`,
          height: `${sliderHeight}px`,
        }}
      >
        {/* Subtle orange left indicator accent */}
        <div className="absolute left-0.5 top-1 bottom-1 w-0.5 rounded-full bg-[#FF6B00]/85" />
      </div>

      {/* 3. Hover Line Tooltip Badge */}
      {isHovered && hoverInfo && (
        <div
          className="absolute right-full mr-2 px-2.5 py-1 rounded-lg fabric-card text-[10.5px] font-mono text-[#E0E0E0] pointer-events-none whitespace-nowrap z-50 max-w-xs truncate"
          style={{
            top: `${Math.min(Math.max(hoverInfo.y - 12, 4), containerHeight - 28)}px`,
          }}
        >
          <span className="text-[#FF6B00] font-bold mr-1.5">L{hoverInfo.line}</span>
          <span className="text-[#A0A0A0]">{hoverInfo.text}</span>
        </div>
      )}
    </div>
  );
}
