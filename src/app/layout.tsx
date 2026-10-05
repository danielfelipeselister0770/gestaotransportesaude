import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'Gestão Transporte Saúde', description: 'Gestão municipal de transporte em saúde' };
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="pt-BR"><body>{children}</body></html>}
