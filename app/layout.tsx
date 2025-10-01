
import "../styles/globals.css";
import type { Metadata } from "next";
export const metadata: Metadata = { title: "Bushi Admin", description: "Barbershop Admin Panel" };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (<html lang="en"><body>{children}</body></html>);
}
