import { Link } from "wouter";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gray-50">
      <div className="text-center bg-white p-12 rounded-3xl shadow-xl shadow-black/5 border border-border max-w-md w-full mx-4">
        <div className="w-20 h-20 bg-destructive/10 text-destructive rounded-full flex items-center justify-center mx-auto mb-6">
          <span className="text-3xl font-bold font-display">404</span>
        </div>
        <h1 className="text-2xl font-display font-bold text-foreground mb-2">Página no encontrada</h1>
        <p className="text-muted-foreground mb-8">
          Lo sentimos, la página que buscas no existe o ha sido movida.
        </p>
        <Link href="/" className="inline-flex items-center justify-center px-6 py-3 rounded-xl font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors w-full">
          Volver al Inicio
        </Link>
      </div>
    </div>
  );
}
