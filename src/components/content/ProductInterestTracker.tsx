"use client";

import type { ReactNode } from "react";
import { registerProductInterest } from "@/app/(app)/content/actions";

type Props = { productId: string; contentId: string; children: ReactNode; className?: string };

// Envolve um ProductCard: ao clicar, registra interesse (product_interest, origem content_link)
// sem bloquear a navegação do link.
export function ProductInterestTracker({ productId, contentId, children, className }: Props) {
  return (
    <div
      className={className}
      onClickCapture={() => {
        void registerProductInterest({ productId, contentId });
      }}
    >
      {children}
    </div>
  );
}
