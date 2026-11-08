import { type ReactElement } from "react";

export interface FolderIconProps {
  name: string;
  isOpen?: boolean;
}

/**
 * Modern VS Code / Material style folder icon with distinctive badges
 * matching the VS Code tree aesthetic in Screenshot 2
 */
export function ModernFolderIcon({ name, isOpen = false }: FolderIconProps): ReactElement {
  const lower = name.toLowerCase();

  // Base folder icon (sleek blue-slate outline with subtle fill)
  const baseFolder = (
    <svg
      width="15"
      height="15"
      viewBox="0 0 16 16"
      fill="none"
      className={isOpen ? "shrink-0 text-[#6099D6]" : "shrink-0 text-[#4F8CC9]"}
    >
      {isOpen ? (
        <path
          d="M1.5 2.5h4l1.5 1.5h7.5v2h-12.5v-3.5zm13 4l-1.5 6.5h-11.5l1.5-6.5h11.5z"
          stroke="currentColor"
          strokeWidth="1.1"
          strokeLinejoin="round"
          fill="currentColor"
          fillOpacity="0.18"
        />
      ) : (
        <path
          d="M1.5 2.5h4l1.5 1.5h7.5v8.5a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1v-10z"
          stroke="currentColor"
          strokeWidth="1.1"
          strokeLinejoin="round"
          fill="currentColor"
          fillOpacity="0.12"
        />
      )}
    </svg>
  );

  // Special folder badge overlays
  if (lower === ".vscode") {
    return (
      <span className="relative inline-flex items-center justify-center shrink-0">
        {baseFolder}
        <span className="absolute bottom-0 right-0 h-1.5 w-1.5 rounded-full bg-[#007ACC] shadow-[0_0_3px_#007ACC]" />
      </span>
    );
  }

  if (lower === "src" || lower === "source") {
    return (
      <span className="relative inline-flex items-center justify-center shrink-0">
        {baseFolder}
        <span className="absolute -bottom-0.5 right-0 text-[7px] font-mono font-bold text-[#FF9E4A] leading-none select-none">
          &lt;&gt;
        </span>
      </span>
    );
  }

  if (lower === "dist" || lower === "build" || lower === ".output" || lower === "out") {
    return (
      <span className="relative inline-flex items-center justify-center shrink-0">
        {baseFolder}
        <span className="absolute bottom-0 right-0 h-1.5 w-1.5 rounded-sm bg-[#A855F7]" />
      </span>
    );
  }

  if (lower === "lib" || lower === "libs") {
    return (
      <span className="relative inline-flex items-center justify-center shrink-0">
        {baseFolder}
        <span className="absolute bottom-0 right-0 h-1.5 w-1.5 rounded-full bg-[#C084FC]" />
      </span>
    );
  }

  if (lower === "bin") {
    return (
      <span className="relative inline-flex items-center justify-center shrink-0">
        {baseFolder}
        <span className="absolute bottom-0 right-0 h-1.5 w-1.5 rounded-full bg-[#22C55E]" />
      </span>
    );
  }

  if (lower === "context" || lower === "store" || lower === "state") {
    return (
      <span className="relative inline-flex items-center justify-center shrink-0">
        {baseFolder}
        <span className="absolute bottom-0 right-0 h-1.5 w-1.5 rounded-full bg-[#E879F9]" />
      </span>
    );
  }

  if (lower === "core" || lower === "kernel") {
    return (
      <span className="relative inline-flex items-center justify-center shrink-0">
        {baseFolder}
        <span className="absolute bottom-0 right-0 h-1.5 w-1.5 rounded-full bg-[#38BDF8]" />
      </span>
    );
  }

  if (lower === "tools" || lower === "scripts" || lower === "utils") {
    return (
      <span className="relative inline-flex items-center justify-center shrink-0">
        {baseFolder}
        <span className="absolute bottom-0 right-0 h-1.5 w-1.5 rounded-full bg-[#C084FC]" />
      </span>
    );
  }

  if (lower === ".agents" || lower === "agents") {
    return (
      <span className="relative inline-flex items-center justify-center shrink-0">
        {baseFolder}
        <span className="absolute bottom-0 right-0 h-1.5 w-1.5 rounded-full bg-[#38BDF8]" />
      </span>
    );
  }

  if (lower === ".third-eye") {
    return (
      <span className="relative inline-flex items-center justify-center shrink-0">
        {baseFolder}
        <span className="absolute bottom-0 right-0 h-1.5 w-1.5 rounded-full bg-[#F59E0B]" />
      </span>
    );
  }

  if (lower === "node_modules") {
    return (
      <span className="relative inline-flex items-center justify-center shrink-0">
        {baseFolder}
        <span className="absolute -bottom-0.5 right-0 text-[6.5px] font-mono font-bold text-[#38BDF8] bg-[#0284C7]/20 px-0.5 rounded-[2px] leading-tight select-none">
          npm
        </span>
      </span>
    );
  }

  if (lower === "components" || lower === "widgets") {
    return (
      <span className="relative inline-flex items-center justify-center shrink-0">
        {baseFolder}
        <span className="absolute bottom-0 right-0 h-1.5 w-1.5 rounded-sm bg-[#3B82F6]" />
      </span>
    );
  }

  if (lower === "assets" || lower === "public" || lower === "images" || lower === "media") {
    return (
      <span className="relative inline-flex items-center justify-center shrink-0">
        {baseFolder}
        <span className="absolute bottom-0 right-0 h-1.5 w-1.5 rounded-full bg-[#F59E0B]" />
      </span>
    );
  }

  if (lower === "electron") {
    return (
      <span className="relative inline-flex items-center justify-center shrink-0">
        {baseFolder}
        <span className="absolute bottom-0 right-0 h-1.5 w-1.5 rounded-full bg-[#00D8FF]" />
      </span>
    );
  }

  return baseFolder;
}

/**
 * Modern VS Code file icon matching Screenshot 2
 */
export function ModernFileIcon({ name }: { name: string }): ReactElement {
  const lower = name.toLowerCase();

  // package.json (Teal/Emerald Hexagon)
  if (lower === "package.json") {
    return (
      <svg
        width="14"
        height="14"
        viewBox="0 0 16 16"
        fill="none"
        className="shrink-0 text-[#29B6AF]"
      >
        <polygon
          points="8,1 15,5 15,11 8,15 1,11 1,5"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinejoin="round"
          fill="currentColor"
          fillOpacity="0.15"
        />
        <path
          d="M8,1 L8,15 M1,5 L15,11 M15,5 L1,11"
          stroke="currentColor"
          strokeWidth="0.8"
          strokeOpacity="0.6"
        />
      </svg>
    );
  }

  // tsconfig.json (Blue TS with gear)
  if (lower.startsWith("tsconfig") && lower.endsWith(".json")) {
    return (
      <span className="relative inline-flex items-center shrink-0">
        <span className="text-[#3178C6] font-bold text-[10px] font-mono tracking-tighter select-none">
          TS
        </span>
        <span className="text-[7.5px] text-[#3178C6] -ml-0.5 select-none">⚙</span>
      </span>
    );
  }

  // package-lock.json
  if (lower === "package-lock.json") {
    return (
      <span className="text-[#F59E0B] font-bold text-[11px] font-mono select-none">
        &#123;&#125;
      </span>
    );
  }

  // Markdown
  if (lower.endsWith(".md")) {
    return (
      <span className="text-[#42A5F5] font-bold text-[10.5px] font-mono select-none">
        M↓
      </span>
    );
  }

  // Git files
  if (lower === ".gitignore" || lower === ".gitattributes" || lower === ".gitmodules") {
    return (
      <svg
        width="13"
        height="13"
        viewBox="0 0 16 16"
        fill="currentColor"
        className="shrink-0 text-[#F05032]"
      >
        <path d="M15.7 7.3l-7-7c-.4-.4-1-.4-1.4 0l-7 7c-.4.4-.4 1 0 1.4l7 7c.4.4 1 .4 1.4 0l7-7c.4-.4.4-1 0-1.4zM8.7 10.7V9.4c-1.8.1-2.9.8-3.7 2.1-.2.3-.6.1-.5-.2.5-2 1.7-3.6 4.2-3.8V6.2l2.6 2.2-2.6 2.3z" />
      </svg>
    );
  }

  // Environment files
  if (lower.startsWith(".env")) {
    return <span className="text-[#FF9800] text-[11px] font-bold select-none">⚙</span>;
  }

  // Scripts (.sh, .bat, .ps1)
  if (lower.endsWith(".bat") || lower.endsWith(".ps1") || lower.endsWith(".sh")) {
    return (
      <span className="text-[#4CAF50] font-bold text-[10.5px] font-mono select-none">
        &gt;_
      </span>
    );
  }

  // Extension based
  const ext = name.split(".").pop()?.toLowerCase() || "";
  switch (ext) {
    case "ts":
      return (
        <span className="text-[#3178C6] font-bold text-[10.5px] font-mono tracking-tighter shrink-0 select-none">
          TS
        </span>
      );
    case "tsx":
      return (
        <span className="text-[#00D8FF] font-bold text-[10.5px] font-mono tracking-tighter shrink-0 select-none">
          ⚛
        </span>
      );
    case "js":
      return (
        <span className="text-[#F7DF1E] font-bold text-[10.5px] font-mono tracking-tighter shrink-0 select-none">
          JS
        </span>
      );
    case "jsx":
      return (
        <span className="text-[#F7DF1E] font-bold text-[10.5px] font-mono tracking-tighter shrink-0 select-none">
          ⚛
        </span>
      );
    case "json":
      return (
        <span className="text-[#CBCB41] font-bold text-[11px] font-mono shrink-0 select-none">
          &#123;&#125;
        </span>
      );
    case "html":
      return (
        <span className="text-[#E44D26] font-bold text-[10.5px] font-mono shrink-0 select-none">
          &lt;&gt;
        </span>
      );
    case "css":
    case "scss":
    case "sass":
    case "less":
      return (
        <span className="text-[#42A5F5] font-bold text-[11.5px] font-mono shrink-0 select-none">
          #
        </span>
      );
    case "svg":
    case "png":
    case "jpg":
    case "jpeg":
    case "gif":
    case "webp":
    case "ico":
      return (
        <svg
          width="13"
          height="13"
          viewBox="0 0 16 16"
          fill="currentColor"
          className="shrink-0 text-[#C084FC]"
        >
          <path d="M14 2H2a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V3a1 1 0 0 0-1-1zm-1 10H3l3.5-4.5 2.5 3 2-2.5 2 4zm0-6.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0z" />
        </svg>
      );
    case "py":
      return (
        <span className="text-[#3572A5] font-bold text-[10px] font-mono shrink-0 select-none">
          Py
        </span>
      );
    case "rs":
      return (
        <span className="text-[#DEA584] font-bold text-[10px] font-mono shrink-0 select-none">
          Rs
        </span>
      );
    case "go":
      return (
        <span className="text-[#00ACD7] font-bold text-[10px] font-mono shrink-0 select-none">
          Go
        </span>
      );
    default:
      return (
        <svg
          width="13"
          height="13"
          viewBox="0 0 16 16"
          fill="none"
          className="text-[#888888] shrink-0"
        >
          <path
            d="M3 2h7l3 3v9H3V2zm6.5 0.5V5H12l-2.5-2.5zM4 3v10h8V6H9V3H4z"
            fill="currentColor"
          />
        </svg>
      );
  }
}

