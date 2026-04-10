import { Newspaper } from "lucide-react";

const NewsPage = () => (
  <div className="min-h-full flex flex-col items-center justify-center p-6 text-center">
    <div className="rounded-2xl border border-border bg-card p-8 max-w-sm w-full shadow-sm">
      <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
        <Newspaper className="w-7 h-7 text-primary" />
      </div>
      <h2 className="text-xl font-bold mb-2">Football News</h2>
      <p className="text-sm text-muted-foreground">
        Latest headlines coming soon
      </p>
    </div>
  </div>
);

export default NewsPage;
