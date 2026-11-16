/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment */
import { useState, useCallback, useMemo } from 'react';
import { toast } from 'sonner';

export interface ValidationRule {
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  pattern?: RegExp;
  custom?: (value: any) => string | null;
}

export interface FieldValidation {
  [fieldName: string]: ValidationRule;
}

export interface ValidationErrors {
  [fieldName: string]: string;
}

export function useFormValidation<T extends Record<string, any>>(
  initialValues: T,
  validationRules: FieldValidation,
) {
  const [values, setValues] = useState<T>(initialValues);
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  // Validate single field
  const validateField = useCallback(
    (fieldName: string, value: any): string | null => {
      const rules = validationRules[fieldName];
      if (!rules) return null;

      // Required check
      if (rules.required) {
        if (value === '' || value === null || value === undefined) {
          return 'This field is required';
        }
        if (Array.isArray(value) && value.length === 0) {
          return 'Please select at least one option';
        }
      }

      // Skip other validations if empty and not required
      if (!rules.required && (value === '' || value === null || value === undefined)) {
        return null;
      }

      // Min length check
      if (rules.minLength && String(value).length < rules.minLength) {
        return `Minimum ${rules.minLength} characters required`;
      }

      // Max length check
      if (rules.maxLength && String(value).length > rules.maxLength) {
        return `Maximum ${rules.maxLength} characters allowed`;
      }

      // Pattern check
      if (rules.pattern && !rules.pattern.test(String(value))) {
        return 'Invalid format';
      }

      // Custom validation
      if (rules.custom) {
        return rules.custom(value);
      }

      return null;
    },
    [validationRules],
  );

  // Validate all fields
  const validateAll = useCallback((): boolean => {
    const newErrors: ValidationErrors = {};
    let isValid = true;

    Object.keys(validationRules).forEach((fieldName) => {
      const error = validateField(fieldName, values[fieldName]);
      if (error) {
        newErrors[fieldName] = error;
        isValid = false;
      }
    });

    setErrors(newErrors);

    if (!isValid) {
      toast.error('Please fix the errors before proceeding', {
        description: `${Object.keys(newErrors).length} field(s) need your attention`,
      });
    }

    return isValid;
  }, [values, validateField, validationRules]);

  // Handle field change with instant validation
  const handleChange = useCallback(
    (fieldName: string, value: any) => {
      setValues((prev) => ({ ...prev, [fieldName]: value }));

      // Validate instantly if field was touched
      if (touched[fieldName]) {
        const error = validateField(fieldName, value);
        setErrors((prev) => ({
          ...prev,
          [fieldName]: error || '',
        }));
      }
    },
    [touched, validateField],
  );

  // Handle field blur
  const handleBlur = useCallback(
    (fieldName: string) => {
      setTouched((prev) => ({ ...prev, [fieldName]: true }));

      // Validate on blur
      const error = validateField(fieldName, values[fieldName]);
      setErrors((prev) => ({
        ...prev,
        [fieldName]: error || '',
      }));
    },
    [values, validateField],
  );

  // Clear specific field error
  const clearError = useCallback((fieldName: string) => {
    setErrors((prev) => {
      const newErrors = { ...prev };
      delete newErrors[fieldName];
      return newErrors;
    });
  }, []);

  // Reset form
  const reset = useCallback(() => {
    setValues(initialValues);
    setErrors({});
    setTouched({});
  }, [initialValues]);

  // Get field props for easy binding
  const getFieldProps = useCallback(
    (fieldName: string) => ({
      value: (values[fieldName] as string | number | readonly string[] | undefined) ?? '',
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
        handleChange(fieldName, e.target.value),
      onBlur: () => handleBlur(fieldName),
      error: errors[fieldName],
      touched: touched[fieldName],
    }),
    [values, errors, touched, handleChange, handleBlur],
  );

  // Check if form has any errors
  const hasErrors = useMemo(() => Object.keys(errors).some((key) => errors[key]), [errors]);

  // Count incomplete required fields
  const incompleteCount = useMemo(() => {
    return Object.keys(validationRules).filter((fieldName) => {
      const rules = validationRules[fieldName];
      if (!rules?.required) return false;

      const value = values[fieldName];
      return value === '' || value === null || value === undefined || (Array.isArray(value) && value.length === 0);
    }).length;
  }, [validationRules, values]);

  return {
    values,
    errors,
    touched,
    setValues,
    handleChange,
    handleBlur,
    clearError,
    validateField,
    validateAll,
    reset,
    getFieldProps,
    hasErrors,
    incompleteCount,
  };
}
