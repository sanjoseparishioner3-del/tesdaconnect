import * as React from 'react';
import { AlertCircle, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ValidatedSelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  error?: string;
  touched?: boolean;
  required?: boolean;
  helperText?: string;
  options: Array<{ value: string; label: string }>;
  placeholder?: string;
}

export const ValidatedSelect = React.forwardRef<HTMLSelectElement, ValidatedSelectProps>(
  ({ className, label, error, touched, required, helperText, options, placeholder, ...props }, ref) => {
    const hasError = touched && error;

    return (
      <div className="space-y-1.5">
        {/* Label */}
        <label htmlFor={props.id || props.name} className="block text-sm font-medium text-slate-700">
          {label}
          {required && <span className="ml-1 text-red-600">*</span>}
        </label>

        {/* Select Container */}
        <div className="relative">
          <select
            ref={ref}
            className={cn(
              'flex h-10 w-full appearance-none rounded-lg border bg-white px-3 py-2 pr-10 text-sm transition-colors',
              'focus:outline-none focus:ring-2',
              'disabled:cursor-not-allowed disabled:opacity-50',
              hasError
                ? 'border-red-500 text-red-900 focus:border-red-500 focus:ring-red-200'
                : 'border-slate-300 focus:border-emerald-500 focus:ring-emerald-200',
              className,
            )}
            aria-invalid={hasError ? 'true' : 'false'}
            aria-describedby={hasError ? `${props.name}-error` : undefined}
            {...props}
          >
            {placeholder && (
              <option value="" disabled>
                {placeholder}
              </option>
            )}
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          {/* Dropdown Icon or Error Icon */}
          <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
            {hasError ? (
              <AlertCircle className="h-4 w-4 text-red-500" />
            ) : (
              <ChevronDown className="h-4 w-4 text-slate-400" />
            )}
          </div>
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

ValidatedSelect.displayName = 'ValidatedSelect';
