// Esqueleto do feed: dois posts no formato final (herói, capa 4:5, legenda) para não haver salto.
export function FeedSkeleton() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-8">
      {[0, 1].map((i) => (
        <div key={i} className="flex flex-col">
          <div className="flex items-center gap-3 px-gutter py-3 md:px-0">
            <span className="size-8 animate-pulse rounded-full bg-surface-elevated" />
            <span className="h-3 w-28 animate-pulse rounded bg-surface-elevated" />
          </div>
          <div className="aspect-[4/5] animate-pulse bg-surface-elevated md:rounded-lg" />
          <div className="flex flex-col gap-2 px-gutter pt-3 md:px-0">
            <span className="h-3 w-16 animate-pulse rounded bg-surface-elevated" />
            <span className="h-4 w-3/4 animate-pulse rounded bg-surface-elevated" />
          </div>
        </div>
      ))}
    </div>
  );
}
