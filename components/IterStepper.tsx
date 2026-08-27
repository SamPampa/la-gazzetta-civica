import type { IterStep } from '@/src/data/mockActs';

type Props = {
  steps: IterStep[];
};

export function IterStepper({ steps }: Props) {
  return (
    <ol className="flex gap-0 overflow-x-auto rounded-2xl border border-slate-200 bg-slate-50 p-3 sm:p-4">
      {steps.map((step, index) => (
        <li key={step.id} className="flex min-w-[7.5rem] flex-1 items-center">
          <div className="flex flex-col items-center text-center">
            <span
              className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${
                step.status === 'done'
                  ? 'bg-emerald-500 text-white'
                  : step.status === 'current'
                    ? 'bg-blue-600 text-white ring-4 ring-blue-100'
                    : 'bg-white text-slate-400 ring-1 ring-slate-200'
              }`}
            >
              {step.status === 'done' ? '✓' : step.status === 'current' ? '📍' : index + 1}
            </span>
            <span
              className={`mt-2 text-[11px] font-medium leading-tight ${
                step.status === 'current'
                  ? 'text-blue-800'
                  : step.status === 'done'
                    ? 'text-emerald-800'
                    : 'text-slate-400'
              }`}
            >
              {step.label}
            </span>
          </div>
          {index < steps.length - 1 && (
            <span
              className={`mx-1 mb-6 h-px flex-1 ${
                step.status === 'done' ? 'bg-emerald-300' : 'bg-slate-200'
              }`}
            />
          )}
        </li>
      ))}
    </ol>
  );
}
