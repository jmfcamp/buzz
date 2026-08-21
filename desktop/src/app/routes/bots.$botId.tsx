import { createFileRoute, redirect } from "@tanstack/react-router";

import { botsDirectorySearch } from "@/features/community-bots/lib/directory";

export const Route = createFileRoute("/bots/$botId")({
  beforeLoad: ({ params }) => {
    throw redirect({
      replace: true,
      search: botsDirectorySearch(params.botId),
      to: "/bots",
    });
  },
});
