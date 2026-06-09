import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { getDevAuth } from "@/lib/dev-auth";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "TMCP Counsel Connections",
  description:
    "Manage attorney-company interview scheduling for the Texas Minority Counsel Program",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const page = (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );

  // DEV_AUTH local bypass: no Clerk keys available, so skip the provider.
  if (getDevAuth()) return page;

  return <ClerkProvider>{page}</ClerkProvider>;
}
