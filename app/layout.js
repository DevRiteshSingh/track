import "./globals.css";

export const metadata = {
  title: "RECOMP — Your personal health dashboard",
  description: "A private, local-first dashboard for nutrition, training, recovery and body recomposition.",
};

// Keeps mobile Safari/Chrome from letting people pinch-zoom the layout out of
// alignment, and respects notches/home-indicators via safe-area insets in the CSS.
export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}