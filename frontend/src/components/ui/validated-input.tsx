import * as React from 'react';
import { AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ValidatedInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  touched?: boolean;
  required?: boolean;
  helperText?: string;
  icon?: React.ReactNode;
}

export const ValidatedInput = React.forwardRef<HTMLInputElement, ValidatedInputProps>(
  ({ className, label, error, touched, required, helperText, icon, ...props }, ref) => {
    const hasError = touched && error;

    return (
      <div className="space-y-1.5">
        {/* Label */}
        <label htmlFor={props.id || props.name} className="block text-sm font-medium text-slate-700">
          {label}
          {required && <span className="ml-1 text-red-600">*</span>}
        </label>

        {/* Input Container */}
        <div className="relative">
          {icon && <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">{icon}</div>}
          
          <input
            ref={ref}
            className={cn(
              'flex h-10 w-full rounded-lg border bg-white px-3 py-2 text-sm transition-colors',
              'placeholder:text-slate-400',
              'focus:outline-none focus:ring-2',
              'disabled:cursor-not-allowed disabled:opacity-50',
              icon && 'pl-10',
              hasError
                ? 'border-red-500 text-red-900 focus:border-red-500 focus:ring-red-200'
                : 'border-slate-300 focus:border-emerald-500 focus:ring-emerald-200',
              className,
            )}
            aria-invalid={hasError ? 'true' : 'false'}
            aria-describedby={hasError ? `${props.name}-error` : undefined}
            {...props}
          />

          {/* Error Icon */}
          {hasError && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <AlertCircle className="h-4 w-4 text-red-500" />
            </div>
          )}
        </div>

        {/* Helper Text or Error Message */}
        {hasError ? (
          <p id={`${props.name}-error`} className="flex items-start gap-1 text-xs text-red-600">
            <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
            <span>{error}</span>
          </p>
        ) : helperText ? (
          <p className="text-xs text-slate-500">{helperText}</p>
        ) : null}
      </div>
    );
  },
);

ValidatedInput.displayName = 'ValidatedInput';
