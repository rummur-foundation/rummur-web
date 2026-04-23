interface Step {
  number: number;
  label: string;
  sublabel?: string;
}

interface StepIndicatorProps {
  steps: Step[];
  currentStep: number;
}

export function StepIndicator({ steps, currentStep }: StepIndicatorProps) {
  return (
    <div className="flex items-center gap-0">
      {steps.map((step, idx) => (
        <div key={step.number} className="flex items-center">
          <div className="flex flex-col items-center">
            <div
              className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold transition-all duration-300 ${
                step.number < currentStep
                  ? 'bg-xmr-500 text-white'
                  : step.number === currentStep
                  ? 'bg-xmr-500 text-white ring-4 ring-xmr-500/30'
                  : 'bg-zinc-800 text-zinc-500 border border-zinc-700'
              }`}
            >
              {step.number < currentStep ? (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                step.number
              )}
            </div>
            <div className="mt-1.5 text-center">
              <div
                className={`text-xs font-medium ${
                  step.number === currentStep ? 'text-xmr-400' : step.number < currentStep ? 'text-zinc-400' : 'text-zinc-600'
                }`}
              >
                {step.label}
              </div>
              {step.sublabel && (
                <div className="text-[10px] text-zinc-600">{step.sublabel}</div>
              )}
            </div>
          </div>
          {idx < steps.length - 1 && (
            <div
              className={`h-px w-12 sm:w-20 mb-6 mx-1 transition-all duration-300 ${
                step.number < currentStep ? 'bg-xmr-500' : 'bg-zinc-700'
              }`}
            />
          )}
        </div>
      ))}
    </div>
  );
}
