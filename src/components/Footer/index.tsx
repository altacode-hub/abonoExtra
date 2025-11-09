export default function Footer() {
  return (
    <footer className="mt-10 border-t">
      <div className="mx-auto max-w-6xl p-4 text-sm text-secondary">
        © {new Date().getFullYear()} Abono Extra — Sistema de missões extras
      </div>
    </footer>
  );
}