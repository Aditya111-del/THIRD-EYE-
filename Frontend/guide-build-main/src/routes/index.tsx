import { createFileRoute } from "@tanstack/react-router";
import { MainLayout } from "@/components/layout/MainLayout";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "THIRD EYE — AI-Native Terminal Workspace" },
      { name: "description", content: "Manage SSH, container and local terminal sessions with a built-in AI context assistant." },
      { property: "og:title", content: "THIRD EYE — AI-Native Terminal Workspace" },
      { property: "og:description", content: "Manage SSH, container and local terminal sessions with a built-in AI context assistant." },
    ],
  }),
  component: MainLayout,
});
