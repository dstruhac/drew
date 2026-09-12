"use client";

import Link from "next/link";
import { useMobileMenuClose } from "@/components/mobile-menu";

// Odkaz uvnitř MobileMenu (Dashboard, Pravidla), který menu při
// kliknutí sám zavře -- viz vysvětlení v mobile-menu.tsx, proč to
// appka nemůže nechat jen na přechodu na jinou stránku.
export function MobileMenuLink({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: React.ReactNode;
}) {
  const close = useMobileMenuClose();

  return (
    <Link href={href} onClick={close} className={className}>
      {children}
    </Link>
  );
}
