import { Bookmark } from "lucide-react";

import { FeedList } from "@/components/FeedList";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/States";

export default function Bookmarks() {
  return (
    <div>
      <PageHeader title="Bookmarks" subtitle="Only you can see these." />
      <FeedList filter="bookmarks" empty={<EmptyState icon={<Bookmark className="h-5 w-5" />} title="No bookmarks yet" body="Tap the bookmark icon on any post to save it here." />} />
    </div>
  );
}
