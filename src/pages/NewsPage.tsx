import { Newspaper } from "lucide-react";

const NewsPage = () => (
  <div className="min-h-full flex flex-col items-center justify-center p-6 text-center">
    <div className="retro-border bg-card p-8 max-w-sm w-full">
      <Newspaper className="w-10 h-10 text-primary mx-auto mb-3" />
      <h2 className="text-lg mb-1">Football News</h2>
      <p className="text-xs text-muted-foreground uppercase tracking-wider">
        Latest headlines coming soon
      </p>
    </div>
  </div>
);

export default NewsPage;
