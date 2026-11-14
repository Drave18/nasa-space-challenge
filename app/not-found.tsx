import Link from 'next/link';

export default function NotFound() {
  return (
    <main style={{ padding: '4rem 2rem', maxWidth: 520 }}>
      <h1>Mission not found</h1>
      <p>No mission lives at this address.</p>
      <Link href="/">Back to the gallery</Link>
    </main>
  );
}
