import { BellRing } from 'lucide-react';
import AlertasPanel from '@/components/AlertasPanel';

export default function AlertasPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="lg:pl-10">
        <h1 className="flex items-center gap-3 text-2xl font-bold text-white">
          <BellRing className="h-6 w-6 text-red-400" /> Alertas
        </h1>
        <p className="mt-1 text-xs text-white/60">
          Proyectos atrasados, entregas de los próximos 2 días, proyectos casi listos y áreas que terminaron hoy.
        </p>
      </div>
      <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5 backdrop-blur-xl sm:p-6">
        <AlertasPanel />
      </div>
    </div>
  );
}
