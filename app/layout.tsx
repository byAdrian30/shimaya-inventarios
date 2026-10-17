import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {title: "Shimaya Ramen | Control de inventarios", description: "Stock diario, pedidos por área y despacho de insumos para Shimaya Ramen.", icons: {icon: "/favicon.svg"}};
export default function RootLayout({children}: {children: React.ReactNode}) {return <html lang="es"><body>{children}</body></html>}
