import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
import { UsersProvider } from "@/context/UsersContext";

const plusJakarta = Plus_Jakarta_Sans({
  variable: "--font-ribera-sans",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Bloque Quirúrgico Covadonga | Grupo Ribera",
  description: "Gestión del bloque quirúrgico - Grupo Ribera",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#c41e3a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={plusJakarta.variable}>
      <body className="min-h-screen bg-gray-50 font-sans antialiased">
        <AuthProvider>
          <UsersProvider>
            {children}
          </UsersProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
