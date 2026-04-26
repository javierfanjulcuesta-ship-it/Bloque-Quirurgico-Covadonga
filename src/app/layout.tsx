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
  title: "Gestión de Bloque Quirúrgico",
  description: "Gestión del bloque quirúrgico",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#e30613",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={plusJakarta.variable}>
      <body className="min-h-screen bg-white font-sans antialiased">
        <AuthProvider>
          <UsersProvider>
            {children}
          </UsersProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
