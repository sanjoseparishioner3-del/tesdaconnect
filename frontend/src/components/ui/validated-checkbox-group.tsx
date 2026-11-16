import { AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface CheckboxOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface ValidatedCheckboxGroupProps {
  label: string;
  name: string;
  options: CheckboxOption[];
  value: string[];
  onChange: (value: string[]) => void;
  onBlur?: () => void;
  error?: string;
  touched?: boolean;
  required?: boolean;
  helperText?: string;
  columns?: 1 | 2 | 3;
  className?: string;
}

export function ValidatedCheckboxGroup({
  label,
  name,
  options,
  value = [],
  onChange,
  onBlur,
  error,
  touched,
  required,
  helperText,
  columns = 2,
  className,
}: ValidatedCheckboxGroupProps) {
  const hasError = touched && error;

  const handleCheckboxChange = (optionValue: string, checked: boolean) => {
    const newValue = checked
      ? [...value, optionValue]
      : value.filter((v) => v !== optionValue);
    onChange(newValue);
  };

  const gridCols = {
    1: 'grid-cols-1',
    2: 'sm:grid-cols-2',
    3: 'sm:grid-cols-2 lg:grid-cols-3',
  };

  return (
    <div className={cn('space-y-2', className)}>
      {/* Label */}
      <label className="block text-sm font-medium text-slate-700">
        {label}
        {required && <span className="ml-1 text-red-600">*</span>}
      </label>

      {/* Checkbox Grid */}
      <div
        className={cn(
          'grid gap-2',
          gridCols[columns],
          hasError && 'rounded-lg border-2 border-red-500 p-3',
        )}
        onBlur={onBlur}
      >
        {options.map((option) => {
          const isChecked = value.includes(option.value);
          const checkboxId = `${name}-${option.value}`;

          return (
            <label
              key={option.value}
              htmlFor={checkboxId}
              className={cn(
                'flex items-center gap-2.5 rounded-lg border p-3 transition-all cursor-pointer',
                'hover:bg-slate-50',
                isChecked
                  ? 'border-emerald-600 bg-emerald-50'
                  : hasError
                    ? 'border-red-200 bg-red-50/30'
                    : 'border-slate-200 bg-white',
                option.disabled && 'cursor-not-allowed opacity-50',
              )}
            >
              <input
                type="checkbox"
                id={checkboxId}
                name={name}
                value={option.value}
                checked={isChecked}
                onChange={(e) => handleCheckboxChange(option.value, e.target.checked)}
                disabled={option.disabled}
                className={cn(
                  'h-4 w-4 shrink-0 rounded border-slate-300 text-emerald-600',
                  'focus:ring-2 focus:ring-emerald-200 focus:ring-offset-0',
                  hasError && 'border-red-500',
                )}
              />
              <span className="text-sm font-medium text-slate-700">{option.label}</span>
            </label>
          );
        })}
      </div>

      {/* Helper Text or Error Message */}
      {hasError ? (
        <p className="flex items-start gap-1 text-xs text-red-600">
          <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
          <span>{error}</span>
        </p>
      ) : helperText ? (
        <p className="text-xs text-slate-500">{helperText}</p>
      ) : null}

      {/* Selected Count */}
      {value.length > 0 && (
        <p className="text-xs text-slate-600">
          {value.length} selected
        </p>
      )}
    </div>
  );
}
